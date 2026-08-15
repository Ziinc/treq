-- PostgREST / Edge Functions need table DML for anon, authenticated, and
-- service_role. Tables created by migrations run as role `postgres`, whose
-- default privileges in local CLI only grant Dxtm (truncate/references/trigger/
-- maintain) — not SELECT/INSERT/UPDATE/DELETE. supabase_admin defaults are
-- correct, but migration-owned tables do not use them.
--
-- Without these grants, service_role cannot seed or read app tables (and Edge
-- Functions that use the service role hang or 500).

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;

grant usage, select, update on all sequences in schema public
  to anon, authenticated, service_role;

grant execute on all functions in schema public
  to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables
  to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant usage, select, update on sequences
  to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant execute on functions
  to anon, authenticated, service_role;
