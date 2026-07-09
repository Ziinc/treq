-- Public view: simplified subscription info via Stripe FDW
-- Uses treq_internal.stripe_subscriptions and treq_internal.stripe_customers FDW tables.
-- Auto-discovers the Stripe customer by matching email when no local mapping exists
-- (i.e. after a Payment Link purchase).
-- Returns one row for the current authenticated user.
create view public.subscriptions with (security_barrier) as
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
