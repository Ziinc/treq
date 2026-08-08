import { createClient } from "@supabase/supabase-js";
import pkg from "../../package.json";

const environment = pkg.env[import.meta.env.PROD ? "prod" : "dev"];
const SUPABASE_URL = environment.supabase.url;
const SUPABASE_ANON_KEY = environment.supabase.anonKey;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
	auth: {
		autoRefreshToken: false,
		persistSession: false, // Desktop manages its own persistence via SQLite
	},
});

const WEB_URL = environment.webUrl;

export { SUPABASE_URL, SUPABASE_ANON_KEY, WEB_URL };
