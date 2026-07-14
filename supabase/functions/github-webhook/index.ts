import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  handleInstallation,
  handlePullRequest,
  handleCheckSuite,
} from "./webhook-handlers.ts";

async function verifySignature(
  secret: string,
  body: string,
  sigHeader: string
): Promise<boolean> {
  if (!sigHeader.startsWith("sha256=")) return false;

  const hex = sigHeader.slice(7);
  if (hex.length % 2 !== 0) return false;

  const sigBytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    sigBytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  return crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    new TextEncoder().encode(body)
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.text();
  const webhookSecret = Deno.env.get("GITHUB_WEBHOOK_SECRET") ?? "";
  const sigHeader = req.headers.get("x-hub-signature-256") ?? "";

  if (webhookSecret) {
    const valid = await verifySignature(webhookSecret, body, sigHeader);
    if (!valid) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const event = req.headers.get("x-github-event") ?? "";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // Return 200 immediately; process in the background so GitHub doesn't time out.
  const process = async () => {
    try {
      switch (event) {
        case "installation":
        case "installation_repositories":
          await handleInstallation(supabase, payload, event);
          break;
        case "pull_request":
          await handlePullRequest(supabase, payload);
          break;
        case "check_suite":
          await handleCheckSuite(supabase, payload);
          break;
        default:
          // Unhandled event — no-op
      }
    } catch (err) {
      console.error(`[github-webhook] Error handling "${event}":`, err);
    }
  };

  // EdgeRuntime.waitUntil keeps the worker alive until the promise resolves.
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil(process()) ?? process();

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
