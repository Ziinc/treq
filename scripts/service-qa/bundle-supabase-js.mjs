import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
await build({
  entryPoints: [
    path.join(root, "node_modules/@supabase/supabase-js/dist/index.mjs"),
  ],
  bundle: true,
  format: "esm",
  platform: "browser",
  mainFields: ["module", "main", "browser"],
  outfile: path.join(root, "supabase/functions/_shared/supabase-js.bundle.js"),
  logLevel: "info",
});
