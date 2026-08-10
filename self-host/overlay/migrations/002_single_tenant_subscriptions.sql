-- Single-tenant subscriptions (replaces Stripe FDW in self-hosted installs).
-- Every authenticated user is treated as an active pro subscriber for the
-- lifetime of this tenant. There is no billing integration.

create schema if not exists treq_internal;

create table if not exists treq_internal.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create or replace view public.subscriptions
with (security_barrier) as
select
  'pro'::text as plan,
  'active'::text as status,
  null::timestamptz as current_period_end
where auth.uid() is not null;

grant select on public.subscriptions to authenticated;
