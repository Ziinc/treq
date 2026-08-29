// Correlation-id helper for Remote SSH Control (Phase 7: "Logs use
// correlation IDs spanning the desktop request, Edge Function operation,
// provider request, and SSH command where applicable.").
//
// A correlation id is generated once per incoming HTTP request (or accepted
// from an `x-correlation-id` request header when the desktop client already
// started one, e.g. to tie a certificate issuance call to the SSH command
// that triggered it) and then:
//   - included in every `console.log`/`console.error` line for that request;
//   - passed to every `recordAuditEvent` call so the audit row can be joined
//     back to those logs;
//   - echoed back to the caller in the JSON response body and the
//     `x-correlation-id` response header, so the desktop client can tag a
///     local `tracing` span with the same id.
//
// This never carries secrets - it is a random opaque token, not a value
// derived from key material or credentials.

export function correlationIdFromRequest(req: Request): string {
  const supplied = req.headers.get("x-correlation-id");
  if (supplied && /^[A-Za-z0-9_-]{1,128}$/.test(supplied)) {
    return supplied;
  }
  return crypto.randomUUID();
}

export function logWithCorrelation(
  correlationId: string,
  level: "log" | "error" | "warn",
  message: string,
): void {
  // deno-lint-ignore no-console
  console[level](`[correlation_id=${correlationId}] ${message}`);
}
