-- GitHub App installations (one per org/user that installs the app)
create table public.github_app_installations (
  id bigint primary key,  -- GitHub's installation_id
  account_login text not null,
  account_type text not null check (account_type in ('User', 'Organization')),
  account_avatar_url text,
  app_id int not null,
  linked_user_id uuid references auth.users(id) on delete set null,
  suspended_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.github_app_installations enable row level security;

create policy "Users can view own installations"
  on public.github_app_installations for select
  using (linked_user_id = auth.uid());

-- Repos accessible under each installation
create table public.github_repositories (
  id bigint primary key,  -- GitHub's repo_id
  installation_id bigint references public.github_app_installations(id) on delete cascade not null,
  owner text not null,
  name text not null,
  full_name text not null,
  private boolean default false,
  default_branch text default 'main',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.github_repositories enable row level security;

create policy "Users can view repos of own installations"
  on public.github_repositories for select
  using (
    exists (
      select 1 from public.github_app_installations i
      where i.id = installation_id and i.linked_user_id = auth.uid()
    )
  );

-- Per-repo merge queue configuration (one per target branch per repo)
create table public.merge_queue_configs (
  id uuid primary key default gen_random_uuid(),
  repo_id bigint references public.github_repositories(id) on delete cascade not null,
  target_branch text not null default 'main',
  required_checks text[] not null default array[]::text[],
  max_parallel_queues int not null default 1 check (max_parallel_queues between 1 and 10),
  batch_size int not null default 5 check (batch_size between 1 and 20),
  merge_method text not null default 'squash' check (merge_method in ('merge', 'squash', 'rebase')),
  queue_trigger_label text not null default 'merge-queue',
  delete_branch_on_merge boolean not null default true,
  enabled boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(repo_id, target_branch)
);

alter table public.merge_queue_configs enable row level security;

create policy "Users can manage configs of own repos"
  on public.merge_queue_configs for all
  using (
    exists (
      select 1
      from public.github_repositories r
      join public.github_app_installations i on i.id = r.installation_id
      where r.id = repo_id and i.linked_user_id = auth.uid()
    )
  );

-- Active queues (one per repo × target branch)
create table public.merge_queues (
  id uuid primary key default gen_random_uuid(),
  repo_id bigint references public.github_repositories(id) on delete cascade not null,
  target_branch text not null,
  paused boolean not null default false,
  -- Set to true after a batch CI failure; forces batch_size=1 until cleared
  bisect_mode boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(repo_id, target_branch)
);

alter table public.merge_queues enable row level security;

create policy "Users can view and manage queues of own repos"
  on public.merge_queues for all
  using (
    exists (
      select 1
      from public.github_repositories r
      join public.github_app_installations i on i.id = r.installation_id
      where r.id = repo_id and i.linked_user_id = auth.uid()
    )
  );

-- Individual PRs in a queue
create type public.merge_queue_entry_status as enum (
  'queued',
  'testing',
  'merging',
  'merged',
  'failed',
  'dequeued'
);

create table public.merge_queue_entries (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references public.merge_queues(id) on delete cascade not null,
  pr_number int not null,
  pr_sha text not null,
  pr_title text,
  pr_author text,
  position int not null,
  status public.merge_queue_entry_status not null default 'queued',
  failure_reason text,
  enqueued_at timestamptz default now(),
  updated_at timestamptz default now(),
  merged_at timestamptz,
  unique(queue_id, pr_number)
);

alter table public.merge_queue_entries enable row level security;

create policy "Users can view entries of own queues"
  on public.merge_queue_entries for select
  using (
    exists (
      select 1
      from public.merge_queues q
      join public.github_repositories r on r.id = q.repo_id
      join public.github_app_installations i on i.id = r.installation_id
      where q.id = queue_id and i.linked_user_id = auth.uid()
    )
  );

-- CI batch runs triggered by the queue for each parallel lane
create type public.ci_run_status as enum (
  'pending',
  'running',
  'passed',
  'failed',
  'cancelled'
);

create table public.ci_runs (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references public.merge_queues(id) on delete cascade not null,
  entry_ids uuid[] not null default array[]::uuid[],
  head_sha text not null,
  test_branch text not null,
  lane_number int not null default 1,
  status public.ci_run_status not null default 'pending',
  check_suite_id bigint,
  conclusion text,
  started_at timestamptz default now(),
  completed_at timestamptz,
  created_at timestamptz default now()
);

alter table public.ci_runs enable row level security;

create policy "Users can view CI runs of own queues"
  on public.ci_runs for select
  using (
    exists (
      select 1
      from public.merge_queues q
      join public.github_repositories r on r.id = q.repo_id
      join public.github_app_installations i on i.id = r.installation_id
      where q.id = queue_id and i.linked_user_id = auth.uid()
    )
  );

-- Indexes for common query patterns
create index idx_mq_entries_queue_status on public.merge_queue_entries (queue_id, status);
create index idx_mq_entries_position on public.merge_queue_entries (queue_id, position);
create index idx_ci_runs_queue_lane on public.ci_runs (queue_id, lane_number);
create index idx_ci_runs_head_sha on public.ci_runs (head_sha);
create index idx_ci_runs_check_suite on public.ci_runs (check_suite_id);
create index idx_gh_repos_full_name on public.github_repositories (full_name);
create index idx_gh_repos_installation on public.github_repositories (installation_id);

-- RPC: link a GitHub App installation to the current user (called after OAuth callback)
create or replace function public.link_github_installation(p_installation_id bigint)
returns void
language plpgsql
security definer
as $$
begin
  update public.github_app_installations
  set linked_user_id = auth.uid(), updated_at = now()
  where id = p_installation_id;
end;
$$;

-- RPC: queue status summary for the dashboard
create or replace function public.get_repo_queue_status(p_repo_id bigint)
returns table (
  queue_id uuid,
  target_branch text,
  queued_count bigint,
  testing_count bigint,
  paused boolean,
  bisect_mode boolean
)
language sql
security definer
as $$
  select
    q.id,
    q.target_branch,
    count(e.id) filter (where e.status = 'queued') as queued_count,
    count(e.id) filter (where e.status = 'testing') as testing_count,
    q.paused,
    q.bisect_mode
  from public.merge_queues q
  left join public.merge_queue_entries e
    on e.queue_id = q.id and e.status not in ('merged', 'failed', 'dequeued')
  where q.repo_id = p_repo_id
    and exists (
      select 1
      from public.github_repositories r
      join public.github_app_installations i on i.id = r.installation_id
      where r.id = q.repo_id and i.linked_user_id = auth.uid()
    )
  group by q.id, q.target_branch, q.paused, q.bisect_mode;
$$;
