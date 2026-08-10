/**
 * Seed helpers for service-qa specs. Prefer these over hand-rolled inserts so
 * specs stay consistent with the migration schema and RLS expectations.
 */
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

export type TestUser = {
  user: User;
  email: string;
  password: string;
};

function uniqueEmail(prefix = "service-qa"): string {
  return `${prefix}-${randomBytes(6).toString("hex")}@example.com`;
}

export async function createTestUser(
  admin: SupabaseClient,
  opts?: { email?: string; password?: string },
): Promise<TestUser> {
  const email = opts?.email ?? uniqueEmail();
  const password =
    opts?.password ?? `Pw-${randomBytes(9).toString("base64url")}!a1`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`createTestUser failed: ${error?.message ?? "no user"}`);
  }

  return { user: data.user, email, password };
}

export type LinkedRepo = {
  installationId: number;
  repoId: number;
  fullName: string;
  owner: string;
  name: string;
  defaultBranch: string;
};

/**
 * Insert a GitHub App installation linked to `userId` plus one repository.
 * Enough for desktop RPCs that join github_repositories → installations.
 */
export async function linkGithubRepo(
  admin: SupabaseClient,
  userId: string,
  opts?: {
    fullName?: string;
    installationId?: number;
    repoId?: number;
    defaultBranch?: string;
  },
): Promise<LinkedRepo> {
  const installationId =
    opts?.installationId ??
    Math.floor(Math.random() * 1_000_000_000) + 1_000_000;
  const repoId =
    opts?.repoId ?? Math.floor(Math.random() * 1_000_000_000) + 2_000_000;
  const fullName = opts?.fullName ?? `service-qa/repo-${repoId}`;
  const [owner, name] = fullName.split("/");
  const defaultBranch = opts?.defaultBranch ?? "main";

  const { error: installError } = await admin
    .from("github_app_installations")
    .insert({
      id: installationId,
      account_login: owner,
      account_type: "User",
      app_id: 1,
      linked_user_id: userId,
    });
  if (installError) {
    throw new Error(`linkGithubRepo install: ${installError.message}`);
  }

  const { error: repoError } = await admin.from("github_repositories").insert({
    id: repoId,
    installation_id: installationId,
    owner,
    name,
    full_name: fullName,
    private: false,
    default_branch: defaultBranch,
  });
  if (repoError) {
    throw new Error(`linkGithubRepo repo: ${repoError.message}`);
  }

  return {
    installationId,
    repoId,
    fullName,
    owner,
    name,
    defaultBranch,
  };
}

/**
 * Call create_desktop_token as the signed-in user (RLS / auth.uid() path the
 * web auth callback uses).
 */
export async function createDesktopToken(
  userClient: SupabaseClient,
): Promise<string> {
  const { data, error } = await userClient.rpc("create_desktop_token");
  if (error || typeof data !== "string" || data.length === 0) {
    throw new Error(
      `create_desktop_token failed: ${error?.message ?? "empty token"}`,
    );
  }
  return data;
}
