import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as api from "../../src/lib/api";
import {
	useGitRemoteInfo,
	usePrInfoViaGh,
	useEnqueueWorkspace,
} from "../../src/hooks/useMergeQueueStatus";
import type { PrInfo } from "../../src/lib/api-types";
import { createTestRepo } from "../utils";

const { mockEdgeFn } = vi.hoisted(() => ({ mockEdgeFn: vi.fn() }));
vi.mock("../../src/lib/supabase", () => ({
	supabase: {
		rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
		functions: { invoke: mockEdgeFn },
	},
}));

function makeWrapper() {
	const qc = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return ({ children }: { children: React.ReactNode }) =>
		React.createElement(QueryClientProvider, { client: qc }, children);
}

const OPEN_PR: PrInfo = {
	number: 1,
	title: "My PR",
	state: "OPEN",
	url: "https://github.com/ziinc/treq/pull/1",
	head_ref_name: "feat",
	base_ref_name: "main",
	merge_state_status: "CLEAN",
};

function addGitHubRemote(repoPath: string, remoteUrl: string) {
	const configPath = path.join(repoPath, ".git", "config");
	const existing = fs.existsSync(configPath)
		? fs.readFileSync(configPath, "utf-8")
		: "";
	fs.writeFileSync(
		configPath,
		`${existing}[remote "origin"]\n\turl = ${remoteUrl}\n`,
	);
}

describe("useGitRemoteInfo", () => {
	it("returns null when repo has no .git directory", async () => {
		const { repoPath } = createTestRepo(false);
		fs.rmSync(path.join(repoPath, ".git"), { recursive: true, force: true });

		const { result } = renderHook(() => useGitRemoteInfo(repoPath), {
			wrapper: makeWrapper(),
		});
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toBeNull();
	});

	it("returns null when origin is not a GitHub URL", async () => {
		const { repoPath } = createTestRepo(false);
		addGitHubRemote(repoPath, "https://gitlab.com/owner/repo.git");

		const { result } = renderHook(() => useGitRemoteInfo(repoPath), {
			wrapper: makeWrapper(),
		});
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toBeNull();
	});

	it("parses SSH GitHub remote from .git/config", async () => {
		const { repoPath } = createTestRepo(false);
		addGitHubRemote(repoPath, "git@github.com:ziinc/treq.git");

		const { result } = renderHook(() => useGitRemoteInfo(repoPath), {
			wrapper: makeWrapper(),
		});
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toMatchObject({
			owner: "ziinc",
			repo: "treq",
			full_name: "ziinc/treq",
		});
	});

	it("parses HTTPS GitHub remote from .git/config", async () => {
		const { repoPath } = createTestRepo(false);
		addGitHubRemote(repoPath, "https://github.com/ziinc/treq.git");

		const { result } = renderHook(() => useGitRemoteInfo(repoPath), {
			wrapper: makeWrapper(),
		});
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data?.full_name).toBe("ziinc/treq");
	});

	it("is disabled when repoPath is undefined", () => {
		const { result } = renderHook(() => useGitRemoteInfo(undefined), {
			wrapper: makeWrapper(),
		});
		expect(result.current.fetchStatus).toBe("idle");
	});
});

describe("usePrInfoViaGh", () => {
	it("settles to success state and never enters error state", async () => {
		const { repoPath } = createTestRepo(false);

		const { result } = renderHook(
			() => usePrInfoViaGh(repoPath, "non-existent-branch"),
			{ wrapper: makeWrapper() },
		);
		await waitFor(() => expect(result.current.isSuccess).toBe(true), {
			timeout: 10_000,
		});
		expect(result.current.isError).toBe(false);
	});

	it("is disabled when branchName is undefined", () => {
		const { repoPath } = createTestRepo(false);
		const { result } = renderHook(() => usePrInfoViaGh(repoPath, undefined), {
			wrapper: makeWrapper(),
		});
		expect(result.current.fetchStatus).toBe("idle");
	});
});

describe("useEnqueueWorkspace", () => {
	let ghSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		mockEdgeFn.mockReset();
		ghSpy = vi.spyOn(api, "getPrInfoViaGh");
	});

	afterEach(() => {
		ghSpy.mockRestore();
	});

	it("calls enqueue-workspace edge function with correct payload", async () => {
		const { repoPath } = createTestRepo(false);
		addGitHubRemote(repoPath, "git@github.com:ziinc/treq.git");
		ghSpy.mockResolvedValue(null);
		mockEdgeFn.mockResolvedValue({ error: null });

		const { result } = renderHook(() => useEnqueueWorkspace(repoPath, "feat"), {
			wrapper: makeWrapper(),
		});
		await waitFor(() => expect(result.current.remoteInfo).toBeTruthy());

		await result.current.enqueue.mutateAsync();

		expect(mockEdgeFn).toHaveBeenCalledWith("enqueue-workspace", {
			body: {
				repo_full_name: "ziinc/treq",
				branch_name: "feat",
				action: "enqueue",
			},
		});
	});

	it("blocks enqueue when gh reports PR state is not OPEN", async () => {
		const { repoPath } = createTestRepo(false);
		addGitHubRemote(repoPath, "git@github.com:ziinc/treq.git");
		ghSpy.mockResolvedValue({ ...OPEN_PR, state: "MERGED" });

		const { result } = renderHook(() => useEnqueueWorkspace(repoPath, "feat"), {
			wrapper: makeWrapper(),
		});
		await waitFor(() => {
			expect(result.current.remoteInfo).toBeTruthy();
			expect(result.current.prInfoGh).not.toBeUndefined();
		});

		await expect(result.current.enqueue.mutateAsync()).rejects.toThrow(
			"No open PR found",
		);
		expect(mockEdgeFn).not.toHaveBeenCalled();
	});

	it("allows dequeue even when gh reports PR state is MERGED", async () => {
		const { repoPath } = createTestRepo(false);
		addGitHubRemote(repoPath, "git@github.com:ziinc/treq.git");
		ghSpy.mockResolvedValue({ ...OPEN_PR, state: "MERGED" });
		mockEdgeFn.mockResolvedValue({ error: null });

		const { result } = renderHook(() => useEnqueueWorkspace(repoPath, "feat"), {
			wrapper: makeWrapper(),
		});
		await waitFor(() => expect(result.current.remoteInfo).toBeTruthy());

		await result.current.dequeue.mutateAsync();

		expect(mockEdgeFn).toHaveBeenCalledWith(
			"enqueue-workspace",
			expect.objectContaining({
				body: expect.objectContaining({ action: "dequeue" }),
			}),
		);
	});

	it("skips pre-flight and proceeds when gh returns null", async () => {
		const { repoPath } = createTestRepo(false);
		addGitHubRemote(repoPath, "https://github.com/ziinc/treq.git");
		ghSpy.mockResolvedValue(null);
		mockEdgeFn.mockResolvedValue({ error: null });

		const { result } = renderHook(() => useEnqueueWorkspace(repoPath, "feat"), {
			wrapper: makeWrapper(),
		});
		await waitFor(() => expect(result.current.remoteInfo).toBeTruthy());

		await result.current.enqueue.mutateAsync();
		expect(mockEdgeFn).toHaveBeenCalled();
	});

	it("throws when no GitHub remote is detected", async () => {
		const { repoPath } = createTestRepo(false);
		ghSpy.mockResolvedValue(null);

		const { result } = renderHook(() => useEnqueueWorkspace(repoPath, "feat"), {
			wrapper: makeWrapper(),
		});

		await new Promise((r) => setTimeout(r, 200));

		await expect(result.current.enqueue.mutateAsync()).rejects.toThrow(
			"Repository or branch not detected",
		);
		expect(mockEdgeFn).not.toHaveBeenCalled();
	});
});
