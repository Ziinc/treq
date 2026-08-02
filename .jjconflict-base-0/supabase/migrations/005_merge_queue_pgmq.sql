-- PGMQ infrastructure for the asynchronous merge queue.
--
-- Architecture rule: PGMQ messages represent work that must be *attempted*.
-- The domain tables (merge_queues, merge_queue_entries, ci_runs, ...) remain
-- the authoritative state. Messages are ephemeral commands and must be
-- reconstructable from domain state.
--
-- None of the objects created here are reachable from browser clients:
-- queue access goes through service-role-only SECURITY DEFINER wrappers, and
-- every new table has RLS enabled with no anon/authenticated policies.

create extension if not exists pgmq;

-- Queue creation is idempotent across PGMQ versions: newer versions no-op on
-- an existing queue, older ones raise duplicate_table.
do $$
begin
  perform pgmq.create('merge_queue_commands');
exception
  when duplicate_table then null;
end $$;

do $$
begin
  perform pgmq.create('merge_queue_dead_letters');
exception
  when duplicate_table then null;
end $$;

-- ── Service-role-only PGMQ wrappers ──────────────────────────────────────────
-- The pgmq schema is not exposed through PostgREST, so Edge Functions reach it
-- through these public wrappers. Execution is revoked from anon/authenticated.

create or replace function public.merge_queue_send(
  p_queue_name text,
  p_message jsonb,
  p_delay_seconds int default 0
)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select pgmq.send(p_queue_name, p_message, p_delay_seconds);
$$;

create or replace function public.merge_queue_read(
  p_queue_name text,
  p_vt_seconds int,
  p_batch_size int
)
returns table (
  msg_id bigint,
  read_ct int,
  enqueued_at timestamptz,
  vt timestamptz,
  message jsonb
)
language sql
security definer
set search_path = ''
as $$
  select msg_id, read_ct, enqueued_at, vt, message
  from pgmq.read(p_queue_name, p_vt_seconds, p_batch_size);
$$;

create or replace function public.merge_queue_archive(
  p_queue_name text,
  p_msg_id bigint
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select pgmq.archive(p_queue_name, p_msg_id);
$$;

create or replace function public.merge_queue_delete(
  p_queue_name text,
  p_msg_id bigint
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select pgmq.delete(p_queue_name, p_msg_id);
$$;

-- Reschedule an in-flight message by moving its visibility timeout.
create or replace function public.merge_queue_set_vt(
  p_queue_name text,
  p_msg_id bigint,
  p_vt_seconds int
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select msg_id is not null
  from pgmq.set_vt(p_queue_name, p_msg_id, p_vt_seconds);
$$;

create or replace function public.merge_queue_metrics()
returns table (
  queue_name text,
  queue_length bigint,
  oldest_msg_age_sec int,
  total_messages bigint
)
language sql
security definer
set search_path = ''
as $$
  select queue_name, queue_length, oldest_msg_age_sec, total_messages
  from pgmq.metrics_all()
  where queue_name in ('merge_queue_commands', 'merge_queue_dead_letters');
$$;

revoke all on function public.merge_queue_send(text, jsonb, int) from public, anon, authenticated;
revoke all on function public.merge_queue_read(text, int, int) from public, anon, authenticated;
revoke all on function public.merge_queue_archive(text, bigint) from public, anon, authenticated;
revoke all on function public.merge_queue_delete(text, bigint) from public, anon, authenticated;
revoke all on function public.merge_queue_set_vt(text, bigint, int) from public, anon, authenticated;
revoke all on function public.merge_queue_metrics() from public, anon, authenticated;
grant execute on function public.merge_queue_send(text, jsonb, int) to service_role;
grant execute on function public.merge_queue_read(text, int, int) to service_role;
grant execute on function public.merge_queue_archive(text, bigint) to service_role;
grant execute on function public.merge_queue_delete(text, bigint) to service_role;
grant execute on function public.merge_queue_set_vt(text, bigint, int) to service_role;
grant execute on function public.merge_queue_metrics() to service_role;

-- ── Webhook receipts (GitHub delivery deduplication + ingestion audit) ───────

create table public.github_webhook_receipts (
  delivery_id text primary key,
  event_name text not null,
  action text,
  installation_id bigint,
  repository_id bigint,
  payload_hash text not null,
  received_at timestamptz not null default now(),
  accepted_at timestamptz,
  command_ids uuid[] not null default '{}',
  processing_error text
);

alter table public.github_webhook_receipts enable row level security;

create index idx_webhook_receipts_received_at
  on public.github_webhook_receipts (received_at);

-- ── Command executions (per-command idempotency + audit) ─────────────────────

create table public.merge_queue_command_executions (
  command_id uuid primary key,
  message_id bigint,
  command_type text not null,
  queue_id uuid,
  operation_key text,
  status text not null check (
    status in ('processing', 'succeeded', 'retryable_failed', 'terminal_failed')
  ),
  attempt_count integer not null default 1,
  worker_id uuid not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text,
  result jsonb
);

alter table public.merge_queue_command_executions enable row level security;

-- A logical operation (e.g. merge-pr:{repo}:{pr}:{sha}) may only succeed once.
create unique index merge_queue_operation_once
  on public.merge_queue_command_executions (operation_key)
  where operation_key is not null and status = 'succeeded';

create index idx_mq_cmd_exec_queue on public.merge_queue_command_executions (queue_id, started_at);

-- ── Per-queue execution leases ────────────────────────────────────────────────
-- A persisted lease (not an advisory lock) because orchestration spans GitHub
-- network calls that outlive any single database transaction.

create table public.merge_queue_execution_leases (
  queue_id uuid primary key references public.merge_queues(id) on delete cascade,
  lease_token uuid not null,
  worker_id uuid not null,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.merge_queue_execution_leases enable row level security;

create or replace function public.acquire_merge_queue_lease(
  p_queue_id uuid,
  p_worker_id uuid,
  p_ttl_seconds int
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid := gen_random_uuid();
  v_existing public.merge_queue_execution_leases;
begin
  select * into v_existing
  from public.merge_queue_execution_leases
  where queue_id = p_queue_id
  for update;

  if not found then
    insert into public.merge_queue_execution_leases (queue_id, lease_token, worker_id, expires_at)
    values (p_queue_id, v_token, p_worker_id, now() + make_interval(secs => p_ttl_seconds))
    on conflict (queue_id) do nothing;
    if not found then
      -- Concurrent insert won the race.
      return null;
    end if;
    return v_token;
  end if;

  -- Same worker re-acquiring, or the previous holder's lease expired.
  if v_existing.worker_id = p_worker_id or v_existing.expires_at < now() then
    update public.merge_queue_execution_leases
    set lease_token = v_token,
        worker_id = p_worker_id,
        acquired_at = now(),
        expires_at = now() + make_interval(secs => p_ttl_seconds)
    where queue_id = p_queue_id;
    return v_token;
  end if;

  return null;
end;
$$;

create or replace function public.renew_merge_queue_lease(
  p_queue_id uuid,
  p_lease_token uuid,
  p_ttl_seconds int
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  update public.merge_queue_execution_leases
  set expires_at = now() + make_interval(secs => p_ttl_seconds)
  where queue_id = p_queue_id
    and lease_token = p_lease_token
    and expires_at >= now()
  returning true;
$$;

create or replace function public.release_merge_queue_lease(
  p_queue_id uuid,
  p_lease_token uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  delete from public.merge_queue_execution_leases
  where queue_id = p_queue_id
    and lease_token = p_lease_token
  returning true;
$$;

revoke all on function public.acquire_merge_queue_lease(uuid, uuid, int) from public, anon, authenticated;
revoke all on function public.renew_merge_queue_lease(uuid, uuid, int) from public, anon, authenticated;
revoke all on function public.release_merge_queue_lease(uuid, uuid) from public, anon, authenticated;
grant execute on function public.acquire_merge_queue_lease(uuid, uuid, int) to service_role;
grant execute on function public.renew_merge_queue_lease(uuid, uuid, int) to service_role;
grant execute on function public.release_merge_queue_lease(uuid, uuid) to service_role;

-- A lane whose entries have all been merged into the target branch is
-- 'merged' — distinct from 'passed' (CI green, still waiting on lower lanes).
alter type public.ci_run_status add value if not exists 'merged';

-- ── Relational CI-run membership ─────────────────────────────────────────────
-- Replaces ci_runs.entry_ids uuid[] as the source of truth for lane
-- membership. entry_ids continues to be written for the compatibility read
-- path used by existing RPCs (get_workspace_queue_status).

create table public.ci_run_entries (
  ci_run_id uuid not null references public.ci_runs(id) on delete cascade,
  entry_id uuid not null references public.merge_queue_entries(id) on delete cascade,
  entry_order integer not null,
  tested_head_sha text not null,
  primary key (ci_run_id, entry_id)
);

alter table public.ci_run_entries enable row level security;

create policy "Users can view CI run entries of own queues"
  on public.ci_run_entries for select
  using (
    exists (
      select 1
      from public.ci_runs c
      join public.merge_queues q on q.id = c.queue_id
      join public.github_repositories r on r.id = q.repo_id
      join public.github_app_installations i on i.id = r.installation_id
      where c.id = ci_run_id and i.linked_user_id = auth.uid()
    )
  );

create index idx_ci_run_entries_entry on public.ci_run_entries (entry_id);

-- ── Atomic queue helpers ─────────────────────────────────────────────────────

-- Queue lookup/creation without the application-side insert/retry race.
create or replace function public.get_or_create_merge_queue(
  p_repo_id bigint,
  p_target_branch text
)
returns public.merge_queues
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue public.merge_queues;
begin
  insert into public.merge_queues (repo_id, target_branch)
  values (p_repo_id, p_target_branch)
  on conflict (repo_id, target_branch) do nothing;

  select * into v_queue
  from public.merge_queues
  where repo_id = p_repo_id and target_branch = p_target_branch;

  return v_queue;
end;
$$;

-- Atomic position assignment: locks the queue row instead of computing
-- max(position) + 1 in application code.
create or replace function public.enqueue_merge_queue_entry(
  p_queue_id uuid,
  p_pr_number int,
  p_pr_sha text,
  p_pr_title text,
  p_pr_author text,
  p_branch_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_position int;
  v_entry_id uuid;
begin
  perform 1 from public.merge_queues where id = p_queue_id for update;
  if not found then
    raise exception 'queue % not found', p_queue_id;
  end if;

  select coalesce(max(position), 0) + 1 into v_position
  from public.merge_queue_entries
  where queue_id = p_queue_id
    and status in ('queued', 'testing', 'merging');

  insert into public.merge_queue_entries as mqe
    (queue_id, pr_number, pr_sha, pr_title, pr_author, branch_name, position, status)
  values
    (p_queue_id, p_pr_number, p_pr_sha, p_pr_title, p_pr_author, p_branch_name, v_position, 'queued')
  on conflict (queue_id, pr_number) do update set
    pr_sha = excluded.pr_sha,
    pr_title = excluded.pr_title,
    pr_author = excluded.pr_author,
    branch_name = excluded.branch_name,
    -- Re-queueing a finished entry moves it to the back; an active entry
    -- keeps its position.
    position = case
      when mqe.status in ('queued', 'testing', 'merging') then mqe.position
      else excluded.position
    end,
    status = 'queued',
    failure_reason = null,
    updated_at = now()
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;

-- Atomically reserve the next CI lane for a queue. Requires a valid execution
-- lease so only the lease-holding worker can reserve.
create or replace function public.reserve_next_merge_queue_lane(
  p_queue_id uuid,
  p_worker_id uuid,
  p_lease_token uuid,
  p_batch_size_override int default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue public.merge_queues;
  v_config record;
  v_batch_size int;
  v_max_lanes int;
  v_active_count int;
  v_lane_number int;
  v_expected_base_sha text;
  v_ci_run_id uuid;
  v_entries jsonb;
begin
  -- Lease check
  perform 1
  from public.merge_queue_execution_leases
  where queue_id = p_queue_id
    and lease_token = p_lease_token
    and worker_id = p_worker_id
    and expires_at >= now();
  if not found then
    raise exception 'merge queue lease invalid or expired for queue %', p_queue_id
      using errcode = '55006';
  end if;

  select * into v_queue from public.merge_queues where id = p_queue_id for update;
  if not found or v_queue.paused then
    return null;
  end if;

  select
    coalesce(c.batch_size, 5) as batch_size,
    coalesce(c.max_parallel_queues, 1) as max_parallel_queues,
    coalesce(c.enabled, true) as enabled
  into v_config
  from (select 1) as one
  left join public.merge_queue_configs c
    on c.repo_id = v_queue.repo_id and c.target_branch = v_queue.target_branch;

  if not v_config.enabled then
    return null;
  end if;

  v_batch_size := coalesce(
    p_batch_size_override,
    case when v_queue.bisect_mode then 1 else v_config.batch_size end
  );
  v_max_lanes := v_config.max_parallel_queues;

  select count(*) into v_active_count
  from public.ci_runs
  where queue_id = p_queue_id and status in ('pending', 'running');

  if v_active_count >= v_max_lanes then
    return null;
  end if;

  -- Next lane number and optimistic base: build on the highest active lane.
  select coalesce(max(lane_number), 0) + 1 into v_lane_number
  from public.ci_runs
  where queue_id = p_queue_id and status in ('pending', 'running');

  select head_sha into v_expected_base_sha
  from public.ci_runs
  where queue_id = p_queue_id and status in ('pending', 'running')
  order by lane_number desc
  limit 1;

  -- Deterministic selection of the next batch of queued entries.
  create temp table if not exists _reserved_entries (
    entry_id uuid,
    pr_number int,
    pr_sha text,
    pr_title text,
    entry_order int
  ) on commit drop;
  delete from _reserved_entries;

  insert into _reserved_entries
  select locked.id, locked.pr_number, locked.pr_sha, locked.pr_title,
         row_number() over (order by locked.position, locked.enqueued_at, locked.pr_number)
  from (
    select e.id, e.pr_number, e.pr_sha, e.pr_title, e.position, e.enqueued_at
    from public.merge_queue_entries e
    where e.queue_id = p_queue_id
      and e.status = 'queued'
      and not exists (
        select 1
        from public.ci_run_entries cre
        join public.ci_runs c on c.id = cre.ci_run_id
        where cre.entry_id = e.id and c.status in ('pending', 'running')
      )
    order by e.position, e.enqueued_at, e.pr_number
    limit v_batch_size
    for update skip locked
  ) locked;

  if not exists (select 1 from _reserved_entries) then
    return null;
  end if;

  insert into public.ci_runs (queue_id, entry_ids, head_sha, test_branch, lane_number, status)
  values (
    p_queue_id,
    array(select entry_id from _reserved_entries order by entry_order),
    coalesce(v_expected_base_sha, ''),
    '',
    v_lane_number,
    'pending'
  )
  returning id into v_ci_run_id;

  -- Deterministic branch name derived from queue + run identity.
  update public.ci_runs
  set test_branch = 'treq/merge-queue/' || p_queue_id || '/' || v_ci_run_id
  where id = v_ci_run_id;

  insert into public.ci_run_entries (ci_run_id, entry_id, entry_order, tested_head_sha)
  select v_ci_run_id, entry_id, entry_order, pr_sha
  from _reserved_entries;

  update public.merge_queue_entries
  set status = 'testing', updated_at = now()
  where id in (select entry_id from _reserved_entries);

  select jsonb_agg(
    jsonb_build_object(
      'entryId', entry_id,
      'pullRequestNumber', pr_number,
      'headSha', pr_sha,
      'title', pr_title,
      'order', entry_order
    ) order by entry_order
  ) into v_entries
  from _reserved_entries;

  return jsonb_build_object(
    'ciRunId', v_ci_run_id,
    'queueId', p_queue_id,
    'laneNumber', v_lane_number,
    'targetBranch', v_queue.target_branch,
    'expectedBaseSha', v_expected_base_sha,
    'testBranch', 'treq/merge-queue/' || p_queue_id || '/' || v_ci_run_id,
    'entries', v_entries
  );
end;
$$;

revoke all on function public.get_or_create_merge_queue(bigint, text) from public, anon, authenticated;
revoke all on function public.enqueue_merge_queue_entry(uuid, int, text, text, text, text) from public, anon, authenticated;
revoke all on function public.reserve_next_merge_queue_lane(uuid, uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.get_or_create_merge_queue(bigint, text) to service_role;
grant execute on function public.enqueue_merge_queue_entry(uuid, int, text, text, text, text) to service_role;
grant execute on function public.reserve_next_merge_queue_lane(uuid, uuid, uuid, int) to service_role;

-- ── Observability ─────────────────────────────────────────────────────────────

create or replace view public.merge_queue_stuck_ci_runs
with (security_invoker = true)
as
select c.id, c.queue_id, c.test_branch, c.lane_number, c.status, c.started_at
from public.ci_runs c
where c.status in ('pending', 'running')
  and c.started_at < now() - interval '2 hours';

create or replace view public.merge_queue_command_failures
with (security_invoker = true)
as
select command_id, command_type, queue_id, status, attempt_count, last_error, started_at, completed_at
from public.merge_queue_command_executions
where status in ('retryable_failed', 'terminal_failed');
