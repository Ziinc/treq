-- Profiles table: extends auth.users
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Desktop auth tokens: one-time tokens for desktop sign-in handoff
create table public.desktop_auth_tokens (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  token text unique not null,
  used boolean default false,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

alter table public.desktop_auth_tokens enable row level security;

create policy "Users can create own tokens"
  on public.desktop_auth_tokens for insert
  with check (auth.uid() = user_id);

create policy "Users can view own tokens"
  on public.desktop_auth_tokens for select
  using (auth.uid() = user_id and used = false and expires_at > now());

-- Index for token lookup
create index idx_desktop_auth_tokens_token on public.desktop_auth_tokens (token);
create index idx_desktop_auth_tokens_expires on public.desktop_auth_tokens (expires_at);

-- RPC: create a one-time desktop auth token (5-minute expiry)
create or replace function public.create_desktop_token()
returns text
language plpgsql
security definer
as $$
declare
  new_token text;
begin
  new_token := gen_random_uuid()::text;
  insert into public.desktop_auth_tokens (user_id, token, expires_at)
  values (auth.uid(), new_token, now() + interval '5 minutes');
  return new_token;
end;
$$;
