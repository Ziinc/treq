-- reserve_next_merge_queue_lane used `delete from _reserved_entries` with no
-- WHERE clause. Local Supabase (supautils) rejects unrestricted DELETEs, so
-- every queue.drive failed with "DELETE requires a WHERE clause" and lanes
-- never started. Qualify the temp table and add a tautological WHERE.

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

  select coalesce(max(lane_number), 0) + 1 into v_lane_number
  from public.ci_runs
  where queue_id = p_queue_id and status in ('pending', 'running');

  select head_sha into v_expected_base_sha
  from public.ci_runs
  where queue_id = p_queue_id and status in ('pending', 'running')
  order by lane_number desc
  limit 1;

  create temp table if not exists _reserved_entries (
    entry_id uuid,
    pr_number int,
    pr_sha text,
    pr_title text,
    entry_order int
  ) on commit drop;
  delete from pg_temp._reserved_entries where true;

  insert into pg_temp._reserved_entries
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

  if not exists (select 1 from pg_temp._reserved_entries) then
    return null;
  end if;

  insert into public.ci_runs (queue_id, entry_ids, head_sha, test_branch, lane_number, status)
  values (
    p_queue_id,
    array(select entry_id from pg_temp._reserved_entries order by entry_order),
    coalesce(v_expected_base_sha, ''),
    '',
    v_lane_number,
    'pending'
  )
  returning id into v_ci_run_id;

  update public.ci_runs
  set test_branch = 'treq/merge-queue/' || p_queue_id || '/' || v_ci_run_id
  where id = v_ci_run_id;

  insert into public.ci_run_entries (ci_run_id, entry_id, entry_order, tested_head_sha)
  select v_ci_run_id, entry_id, entry_order, pr_sha
  from pg_temp._reserved_entries;

  update public.merge_queue_entries
  set status = 'testing', updated_at = now()
  where id in (select entry_id from pg_temp._reserved_entries);

  select jsonb_agg(
    jsonb_build_object(
      'entryId', entry_id,
      'pullRequestNumber', pr_number,
      'headSha', pr_sha,
      'title', pr_title,
      'order', entry_order
    ) order by entry_order
  ) into v_entries
  from pg_temp._reserved_entries;

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

revoke all on function public.reserve_next_merge_queue_lane(uuid, uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.reserve_next_merge_queue_lane(uuid, uuid, uuid, int) to service_role;
