-- Regression test for the vault-permission bug fixed in
-- 013_subscriptions_security_definer.sql: public.subscriptions used to run
-- its Stripe FDW lookup as the invoking role, which fails with "permission
-- denied for schema vault" for every real (authenticated) caller. The fix
-- moved the lookup into a security definer function owned by postgres, with
-- the view as a thin security_invoker wrapper — so it must never be granted
-- broad vault access to authenticated/anon directly.
begin;
select plan(6);

select is_definer('public', 'get_current_user_subscription', 'get_current_user_subscription() is security definer');

select is(
  (select r.rolname from pg_proc p join pg_roles r on r.oid = p.proowner
   where p.oid = 'public.get_current_user_subscription()'::regprocedure),
  'postgres',
  'get_current_user_subscription() is owned by postgres (so it runs with vault access)'
);

select function_privs_are('public', 'get_current_user_subscription', array[]::text[], 'anon', array[]::text[],
  'anon has no privileges on get_current_user_subscription');
select function_privs_are('public', 'get_current_user_subscription', array[]::text[], 'authenticated', array['EXECUTE'],
  'authenticated can execute get_current_user_subscription');
select function_privs_are('public', 'get_current_user_subscription', array[]::text[], 'service_role', array['EXECUTE'],
  'service_role can execute get_current_user_subscription');

-- No role, including authenticated, should ever need direct vault access
-- just to read their own subscription -- that table holds every secret in
-- the project in cleartext, not just the Stripe key.
select ok(
  not has_schema_privilege('authenticated', 'vault', 'USAGE'),
  'authenticated has no USAGE on schema vault'
);

select * from finish();
rollback;
