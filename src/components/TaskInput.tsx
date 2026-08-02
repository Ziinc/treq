import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Paperclip, Plus } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "./ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./ui/tooltip";
import { FilePicker } from "./FilePicker";
import {
	createSession,
	getSetting,
	getRepoSetting,
	searchWorkspaceFiles,
	type FileSearchResult,
} from "../lib/api";
import { useToast } from "./ui/toast";
import { useDebounce } from "../hooks/useDebounce";
import { cn } from "../lib/utils";
import type { SessionCreationInfo } from "../types/sessions";

interface TaskInputProps {
	repoPath: string;
	workspaceId: number | null;
	workspacePath: string | null;
	workingDirectory: string;
	onSessionCreated?: (session: SessionCreationInfo) => void;
}

export const TaskInput: React.FC<TaskInputProps> = ({
	repoPath,
	workspaceId,
	workspacePath,
	workingDirectory,
	onSessionCreated,
}) => {
	const [taskText, setTaskText] = useState("");
	const [filePickerOpen, setFilePickerOpen] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [focused, setFocused] = useState(false);
	const [selectedAgent, setSelectedAgent] = useState<
		"claude" | "codex" | "cursor"
	>("claude");
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const mentionRef = useRef<HTMLDivElement>(null);
	const { addToast } = useToast();

	// @ mention state
	const [mentionQuery, setMentionQuery] = useState<string | null>(null);
	const [mentionResults, setMentionResults] = useState<FileSearchResult[]>([]);
	const [mentionIndex, setMentionIndex] = useState(0);
	const [mentionAnchor, setMentionAnchor] = useState<number | null>(null);
	const debouncedMentionQuery = useDebounce(mentionQuery, 150);

	// Autofocus when workspace changes
	useEffect(() => {
		textareaRef.current?.focus();
	}, [workspaceId]);

	// Load default agent from repo setting, falling back to global setting
	useEffect(() => {
		let cancelled = false;
		getRepoSetting(repoPath, "default_agent")
			.then((repoAgent) => {
				if (cancelled) return;
				if (
					repoAgent === "claude" ||
					repoAgent === "codex" ||
					repoAgent === "cursor"
				) {
					setSelectedAgent(repoAgent);
					return;
				}
				return getSetting("default_agent").then((globalAgent) => {
					if (cancelled) return;
					if (
						globalAgent === "claude" ||
						globalAgent === "codex" ||
						globalAgent === "cursor"
					) {
						setSelectedAgent(globalAgent);
					}
				});
			})
			.catch(() => {
				// Keep current selection on read failure.
			});
		return () => {
			cancelled = true;
		};
	}, [repoPath, workspaceId]);

	// Auto-resize textarea
	useEffect(() => {
		const textarea = textareaRef.current;
		if (textarea) {
			textarea.style.height = "auto";
			textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
		}
	}, [taskText]);

	// Search files when mention query changes
	useEffect(() => {
		if (debouncedMentionQuery === null) {
			setMentionResults([]);
			return;
		}
		let cancelled = false;
		searchWorkspaceFiles(repoPath, workspaceId, debouncedMentionQuery, 4)
			.then((results) => {
				if (!cancelled) {
					setMentionResults(results);
					setMentionIndex(0);
				}
			})
			.catch(() => {
				if (!cancelled) setMentionResults([]);
			});
		return () => {
			cancelled = true;
		};
	}, [debouncedMentionQuery, repoPath, workspaceId]);

	// Close mention dropdown on outside click
	useEffect(() => {
		if (mentionQuery === null) return;
		const handler = (e: MouseEvent) => {
			const target = e.target as Node;
			if (
				mentionRef.current &&
				!mentionRef.current.contains(target) &&
				textareaRef.current &&
				!textareaRef.current.contains(target)
			) {
				setMentionQuery(null);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [mentionQuery]);

	// Helper: insert text at the current cursor position (or end) and update taskText
	const insertAtCursor = useCallback(
		(insertion: string) => {
			const textarea = textareaRef.current;
			const cursorPos = textarea?.selectionStart ?? taskText.length;
			const before = taskText.slice(0, cursorPos);
			const after = taskText.slice(cursorPos);
			// Add a leading space if cursor is not at start and previous char isn't whitespace
			const needsSpace = before.length > 0 && !/\s$/.test(before);
			const text = needsSpace ? ` ${insertion}` : insertion;
			const newText = before + text + after;
			setTaskText(newText);

			const newCursorPos = before.length + text.length;
			requestAnimationFrame(() => {
				if (textarea) {
					textarea.focus();
					textarea.selectionStart = newCursorPos;
					textarea.selectionEnd = newCursorPos;
				}
			});
		},
		[taskText],
	);

	// FilePicker: insert @relative_path at cursor
	const handleFileSelect = useCallback(
		(relativePath: string) => {
			insertAtCursor(`@${relativePath} `);
		},
		[insertAtCursor],
	);

	// Finder: insert 'absolute_path' at cursor
	const handleAttachFromFinder = useCallback(async () => {
		const selected = await open({
			multiple: true,
			title: "Attach Files",
		});
		if (!selected) return;
		const paths = Array.isArray(selected) ? selected : [selected];
		const textarea = textareaRef.current;
		const cursorPos = textarea?.selectionStart ?? taskText.length;
		const before = taskText.slice(0, cursorPos);
		const after = taskText.slice(cursorPos);
		const needsSpace = before.length > 0 && !/\s$/.test(before);
		const insertion = paths.map((p) => `'${p}'`).join(" ");
		const text = `${(needsSpace ? " " : "") + insertion} `;
		const newText = before + text + after;
		setTaskText(newText);

		const newCursorPos = before.length + text.length;
		requestAnimationFrame(() => {
			if (textarea) {
				textarea.focus();
				textarea.selectionStart = newCursorPos;
				textarea.selectionEnd = newCursorPos;
			}
		});
	}, [taskText]);

	// @ mention dropdown: insert @relative_path at cursor (preserving the @)
	const handleMentionSelect = useCallback(
		(file: FileSearchResult) => {
			if (mentionAnchor === null) return;
			const textarea = textareaRef.current;
			const cursorPos = textarea?.selectionStart ?? taskText.length;
			// Replace from the @ anchor to cursor with @relative_path
			const before = taskText.slice(0, mentionAnchor);
			const after = taskText.slice(cursorPos);
			const inserted = `@${file.relative_path} `;
			const newText = before + inserted + after;
			setTaskText(newText);

			// Close dropdown
			setMentionQuery(null);
			setMentionAnchor(null);

			// Restore focus and cursor position after the inserted path
			requestAnimationFrame(() => {
				if (textarea) {
					textarea.focus();
					const newCursorPos = before.length + inserted.length;
					textarea.selectionStart = newCursorPos;
					textarea.selectionEnd = newCursorPos;
				}
			});
		},
		[mentionAnchor, taskText],
	);

	const handleTextChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			const { value } = e.target;
			setTaskText(value);

			const cursorPos = e.target.selectionStart;
			// Look backwards from cursor to find @ preceded by whitespace or at start
			let foundAnchor: number | null = null;
			for (let i = cursorPos - 1; i >= 0; i--) {
				const ch = value[i];
				if (ch === "@") {
					// Valid if at position 0 or preceded by whitespace
					if (i === 0 || /\s/.test(value[i - 1])) {
						foundAnchor = i;
					}
					break;
				}
				// Stop searching if we hit whitespace (no @ in this "word")
				if (/\s/.test(ch)) break;
			}

			if (foundAnchor !== null) {
				setMentionAnchor(foundAnchor);
				setMentionQuery(value.slice(foundAnchor + 1, cursorPos));
			} else {
				setMentionQuery(null);
				setMentionAnchor(null);
			}
		},
		[],
	);

	const handleSubmit = useCallback(
		async (mode: "plan" | "acceptEdits") => {
			const trimmed = taskText.trim();
			if (!trimmed || submitting) return;

			setSubmitting(true);
			try {
				const sessionName =
					trimmed.length > 50 ? `${trimmed.slice(0, 47)}...` : trimmed;

				const dbSessionId = await createSession(
					repoPath,
					workspaceId,
					sessionName,
				);

				const sessionRepoPath = repoPath || workingDirectory;

				onSessionCreated?.({
					sessionId: dbSessionId,
					sessionName,
					workspaceId,
					workspacePath,
					repoPath: sessionRepoPath,
					pendingPrompt: trimmed,
					permissionMode: mode,
					agent: selectedAgent,
				});

				// Clear input on success
				setTaskText("");
			} catch (error) {
				addToast({
					title: "Failed to create task",
					description: error instanceof Error ? error.message : String(error),
					type: "error",
				});
			} finally {
				setSubmitting(false);
			}
		},
		[
			taskText,
			submitting,
			repoPath,
			workspaceId,
			workspacePath,
			workingDirectory,
			onSessionCreated,
			addToast,
			selectedAgent,
		],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			// When mention dropdown is open, handle navigation keys
			if (mentionQuery !== null && mentionResults.length > 0) {
				if (e.key === "ArrowDown") {
					e.preventDefault();
					setMentionIndex((prev) => (prev + 1) % mentionResults.length);
					return;
				}
				if (e.key === "ArrowUp") {
					e.preventDefault();
					setMentionIndex(
						(prev) =>
							(prev - 1 + mentionResults.length) % mentionResults.length,
					);
					return;
				}
				if (e.key === "Enter") {
					e.preventDefault();
					handleMentionSelect(mentionResults[mentionIndex]);
					return;
				}
				if (e.key === "Escape" || e.key === "Tab") {
					setMentionQuery(null);
					setMentionAnchor(null);
					return;
				}
			}

			if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
				e.preventDefault();
				handleSubmit("acceptEdits");
			}
		},
		[
			handleSubmit,
			mentionQuery,
			mentionResults,
			mentionIndex,
			handleMentionSelect,
		],
	);

	const isEmpty = taskText.trim().length === 0;

	return (
		<>
			<div className="max-w-2xl mx-auto w-full">
				<div
					className={cn(
						"rounded-xl border bg-background relative transition-colors",
						focused ? "border-blue-400" : "border-border",
					)}
				>
					<textarea
						ref={textareaRef}
						value={taskText}
						onChange={handleTextChange}
						onKeyDown={handleKeyDown}
						onFocus={() => setFocused(true)}
						onBlur={() => setFocused(false)}
						placeholder="Describe a task..."
						rows={1}
						className="w-full resize-none border-0 bg-transparent px-4 pt-3 pb-1 text-sm outline-none placeholder:text-muted-foreground focus:ring-0 caret-blue-400"
						style={{ minHeight: "44px", maxHeight: "200px" }}
					/>

					{/* @ mention dropdown — rendered in-flow to avoid overflow-auto clipping from parent */}
					<div
						className="grid transition-[grid-template-rows] duration-200 ease-out"
						style={{
							gridTemplateRows:
								mentionQuery !== null && mentionResults.length > 0
									? "1fr"
									: "0fr",
						}}
					>
						<div className="overflow-hidden">
							<div
								ref={mentionRef}
								className="mx-2 mb-1 rounded-lg border border-border bg-muted/50 overflow-hidden"
							>
								<div className="px-3 py-1 text-[10px] text-muted-foreground font-medium uppercase tracking-wider border-b border-border">
									Files
								</div>
								{mentionResults.map((file, i) => (
									<button
										key={file.file_path}
										type="button"
										className={cn(
											"w-full px-3 py-1.5 flex items-center gap-2 text-sm text-left transition-colors",
											i === mentionIndex
												? "bg-accent/50"
												: "hover:bg-accent/30",
										)}
										onMouseDown={(e) => {
											e.preventDefault();
											handleMentionSelect(file);
										}}
									>
										<FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
										<span className="truncate font-mono text-xs">
											{file.relative_path}
										</span>
									</button>
								))}
							</div>
						</div>
					</div>

					{/* Bottom toolbar */}
					<div className="px-2 pb-2 pt-1 flex items-center justify-between">
						<div className="flex items-center gap-1">
							<Button
								variant="ghost"
								size="sm"
								className="h-7 text-xs px-2 gap-1"
								onClick={() => setFilePickerOpen(true)}
							>
								<Plus className="w-4 h-4" />
								File
							</Button>
							<Button
								variant="ghost"
								size="sm"
								className="h-7 text-xs px-2 gap-1"
								onClick={handleAttachFromFinder}
							>
								<Paperclip className="w-4 h-4" />
								Attach
							</Button>
						</div>

						<div className="flex items-center gap-2">
							{/* Agent picker */}
							<select
								aria-label="Agent"
								value={selectedAgent}
								onChange={(e) =>
									setSelectedAgent(
										e.target.value as "claude" | "codex" | "cursor",
									)
								}
								className="h-7 text-xs px-2 rounded-md border border-border bg-background text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400"
							>
								<option value="claude">Claude</option>
								<option value="codex">Codex</option>
								<option value="cursor">Cursor</option>
							</select>
							{selectedAgent !== "codex" && (
								<Button
									size="sm"
									variant="secondary"
									disabled={isEmpty || submitting}
									onClick={() => handleSubmit("plan")}
									className="h-7 text-xs px-3"
								>
									Plan
								</Button>
							)}
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											size="sm"
											disabled={isEmpty || submitting}
											onClick={() => handleSubmit("acceptEdits")}
											className="h-7 text-xs px-3"
										>
											{selectedAgent === "claude" ? "Edit" : "Run"}
										</Button>
									</TooltipTrigger>
									<TooltipContent side="top">
										<p className="text-xs">⌘+Enter</p>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
					</div>
				</div>
			</div>

			<FilePicker
				open={filePickerOpen}
				onOpenChange={setFilePickerOpen}
				repoPath={repoPath}
				workspaceId={workspaceId}
				onFileSelect={handleFileSelect}
			/>
		</>
	);
};
