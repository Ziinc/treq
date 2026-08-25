-- Every app table must have RLS enabled, so a blanket grant like
-- 008_public_grants.sql (select/insert/update/delete to anon, authenticated)
-- can never be the only thing standing between a client and the data.
begin;
select plan(13);

select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'RLS enabled on public.profiles');
select ok((select relrowsecurity from pg_class where oid = 'public.desktop_auth_tokens'::regclass),
  'RLS enabled on public.desktop_auth_tokens');
select ok((select relrowsecurity from pg_class where oid = 'public.github_app_installations'::regclass),
  'RLS enabled on public.github_app_installations');
select ok((select relrowsecurity from pg_class where oid = 'public.github_repositories'::regclass),
  'RLS enabled on public.github_repositories');
select ok((select relrowsecurity from pg_class where oid = 'public.merge_queue_configs'::regclass),
  'RLS enabled on public.merge_queue_configs');
select ok((select relrowsecurity from pg_class where oid = 'public.merge_queues'::regclass),
  'RLS enabled on public.merge_queues');
select ok((select relrowsecurity from pg_class where oid = 'public.merge_queue_entries'::regclass),
  'RLS enabled on public.merge_queue_entries');
select ok((select relrowsecurity from pg_class where oid = 'public.ci_runs'::regclass),
  'RLS enabled on public.ci_runs');
select ok((select relrowsecurity from pg_class where oid = 'public.github_webhook_receipts'::regclass),
  'RLS enabled on public.github_webhook_receipts');
select ok((select relrowsecurity from pg_class where oid = 'public.merge_queue_command_executions'::regclass),
  'RLS enabled on public.merge_queue_command_executions');
select ok((select relrowsecurity from pg_class where oid = 'public.merge_queue_execution_leases'::regclass),
  'RLS enabled on public.merge_queue_execution_leases');
select ok((select relrowsecurity from pg_class where oid = 'public.ci_run_entries'::regclass),
  'RLS enabled on public.ci_run_entries');
select ok((select relrowsecurity from pg_class where oid = 'public.github_install_intents'::regclass),
  'RLS enabled on public.github_install_intents');

select * from finish();
rollback;
