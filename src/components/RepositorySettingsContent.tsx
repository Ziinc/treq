import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { getRepoSetting, setRepoSetting } from "../lib/api";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { Textarea } from "./ui/textarea";
import { useToast } from "./ui/toast";

interface RepositorySettingsContentProps {
	repoPath: string;
	onSavingChange?: (saving: boolean) => void;
}

export interface RepositorySettingsContentHandle {
	save: () => Promise<void>;
}

export const RepositorySettingsContent = forwardRef<
	RepositorySettingsContentHandle,
	RepositorySettingsContentProps
>(({ repoPath, onSavingChange }, ref) => {
	const [branchNamePattern, setBranchNamePattern] = useState("treq/{name}");
	const [includedFiles, setIncludedFiles] = useState("");
	const [defaultModel, setDefaultModel] = useState<string>("");
	const [defaultAgent, setDefaultAgent] = useState<string>("");
	const [autoPush, setAutoPush] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const { addToast } = useToast();

	// Load settings when repo path changes
	useEffect(() => {
		if (repoPath) {
			setLoading(true);
			setError(null);

			Promise.all([
				getRepoSetting(repoPath, "branch_name_pattern"),
				getRepoSetting(repoPath, "included_copy_files"),
				getRepoSetting(repoPath, "default_model"),
				getRepoSetting(repoPath, "default_agent"),
				getRepoSetting(repoPath, "auto_push"),
			])
				.then(
					([
						branchPattern,
						includedPatterns,
						model,
						agent,
						autoPushSetting,
					]) => {
						setBranchNamePattern(branchPattern || "treq/{name}");
						setIncludedFiles(includedPatterns || "");
						setDefaultModel(model || "");
						setDefaultAgent(agent || "");
						setAutoPush(autoPushSetting === "true");
					},
				)
				.catch((err) => {
					setError(`Failed to load settings: ${err}`);
					setBranchNamePattern("treq/{name}");
					setIncludedFiles("");
					setDefaultModel("");
					setDefaultAgent("");
					setAutoPush(false);
				})
				.finally(() => {
					setLoading(false);
				});
		}
	}, [repoPath]);

	const handleSave = async () => {
		onSavingChange?.(true);
		setError(null);

		try {
			await Promise.all([
				setRepoSetting(repoPath, "branch_name_pattern", branchNamePattern),
				setRepoSetting(repoPath, "included_copy_files", includedFiles),
				setRepoSetting(repoPath, "default_model", defaultModel),
				setRepoSetting(repoPath, "default_agent", defaultAgent),
				setRepoSetting(repoPath, "auto_push", autoPush ? "true" : "false"),
			]);
			addToast({
				title: "Settings saved",
				description: "Repository settings have been updated successfully.",
				type: "success",
			});
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			setError(`Failed to save settings: ${errorMsg}`);
			addToast({
				title: "Error",
				description: `Failed to save settings: ${errorMsg}`,
				type: "error",
			});
		} finally {
			onSavingChange?.(false);
		}
	};

	useImperativeHandle(ref, () => ({ save: handleSave }));

	if (loading) {
		return (
			<div className="py-8 text-center text-muted-foreground">
				Loading settings...
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div>
				<Label htmlFor="branch-name-pattern">Branch Name Pattern</Label>
				<Input
					id="branch-name-pattern"
					value={branchNamePattern}
					onChange={(e) => setBranchNamePattern(e.target.value)}
					placeholder="treq/{name}"
					className="mt-2 font-mono"
				/>
				<p className="text-sm text-muted-foreground mt-1">
					treq/{"{name}"} → treq/add-dark-mode
				</p>
			</div>

			<div>
				<Label htmlFor="included-files">Included Files/Directories</Label>
				<Textarea
					id="included-files"
					value={includedFiles}
					onChange={(e) => setIncludedFiles(e.target.value)}
					placeholder="e.g., .env&#10;.env.local"
					rows={4}
					className="font-mono text-sm mt-2"
				/>
				<p className="text-sm text-muted-foreground mt-1">
					Paths to copy into each new workspace (e.g. .env). For heavy dirs like
					node_modules, use Symlink from home repo under Advanced when creating
					a workspace.
				</p>
			</div>

			<div>
				<Label htmlFor="repo-default-model">Claude Code Model</Label>
				<select
					id="repo-default-model"
					value={defaultModel}
					onChange={(e) => setDefaultModel(e.target.value)}
					className="mt-2 w-full px-3 py-2 border rounded-md bg-background text-foreground"
				>
					<option value="">Use Application Default</option>
					<option value="sonnet">Sonnet</option>
					<option value="opus">Opus</option>
					<option value="haiku">Haiku</option>
					<option value="sonnet[1m]">Sonnet (1M)</option>
					<option value="opusplan">Opus Plan</option>
				</select>
				<p className="text-sm text-muted-foreground mt-1">
					Default model for new Claude Code sessions in this repository
					(overrides application default)
				</p>
			</div>

			<div>
				<Label htmlFor="repo-default-agent">Default Agent</Label>
				<select
					id="repo-default-agent"
					value={defaultAgent}
					onChange={(e) => setDefaultAgent(e.target.value)}
					className="mt-2 w-full px-3 py-2 border rounded-md bg-background text-foreground"
				>
					<option value="">Use Application Default</option>
					<option value="claude">Claude</option>
					<option value="codex">Codex</option>
					<option value="cursor">Cursor</option>
				</select>
				<p className="text-sm text-muted-foreground mt-1">
					Default agent for new sessions in this repository (overrides
					application default)
				</p>
			</div>

			<div className="flex items-center justify-between gap-4">
				<div>
					<Label htmlFor="auto-push">Auto-push to remote</Label>
					<p className="text-sm text-muted-foreground mt-1">
						Automatically push to the remote after every commit in this
						repository
					</p>
				</div>
				<Switch
					id="auto-push"
					checked={autoPush}
					onCheckedChange={setAutoPush}
				/>
			</div>

			{error && <div className="text-sm text-destructive">{error}</div>}
		</div>
	);
});

RepositorySettingsContent.displayName = "RepositorySettingsContent";
