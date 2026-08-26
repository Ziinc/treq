-- Regression test for the Supabase `auth_users_exposed` lint finding:
-- public.subscriptions used to join auth.users directly. It now sources
-- from a security definer function that joins public.profiles instead.
-- The pg_depend check below mirrors how the linter itself detects exposure
-- (a public-schema view with a dependency edge to auth.users), so this
-- fails the same way the lint would if the join ever comes back.
begin;
select plan(4);

select has_view('public', 'subscriptions', 'public.subscriptions view exists');

select ok(
  not exists (
    select 1
    from pg_rewrite rw
    join pg_depend d on d.objid = rw.oid and d.refobjid = 'auth.users'::regclass
    where rw.ev_class = 'public.subscriptions'::regclass
  ),
  'public.subscriptions has no pg_depend edge to auth.users (auth_users_exposed check)'
);

select ok(
  position('auth.users' in pg_get_viewdef('public.subscriptions'::regclass)) = 0,
  'public.subscriptions view definition does not mention auth.users'
);

select ok(
  position('auth.users' in pg_get_functiondef('public.get_current_user_subscription()'::regprocedure)) = 0,
  'get_current_user_subscription() body does not mention auth.users'
);

select * from finish();
rollback;
