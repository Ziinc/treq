import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, Github, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import {
	useMergeQueueEnabled,
	useSetMergeQueueEnabled,
} from "../hooks/useMergeQueueStatus";
import { FEATURES } from "../lib/features";
import { supabase, WEB_URL } from "../lib/supabase";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";

export interface GitHubRepository {
	id: number;
	full_name: string;
	private: boolean;
	default_branch: string;
	installation_id: number;
}

interface GitHubIntegrationSettingsProps {
	/** Repo whose merge queue opt-in this page controls. */
	repoPath?: string;
}

/**
 * Per-repo merge queue opt-in, stored in Postgres. A repo with no config row
 * has never opted in, so this reads as off and nothing can be enqueued until
 * the user turns it on here.
 */
const MergeQueueSetting: React.FC<{ repoPath?: string }> = ({ repoPath }) => {
	const { data: enabled, isLoading } = useMergeQueueEnabled(repoPath);
	const setEnabled = useSetMergeQueueEnabled(repoPath);
	const [error, setError] = useState<string | null>(null);

	return (
		<div
			data-testid="merge-queue-setting"
			className="border border-border rounded-lg p-4 space-y-3"
		>
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0">
					<h3 className="font-medium">Merge queue</h3>
					<p className="text-base text-muted-foreground">
						{enabled
							? "Enabled for this repository."
							: "Turn on the merge queue to start adding branches to it."}
					</p>
				</div>
				<div className="flex items-center gap-2 shrink-0">
					{setEnabled.isPending && (
						<Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
					)}
					<Switch
						aria-label="Enable merge queue"
						checked={enabled === true}
						disabled={isLoading || setEnabled.isPending}
						onCheckedChange={async (next) => {
							setError(null);
							try {
								await setEnabled.mutateAsync(next);
							} catch (err) {
								setError((err as Error).message);
							}
						}}
					/>
				</div>
			</div>
			{error && <p className="text-base text-destructive">{error}</p>}
		</div>
	);
};

export const GitHubIntegrationSettings: React.FC<
	GitHubIntegrationSettingsProps
> = ({ repoPath }) => {
	const {
		user,
		session,
		loading: authLoading,
		subscription,
		signIn,
	} = useAuth();
	const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
	const [loading, setLoading] = useState(false);
	const [failed, setFailed] = useState(false);
	const isPro =
		subscription?.plan === "pro" && subscription.status === "active";

	useEffect(() => {
		if (!user || !session) return;
		let active = true;
		setLoading(true);
		setFailed(false);
		supabase
			.from("github_repositories")
			.select("id, full_name, private, default_branch, installation_id")
			.then(({ data, error }) => {
				if (!active) return;
				setRepositories(error ? [] : ((data ?? []) as GitHubRepository[]));
				setFailed(Boolean(error));
				setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [user, session]);

	if (authLoading) {
		return (
			<div className="flex justify-center py-16">
				<Loader2
					aria-label="Loading account"
					className="w-6 h-6 animate-spin text-muted-foreground"
				/>
			</div>
		);
	}

	if (!user || !session) {
		return (
			<div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
				<Github className="w-12 h-12 text-muted-foreground" />
				<div>
					<h3 className="text-lg font-semibold">
						Sign in to manage integrations
					</h3>
					<p className="text-base text-muted-foreground mt-1">
						Connect your GitHub repositories through Treq.
					</p>
				</div>
				<Button onClick={signIn} className="gap-2">
					<ExternalLink className="w-4 h-4" />
					Sign in with Browser
				</Button>
			</div>
		);
	}

	const visibleRepositories = isPro
		? repositories
		: repositories.filter((repo) => !repo.private);

	return (
		<div className="space-y-6">
			{FEATURES.mergeQueue && <MergeQueueSetting repoPath={repoPath} />}
			<div className="border border-border rounded-lg p-4 space-y-4">
				<div className="flex items-center gap-3">
					<Github className="w-6 h-6" />
					<div>
						<h3 className="font-medium">GitHub</h3>
						<p className="text-base text-muted-foreground">
							{isPro ? "All repositories" : "Public repositories"}
						</p>
					</div>
				</div>
				{loading ? (
					<div className="flex items-center gap-2 text-base text-muted-foreground">
						<Loader2 className="w-4 h-4 animate-spin" />
						Loading GitHub repositories…
					</div>
				) : failed ? (
					<p className="text-base text-destructive">
						Could not load GitHub repositories. Try again later.
					</p>
				) : visibleRepositories.length === 0 ? (
					<p className="text-base text-muted-foreground">
						No enabled GitHub repositories.
					</p>
				) : (
					<ul className="divide-y divide-border border border-border rounded-md">
						{visibleRepositories.map((repo) => (
							<li
								key={repo.id}
								className="flex items-center justify-between px-3 py-2 text-base"
							>
								<span>{repo.full_name}</span>
								<span className="text-base text-muted-foreground">
									{repo.private ? "Private" : "Public"}
								</span>
							</li>
						))}
					</ul>
				)}
				<Button
					variant="outline"
					size="sm"
					className="w-full gap-2 text-base"
					onClick={() => openUrl(`${WEB_URL}/dashboard?tab=integrations`)}
				>
					<ExternalLink className="w-3 h-3" />
					Manage GitHub
				</Button>
			</div>
		</div>
	);
};
