-- Fix: public.subscriptions referenced auth.users directly, which trips the
-- Supabase linter's auth_users_exposed check (any public-schema view that
-- depends on auth.users is flagged, regardless of which columns it selects).
-- profiles.email already mirrors auth.users.email for the same row, so join
-- against public.profiles instead — no functional change for callers.
create or replace view public.subscriptions with (security_barrier) as
with customer as (
  select c.id
  from treq_internal.stripe_customers c
  join public.profiles p on c.email = p.email
  where p.id = auth.uid()
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

grant select on public.subscriptions to authenticated;
