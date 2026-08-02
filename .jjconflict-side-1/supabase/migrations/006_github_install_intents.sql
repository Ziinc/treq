-- Secure GitHub App installation linking.
--
-- The previous flow let any authenticated browser claim any installation by
-- calling link_github_installation(installation_id). Linking now requires a
-- server-side intent created before the GitHub install redirect and verified
-- (single-use, unexpired, same user) when GitHub calls back, together with an
-- app-authenticated lookup of the installation on GitHub's side.

create table public.github_install_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

alter table public.github_install_intents enable row level security;
-- No policies: only service-role Edge Functions touch intents.

create index idx_install_intents_user on public.github_install_intents (user_id, created_at);

-- Browser-callable linking is removed; complete-github-installation (Edge
-- Function, service role) performs the link inside the verified intent flow.
drop function if exists public.link_github_installation(bigint);
