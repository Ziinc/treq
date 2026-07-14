// GitHub App authentication and REST API wrapper for the merge queue.
//
// Required env vars:
//   GITHUB_APP_ID              - numeric App ID
//   GITHUB_APP_PRIVATE_KEY_BASE64 - base64-encoded PEM private key
//   (GITHUB_WEBHOOK_SECRET handled by index.ts)

function base64url(data: ArrayBuffer | string): string {
  const bytes =
    typeof data === "string"
      ? new TextEncoder().encode(data)
      : new Uint8Array(data);
  let b64 = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    b64 +=
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"[
        a >> 2
      ];
    b64 +=
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"[
        ((a & 3) << 4) | (b >> 4)
      ];
    b64 +=
      b !== undefined
        ? "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"[
            ((b & 0xf) << 2) | (c >> 6)
          ]
        : "=";
    b64 +=
      c !== undefined
        ? "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"[
            c & 0x3f
          ]
        : "=";
  }
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function createAppJWT(appId: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId })
  );
  const signingInput = `${header}.${payload}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(signingInput)
    )
  );

  return `${signingInput}.${base64url(sig.buffer)}`;
}

export async function getInstallationToken(installationId: number): Promise<string> {
  const appId = Deno.env.get("GITHUB_APP_ID") ?? "";
  const privateKey = atob(Deno.env.get("GITHUB_APP_PRIVATE_KEY_BASE64") ?? "");
  const jwt = await createAppJWT(appId, privateKey);

  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "treq-merge-queue/1.0",
      },
    }
  );

  if (!res.ok) {
    throw new Error(
      `Failed to get installation token for ${installationId}: ${res.status} ${await res.text()}`
    );
  }
  return (await res.json()).token;
}

export class GitHubClient {
  constructor(
    private readonly token: string,
    private readonly owner: string,
    private readonly repo: string
  ) {}

  static async forInstallation(
    installationId: number,
    owner: string,
    repo: string
  ): Promise<GitHubClient> {
    const token = await getInstallationToken(installationId);
    return new GitHubClient(token, owner, repo);
  }

  private async request<T = unknown>(
    path: string,
    method = "GET",
    body?: unknown
  ): Promise<T | null> {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "treq-merge-queue/1.0",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204 || res.status === 404) return null;
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub ${method} ${url} → ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  async getBranchSha(branch: string): Promise<string> {
    const data = await this.request<{ commit: { sha: string } }>(
      `/branches/${encodeURIComponent(branch)}`
    );
    if (!data) throw new Error(`Branch not found: ${branch}`);
    return data.commit.sha;
  }

  async createBranch(name: string, sha: string): Promise<void> {
    await this.request("/git/refs", "POST", { ref: `refs/heads/${name}`, sha });
  }

  async updateBranch(name: string, sha: string): Promise<void> {
    await this.request(
      `/git/refs/heads/${encodeURIComponent(name)}`,
      "PATCH",
      { sha, force: true }
    );
  }

  async deleteBranch(name: string): Promise<void> {
    await this.request(`/git/refs/heads/${encodeURIComponent(name)}`, "DELETE");
  }

  /** Returns the new merge commit SHA, or null if HEAD is already up-to-date. */
  async mergeInto(
    base: string,
    head: string,
    message: string
  ): Promise<string | null> {
    const data = await this.request<{ sha: string }>("/merges", "POST", {
      base,
      head,
      commit_message: message,
    });
    return data?.sha ?? null;
  }

  async getPR(prNumber: number) {
    return this.request(`/pulls/${prNumber}`);
  }

  async mergePR(
    prNumber: number,
    mergeMethod: string,
    commitTitle: string
  ): Promise<void> {
    await this.request(`/pulls/${prNumber}/merge`, "PUT", {
      merge_method: mergeMethod,
      commit_title: commitTitle,
    });
  }

  async createComment(prNumber: number, body: string): Promise<void> {
    await this.request(`/issues/${prNumber}/comments`, "POST", { body });
  }

  async addLabel(prNumber: number, labels: string[]): Promise<void> {
    await this.request(`/issues/${prNumber}/labels`, "POST", { labels });
  }

  async removeLabel(prNumber: number, label: string): Promise<void> {
    try {
      await this.request(
        `/issues/${prNumber}/labels/${encodeURIComponent(label)}`,
        "DELETE"
      );
    } catch {
      // Label may not exist — ignore
    }
  }
}
