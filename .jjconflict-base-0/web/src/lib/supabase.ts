import { createClient } from "@supabase/supabase-js";
import pkg from "../../../package.json";

const environment =
  pkg.env[process.env.NODE_ENV === "production" ? "prod" : "dev"];
const SUPABASE_URL = environment.supabase.url;
const SUPABASE_ANON_KEY = environment.supabase.anonKey;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
