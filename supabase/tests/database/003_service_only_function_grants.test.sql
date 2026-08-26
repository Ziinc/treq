-- Regression test for the privilege-escalation bug fixed in
-- 012_reclose_service_only_function_grants.sql: 008_public_grants.sql's
-- blanket `grant execute on all functions in schema public to anon,
-- authenticated` silently re-opened these service-role-only RPCs after
-- 005_merge_queue_pgmq.sql had explicitly revoked them. Each of these
-- assumes its caller already did the work (verified GitHub webhook,
-- acquired lease, etc.) that only the service role can be trusted to have
-- done, so anon/authenticated must never hold EXECUTE on them.
begin;
select plan(38);

-- merge_queue_send(text, jsonb, int)
select function_privs_are('public', 'merge_queue_send', array['text', 'jsonb', 'int'], 'anon', array[]::text[],
  'anon has no privileges on merge_queue_send');
select function_privs_are('public', 'merge_queue_send', array['text', 'jsonb', 'int'], 'authenticated', array[]::text[],
  'authenticated has no privileges on merge_queue_send');
select function_privs_are('public', 'merge_queue_send', array['text', 'jsonb', 'int'], 'service_role', array['EXECUTE'],
  'service_role can execute merge_queue_send');

-- merge_queue_read(text, int, int)
select function_privs_are('public', 'merge_queue_read', array['text', 'int', 'int'], 'anon', array[]::text[],
  'anon has no privileges on merge_queue_read');
select function_privs_are('public', 'merge_queue_read', array['text', 'int', 'int'], 'authenticated', array[]::text[],
  'authenticated has no privileges on merge_queue_read');
select function_privs_are('public', 'merge_queue_read', array['text', 'int', 'int'], 'service_role', array['EXECUTE'],
  'service_role can execute merge_queue_read');

-- merge_queue_archive(text, bigint)
select function_privs_are('public', 'merge_queue_archive', array['text', 'bigint'], 'anon', array[]::text[],
  'anon has no privileges on merge_queue_archive');
select function_privs_are('public', 'merge_queue_archive', array['text', 'bigint'], 'authenticated', array[]::text[],
  'authenticated has no privileges on merge_queue_archive');
select function_privs_are('public', 'merge_queue_archive', array['text', 'bigint'], 'service_role', array['EXECUTE'],
  'service_role can execute merge_queue_archive');

-- merge_queue_delete(text, bigint)
select function_privs_are('public', 'merge_queue_delete', array['text', 'bigint'], 'anon', array[]::text[],
  'anon has no privileges on merge_queue_delete');
select function_privs_are('public', 'merge_queue_delete', array['text', 'bigint'], 'authenticated', array[]::text[],
  'authenticated has no privileges on merge_queue_delete');
select function_privs_are('public', 'merge_queue_delete', array['text', 'bigint'], 'service_role', array['EXECUTE'],
  'service_role can execute merge_queue_delete');

-- merge_queue_set_vt(text, bigint, int)
select function_privs_are('public', 'merge_queue_set_vt', array['text', 'bigint', 'int'], 'anon', array[]::text[],
  'anon has no privileges on merge_queue_set_vt');
select function_privs_are('public', 'merge_queue_set_vt', array['text', 'bigint', 'int'], 'authenticated', array[]::text[],
  'authenticated has no privileges on merge_queue_set_vt');
select function_privs_are('public', 'merge_queue_set_vt', array['text', 'bigint', 'int'], 'service_role', array['EXECUTE'],
  'service_role can execute merge_queue_set_vt');

-- merge_queue_metrics()
select function_privs_are('public', 'merge_queue_metrics', array[]::text[], 'anon', array[]::text[],
  'anon has no privileges on merge_queue_metrics');
select function_privs_are('public', 'merge_queue_metrics', array[]::text[], 'authenticated', array[]::text[],
  'authenticated has no privileges on merge_queue_metrics');
select function_privs_are('public', 'merge_queue_metrics', array[]::text[], 'service_role', array['EXECUTE'],
  'service_role can execute merge_queue_metrics');

-- acquire_merge_queue_lease(uuid, uuid, int)
select function_privs_are('public', 'acquire_merge_queue_lease', array['uuid', 'uuid', 'int'], 'anon', array[]::text[],
  'anon has no privileges on acquire_merge_queue_lease');
select function_privs_are('public', 'acquire_merge_queue_lease', array['uuid', 'uuid', 'int'], 'authenticated', array[]::text[],
  'authenticated has no privileges on acquire_merge_queue_lease');
select function_privs_are('public', 'acquire_merge_queue_lease', array['uuid', 'uuid', 'int'], 'service_role', array['EXECUTE'],
  'service_role can execute acquire_merge_queue_lease');

-- renew_merge_queue_lease(uuid, uuid, int)
select function_privs_are('public', 'renew_merge_queue_lease', array['uuid', 'uuid', 'int'], 'anon', array[]::text[],
  'anon has no privileges on renew_merge_queue_lease');
select function_privs_are('public', 'renew_merge_queue_lease', array['uuid', 'uuid', 'int'], 'authenticated', array[]::text[],
  'authenticated has no privileges on renew_merge_queue_lease');
select function_privs_are('public', 'renew_merge_queue_lease', array['uuid', 'uuid', 'int'], 'service_role', array['EXECUTE'],
  'service_role can execute renew_merge_queue_lease');

-- release_merge_queue_lease(uuid, uuid)
select function_privs_are('public', 'release_merge_queue_lease', array['uuid', 'uuid'], 'anon', array[]::text[],
  'anon has no privileges on release_merge_queue_lease');
select function_privs_are('public', 'release_merge_queue_lease', array['uuid', 'uuid'], 'authenticated', array[]::text[],
  'authenticated has no privileges on release_merge_queue_lease');
select function_privs_are('public', 'release_merge_queue_lease', array['uuid', 'uuid'], 'service_role', array['EXECUTE'],
  'service_role can execute release_merge_queue_lease');

-- get_or_create_merge_queue(bigint, text)
select function_privs_are('public', 'get_or_create_merge_queue', array['bigint', 'text'], 'anon', array[]::text[],
  'anon has no privileges on get_or_create_merge_queue');
select function_privs_are('public', 'get_or_create_merge_queue', array['bigint', 'text'], 'authenticated', array[]::text[],
  'authenticated has no privileges on get_or_create_merge_queue');
select function_privs_are('public', 'get_or_create_merge_queue', array['bigint', 'text'], 'service_role', array['EXECUTE'],
  'service_role can execute get_or_create_merge_queue');

-- enqueue_merge_queue_entry(uuid, int, text, text, text, text)
select function_privs_are('public', 'enqueue_merge_queue_entry', array['uuid', 'int', 'text', 'text', 'text', 'text'], 'anon', array[]::text[],
  'anon has no privileges on enqueue_merge_queue_entry');
select function_privs_are('public', 'enqueue_merge_queue_entry', array['uuid', 'int', 'text', 'text', 'text', 'text'], 'authenticated', array[]::text[],
  'authenticated has no privileges on enqueue_merge_queue_entry');
select function_privs_are('public', 'enqueue_merge_queue_entry', array['uuid', 'int', 'text', 'text', 'text', 'text'], 'service_role', array['EXECUTE'],
  'service_role can execute enqueue_merge_queue_entry');

-- reserve_next_merge_queue_lane(uuid, uuid, uuid, int) -- fixed earlier in 009, guarded here too
select function_privs_are('public', 'reserve_next_merge_queue_lane', array['uuid', 'uuid', 'uuid', 'int'], 'anon', array[]::text[],
  'anon has no privileges on reserve_next_merge_queue_lane');
select function_privs_are('public', 'reserve_next_merge_queue_lane', array['uuid', 'uuid', 'uuid', 'int'], 'authenticated', array[]::text[],
  'authenticated has no privileges on reserve_next_merge_queue_lane');
select function_privs_are('public', 'reserve_next_merge_queue_lane', array['uuid', 'uuid', 'uuid', 'int'], 'service_role', array['EXECUTE'],
  'service_role can execute reserve_next_merge_queue_lane');

-- Positive controls: RPCs the desktop app is meant to call directly must
-- stay open, so this suite doesn't just prove "revoke everything" passes.
select function_privs_are('public', 'get_merge_queue_enabled', array['text'], 'authenticated', array['EXECUTE'],
  'authenticated can still execute get_merge_queue_enabled');
select function_privs_are('public', 'set_merge_queue_enabled', array['text', 'boolean'], 'authenticated', array['EXECUTE'],
  'authenticated can still execute set_merge_queue_enabled');

select * from finish();
rollback;
