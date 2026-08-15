-- Include PR title in queue status rows so the default-branch tip marker
-- can show the landed PR title next to the branch label.
drop function if exists public.get_repo_branch_queue_statuses(text);

create function public.get_repo_branch_queue_statuses(
  p_repo_full_name text
)
returns table (
  branch_name text,
  pr_number int,
  pr_title text,
  status text,
  "position" int,
  target_branch text
)
language sql
security definer
as $$
  select
    e.branch_name,
    e.pr_number,
    e.pr_title,
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
