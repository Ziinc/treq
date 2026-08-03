-- Per-repo merge queue opt-in, read and written by the desktop app.
--
-- merge_queue_configs already carries an `enabled` flag, but a repo that has
-- never been configured has no row at all. The desktop app treats "no row" as
-- OFF: the merge queue has to be explicitly turned on for a repo before any
-- branch can be enqueued. The column default stays true so that a config row
-- created by other tooling (webhooks, dashboard) keeps its previous meaning --
-- these RPCs always write `enabled` explicitly.

-- Is the merge queue turned on for this repo?
-- Returns false when the repo has no config row, is unknown to us, or is not
-- accessible to the calling user.
create or replace function public.get_merge_queue_enabled(
  p_repo_full_name text
)
returns boolean
language sql
security definer
as $$
  select coalesce(
    (
      select c.enabled
      from public.merge_queue_configs c
      join public.github_repositories r
        on r.id = c.repo_id
      join public.github_app_installations i
        on i.id = r.installation_id
      where r.full_name = p_repo_full_name
        and c.target_branch = r.default_branch
        and i.linked_user_id = auth.uid()
      limit 1
    ),
    false
  );
$$;

-- Turn the merge queue on or off for a repo, creating the config row on first
-- enable. Raises when the repo is not one the caller can administer, so the
-- desktop app can surface "install the GitHub App first" rather than silently
-- no-op.
create or replace function public.set_merge_queue_enabled(
  p_repo_full_name text,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_repo_id bigint;
  v_default_branch text;
begin
  select r.id, coalesce(r.default_branch, 'main')
    into v_repo_id, v_default_branch
  from public.github_repositories r
  join public.github_app_installations i
    on i.id = r.installation_id
  where r.full_name = p_repo_full_name
    and i.linked_user_id = auth.uid()
  limit 1;

  if v_repo_id is null then
    raise exception 'Repository % is not linked to a GitHub App installation for this account', p_repo_full_name
      using errcode = 'no_data_found';
  end if;

  insert into public.merge_queue_configs (repo_id, target_branch, enabled)
  values (v_repo_id, v_default_branch, p_enabled)
  on conflict (repo_id, target_branch)
  do update set enabled = excluded.enabled, updated_at = now();

  return p_enabled;
end;
$$;

grant execute on function public.get_merge_queue_enabled(text) to authenticated;
grant execute on function public.set_merge_queue_enabled(text, boolean) to authenticated;

-- The merge queue tab lists entries as pull requests, so the per-repo listing
-- RPC has to return the PR number alongside the branch.
drop function if exists public.get_repo_branch_queue_statuses(text);

create function public.get_repo_branch_queue_statuses(
  p_repo_full_name text
)
returns table (
  branch_name text,
  pr_number int,
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
