-- Add branch_name to merge_queue_entries for workspace-side lookups
alter table public.merge_queue_entries
  add column if not exists branch_name text;

create index if not exists idx_mq_entries_branch
  on public.merge_queue_entries (queue_id, branch_name);

-- RPC: queue status for a single workspace branch (used by the desktop app)
create or replace function public.get_workspace_queue_status(
  p_repo_full_name text,
  p_branch_name text
)
returns table (
  entry_id uuid,
  pr_number int,
  status text,
  position int,
  target_branch text,
  lane_number int,
  ci_run_status text,
  failure_reason text,
  enqueued_at timestamptz,
  merged_at timestamptz
)
language sql
security definer
as $$
  select
    e.id                         as entry_id,
    e.pr_number,
    e.status::text,
    e.position,
    q.target_branch,
    cr.lane_number,
    cr.status::text              as ci_run_status,
    e.failure_reason,
    e.enqueued_at,
    e.merged_at
  from public.merge_queue_entries e
  join public.merge_queues q
    on q.id = e.queue_id
  join public.github_repositories r
    on r.id = q.repo_id
  join public.github_app_installations i
    on i.id = r.installation_id
  left join lateral (
    select c.lane_number, c.status
    from public.ci_runs c
    where c.queue_id = q.id
      and c.entry_ids @> array[e.id]
      and c.status in ('pending', 'running', 'passed')
    order by c.created_at desc
    limit 1
  ) cr on true
  where r.full_name = p_repo_full_name
    and e.branch_name = p_branch_name
    and e.status::text not in ('dequeued')
    and i.linked_user_id = auth.uid()
  order by e.enqueued_at desc
  limit 1;
$$;

-- RPC: all active entries for a repo, indexed by branch_name (used by the sidebar)
create or replace function public.get_repo_branch_queue_statuses(
  p_repo_full_name text
)
returns table (
  branch_name text,
  status text,
  position int,
  target_branch text
)
language sql
security definer
as $$
  select
    e.branch_name,
    e.status::text,
    e.position,
    q.target_branch
  from public.merge_queue_entries e
  join public.merge_queues q
    on q.id = e.queue_id
  join public.github_repositories r
    on r.id = q.repo_id
  join public.github_app_installations i
    on i.id = r.installation_id
  where r.full_name = p_repo_full_name
    and e.status::text not in ('failed', 'dequeued')
    and e.branch_name is not null
    and i.linked_user_id = auth.uid();
$$;
