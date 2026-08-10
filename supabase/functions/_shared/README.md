# Edge shared modules

`supabase-js.ts` re-exports from `supabase-js.bundle.js`, a self-contained ESM
bundle of `@supabase/supabase-js` built with esbuild. Edge workers import the
shim so Deno does not need registry access at boot (local CLI / nested Docker).

Regenerate:

```bash
npm run service-qa:bundle
```
