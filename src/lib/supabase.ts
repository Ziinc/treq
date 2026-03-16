import { createClient } from "@supabase/supabase-js";

// Use Vite env vars for easy dev/prod switching.
// Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env or .env.production
const SUPABASE_URL =
	import.meta.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY =
	import.meta.env.VITE_SUPABASE_ANON_KEY ??
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
	auth: {
		persistSession: false, // Desktop manages its own persistence via SQLite
		autoRefreshToken: false,
	},
});

// Web dashboard URL — defaults to localhost:3001 for local dev
const WEB_URL = import.meta.env.VITE_WEB_URL ?? "http://localhost:3001";

export { SUPABASE_URL, SUPABASE_ANON_KEY, WEB_URL };
