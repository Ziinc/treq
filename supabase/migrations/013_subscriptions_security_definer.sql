-- public.subscriptions queries treq_internal.stripe_customers, whose Stripe
-- FDW handler is not `security definer` and fetches the API key from
-- vault.decrypted_secrets under the *invoking* role. A plain view only
-- elevates privileges for the tables it names directly, not for what an FDW
-- handler does internally — so querying the view as `authenticated` fails
-- with "permission denied for schema vault" (confirmed against the local
-- stack). The fix is not to grant `authenticated` access to
-- vault.decrypted_secrets: that table holds every secret in the project in
-- cleartext, not just the Stripe key. Instead, move the Stripe lookup into a
-- `security definer` function that runs as its owner (postgres, which has
-- vault access), and make the view a thin wrapper over it.
create or replace function public.get_current_user_subscription()
returns table (
  plan text,
  status text,
  current_period_end timestamp
)
language sql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.get_current_user_subscription() from public, anon;
grant execute on function public.get_current_user_subscription() to authenticated, service_role;

create or replace view public.subscriptions with (security_invoker = true) as
select * from public.get_current_user_subscription();

grant select on public.subscriptions to authenticated;
