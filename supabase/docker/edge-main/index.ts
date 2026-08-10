/**
 * Edge Runtime main router for the treq fat image.
 *
 * Mirrors supabase/docker/volumes/functions/main with one treq-specific rule:
 * `github-webhook` skips JWT verification (HMAC is checked inside the function),
 * matching supabase/config.toml [functions.github-webhook] verify_jwt = false.
 */
import * as jose from "jsr:@panva/jose@6";

console.log("treq edge main function started");

const JWT_SECRET = Deno.env.get("JWT_SECRET");
const VERIFY_JWT = Deno.env.get("VERIFY_JWT") === "true";

/** Functions that authenticate themselves (do not require a Supabase JWT). */
const SKIP_JWT = new Set(["github-webhook"]);

function getAuthToken(req: Request): string {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    throw new Error("Missing authorization header");
  }
  const [bearer, token] = authHeader.split(" ");
  if (bearer !== "Bearer") {
    throw new Error(`Auth header is not 'Bearer {token}'`);
  }
  return token;
}

async function isValidLegacyJWT(jwt: string): Promise<boolean> {
  if (!JWT_SECRET) {
    console.error("JWT_SECRET not available for HS256 token verification");
    return false;
  }
  const secretKey = new TextEncoder().encode(JWT_SECRET);
  try {
    await jose.jwtVerify(jwt, secretKey);
    return true;
  } catch (e) {
    console.error("Symmetric Legacy JWT verification error", e);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const serviceName = pathParts[1];

  if (!serviceName) {
    return new Response(JSON.stringify({ msg: "missing function name in request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const skipJwt = SKIP_JWT.has(serviceName);

  if (req.method !== "OPTIONS" && VERIFY_JWT && !skipJwt) {
    try {
      const token = getAuthToken(req);
      const ok = await isValidLegacyJWT(token);
      if (!ok) {
        return new Response(JSON.stringify({ msg: "Invalid JWT" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch (e) {
      console.error(e);
      return new Response(JSON.stringify({ msg: String(e) }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const servicePath = `/home/deno/functions/${serviceName}`;
  console.error(`serving the request with ${servicePath}`);

  const envVarsObj = Deno.env.toObject();
  const envVars = Object.keys(envVarsObj).map((k) => [k, envVarsObj[k]]);

  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath,
      memoryLimitMb: 150,
      workerTimeoutMs: 60_000,
      noModuleCache: false,
      importMapPath: null,
      envVars,
    });
    return await worker.fetch(req);
  } catch (e) {
    return new Response(JSON.stringify({ msg: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
