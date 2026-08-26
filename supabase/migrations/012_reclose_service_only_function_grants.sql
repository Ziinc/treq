-- 008_public_grants.sql grants `execute on all functions in schema public` to
-- anon and authenticated (needed so PostgREST can call ordinary RPCs). Run
-- after 005_merge_queue_pgmq.sql, that blanket grant silently re-opened the
-- service-role-only pgmq wrappers and queue-mutation RPCs that 005 had
-- explicitly revoked from anon/authenticated — letting any signed-in (or
-- anonymous) client call them directly and bypass the GitHub webhook
-- validation and lease/ownership checks those RPCs assume their caller
-- already performed. 009_fix_reserve_lane_delete.sql re-closed one of the
-- eight (reserve_next_merge_queue_lane); this closes the rest.
--
-- 008's default-privilege grant (`alter default privileges ... grant execute
-- on functions to anon, authenticated, service_role`) also means any new
-- security-definer function created without an explicit revoke stays open by
-- default — the same trap that caused this gap. Every future service-role-only
-- RPC must revoke from public/anon/authenticated in the same migration that
-- creates it.

revoke all on function public.merge_queue_send(text, jsonb, int) from public, anon, authenticated;
revoke all on function public.merge_queue_read(text, int, int) from public, anon, authenticated;
revoke all on function public.merge_queue_archive(text, bigint) from public, anon, authenticated;
revoke all on function public.merge_queue_delete(text, bigint) from public, anon, authenticated;
revoke all on function public.merge_queue_set_vt(text, bigint, int) from public, anon, authenticated;
revoke all on function public.merge_queue_metrics() from public, anon, authenticated;
revoke all on function public.acquire_merge_queue_lease(uuid, uuid, int) from public, anon, authenticated;
revoke all on function public.renew_merge_queue_lease(uuid, uuid, int) from public, anon, authenticated;
revoke all on function public.release_merge_queue_lease(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_or_create_merge_queue(bigint, text) from public, anon, authenticated;
revoke all on function public.enqueue_merge_queue_entry(uuid, int, text, text, text, text) from public, anon, authenticated;

grant execute on function public.merge_queue_send(text, jsonb, int) to service_role;
grant execute on function public.merge_queue_read(text, int, int) to service_role;
grant execute on function public.merge_queue_archive(text, bigint) to service_role;
grant execute on function public.merge_queue_delete(text, bigint) to service_role;
grant execute on function public.merge_queue_set_vt(text, bigint, int) to service_role;
grant execute on function public.merge_queue_metrics() to service_role;
grant execute on function public.acquire_merge_queue_lease(uuid, uuid, int) to service_role;
grant execute on function public.renew_merge_queue_lease(uuid, uuid, int) to service_role;
grant execute on function public.release_merge_queue_lease(uuid, uuid) to service_role;
grant execute on function public.get_or_create_merge_queue(bigint, text) to service_role;
grant execute on function public.enqueue_merge_queue_entry(uuid, int, text, text, text, text) to service_role;
