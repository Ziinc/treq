/**
 * Worked example: desktop auth handoff that useAuth.exchangeToken depends on.
 *
 * Web calls create_desktop_token (RPC), then the desktop hits
 * functions/v1/exchange-desktop-token and receives a session. Tokens are
 * single-use and reject when missing/invalid.
 */
import { it, expect } from "vitest";
import {
  getAnonClient,
  getAnonKey,
  getFunctionsBaseUrl,
  getServiceClient,
} from "../clients";
import { createDesktopToken, createTestUser } from "../seed";
import { recordOutcome } from "../record";

async function exchangeDesktopToken(token: string): Promise<Response> {
  return fetch(`${getFunctionsBaseUrl()}/exchange-desktop-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAnonKey()}`,
      apikey: getAnonKey(),
    },
    body: JSON.stringify({ token }),
  });
}

it("exchanges a one-time desktop token for a session", async () => {
  const admin = getServiceClient();
  const { email, password } = await createTestUser(admin);

  const anon = getAnonClient();
  const { data: signIn, error: signInError } =
    await anon.auth.signInWithPassword({ email, password });
  expect(signInError).toBeNull();
  expect(signIn.session).toBeTruthy();

  const token = await createDesktopToken(anon);
  const response = await exchangeDesktopToken(token);
  expect(response.status).toBe(200);

  const body = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
  };
  expect(body.error).toBeUndefined();
  expect(typeof body.access_token).toBe("string");
  expect(typeof body.refresh_token).toBe("string");

  const sessionClient = getAnonClient();
  const { data: sessionData, error: sessionError } =
    await sessionClient.auth.setSession({
      access_token: body.access_token!,
      refresh_token: body.refresh_token!,
    });
  expect(sessionError).toBeNull();
  expect(sessionData.session?.user.email).toBe(email);

  await recordOutcome("desktop-token-exchange-01-happy-path", {
    expectations: [
      "exchange-desktop-token returns HTTP 200 with access_token and refresh_token.",
      "setSession with those tokens yields a session for the same user email.",
    ],
    details: {
      email,
      httpStatus: response.status,
      userId: sessionData.session?.user.id,
    },
  });
}, 60_000);

it("rejects a reused desktop token", async () => {
  const admin = getServiceClient();
  const { email, password } = await createTestUser(admin);

  const anon = getAnonClient();
  const { error: signInError } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  expect(signInError).toBeNull();

  const token = await createDesktopToken(anon);
  const first = await exchangeDesktopToken(token);
  expect(first.status).toBe(200);

  const second = await exchangeDesktopToken(token);
  expect(second.status).toBe(401);
  const body = (await second.json()) as { error?: string };
  expect(body.error).toMatch(/invalid|expired/i);

  await recordOutcome("desktop-token-exchange-02-single-use", {
    expectations: [
      "A second exchange of the same token returns HTTP 401.",
      "The error body reports the token as invalid or expired.",
    ],
    details: { httpStatus: second.status, error: body.error },
  });
}, 60_000);

it("rejects a missing token body", async () => {
  const response = await fetch(
    `${getFunctionsBaseUrl()}/exchange-desktop-token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAnonKey()}`,
        apikey: getAnonKey(),
      },
      body: JSON.stringify({}),
    },
  );
  expect(response.status).toBe(400);
  const body = (await response.json()) as { error?: string };
  expect(body.error).toMatch(/token/i);

  await recordOutcome("desktop-token-exchange-03-missing-token", {
    expectations: [
      "POST without a token field returns HTTP 400.",
      "The error body mentions that a token is required.",
    ],
    details: { httpStatus: response.status, error: body.error },
  });
}, 60_000);
