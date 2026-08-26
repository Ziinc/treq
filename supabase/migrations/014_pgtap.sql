-- pgTAP powers supabase/tests/database/*.sql (run via `supabase test db`).
-- Installing it is inert outside a test run: it adds test-assertion
-- functions, no tables or data that the app depends on.
create extension if not exists pgtap with schema extensions;
