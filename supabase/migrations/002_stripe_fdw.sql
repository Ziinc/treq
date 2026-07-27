-- Stripe FDW setup + public.subscriptions view
-- Foreign tables live in treq_internal (not exposed via PostgREST).

create extension if not exists wrappers with schema extensions;

-- Handlers live in `extensions`; migration search_path often omits it.
do $$
begin
  if not exists (
    select 1 from pg_foreign_data_wrapper where fdwname = 'stripe_wrapper'
  ) then
    create foreign data wrapper stripe_wrapper
      handler extensions.stripe_fdw_handler
      validator extensions.stripe_fdw_validator;
  end if;
end $$;

-- Vault secret for the Stripe server (api_key_name = 'stripe').
-- Local: placeholder so migrations apply without a live key.
-- Production: update vault.secrets name='stripe' with the real secret key.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'stripe') then
    perform vault.create_secret(
      'sk_test_placeholder',
      'stripe',
      'Stripe API key for Wrappers'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_foreign_server where srvname = 'stripe_server') then
    create server stripe_server
      foreign data wrapper stripe_wrapper 
      options (api_key_name 'stripe');
  end if;
end $$;

create schema if not exists treq_internal;

do $$
begin
  if to_regclass('treq_internal.stripe_customers') is null then
    create foreign table treq_internal.stripe_customers (
      id text,
      email text,
      name text,
      description text,
      created timestamp,
      attrs jsonb
    )
      server stripe_server
      options (
        object 'customers',
        rowid_column 'id'
      );
  end if;

  if to_regclass('treq_internal.stripe_subscriptions') is null then
    create foreign table treq_internal.stripe_subscriptions (
      id text,
      customer text,
      currency text,
      current_period_start timestamp,
      current_period_end timestamp,
      attrs jsonb
    )
      server stripe_server
      options (
        object 'subscriptions',
        rowid_column 'id'
      );
  end if;
end $$;

revoke all on schema treq_internal from public, anon, authenticated;

-- Public view: simplified subscription info via Stripe FDW
-- Uses treq_internal.stripe_subscriptions and treq_internal.stripe_customers FDW tables.
-- Auto-discovers the Stripe customer by matching email when no local mapping exists
-- (i.e. after a Payment Link purchase).
-- Returns one row for the current authenticated user.
create or replace view public.subscriptions with (security_barrier) as
with customer as (
  select c.id
  from treq_internal.stripe_customers c
  join auth.users u on c.email = u.email
  where u.id = auth.uid()
  limit 1
),
active_sub as (
  select
    s.attrs->>'status' as raw_status,
    s.current_period_end,
    coalesce((s.attrs->>'cancel_at_period_end')::boolean, false) as cancel_at_period_end
  from treq_internal.stripe_subscriptions s
  join customer c on s.customer = c.id
  where s.attrs->>'status' in ('active', 'trialing', 'past_due')
  order by s.current_period_end desc
  limit 1
)
select
  case when a.raw_status is not null then 'pro' else 'free' end as plan,
  case
    when a.raw_status is null then 'inactive'
    when a.cancel_at_period_end then 'canceled'
    else a.raw_status
  end as status,
  a.current_period_end
from (select 1) as _
left join active_sub a on true;

-- Grant authenticated users access to the view
grant select on public.subscriptions to authenticated;
