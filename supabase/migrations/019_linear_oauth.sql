-- Linear OAuth token storage for pro tier users
--
-- Access tokens are sensitive and never returned to the client. RLS prevents
-- the public role from reading; only service-role Edge Functions can fetch
-- the token for proxying requests.

create table public.linear_oauth_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

alter table public.linear_oauth_intents enable row level security;
-- No policies: only service-role Edge Functions touch intents.

create index idx_linear_intents_user on public.linear_oauth_intents (user_id, created_at);

create table public.linear_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  linear_workspace_id text not null,
  linear_workspace_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.linear_oauth_tokens enable row level security;
-- No public access to tokens. Service-role Edge Functions use service role key.
