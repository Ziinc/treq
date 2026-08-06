import {
	forwardRef,
	memo,
	useCallback,
	type ChangeEvent,
	type KeyboardEvent as ReactKeyboardEvent,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../../lib/utils";
import type { CommitInputHandle, CommitInputProps } from "./types";

const CommitInput = memo(
	forwardRef<CommitInputHandle, CommitInputProps>(
		(
			{
				onCommit,
				onCommitAndPush,
				onCommitAndCreatePR,
				disabled,
				pending,
				pendingAction,
				canCreatePr = false,
				selectedFileCount = 0,
			},
			ref,
		) => {
			const [message, setMessage] = useState("");
			const [error, setError] = useState<string | null>(null);
			const textareaRef = useRef<HTMLTextAreaElement>(null);

			useImperativeHandle(
				ref,
				() => ({
					focus: () => {
						requestAnimationFrame(() => {
							if (textareaRef.current) {
								textareaRef.current.focus();
								textareaRef.current.select();
							}
						});
					},
				}),
				[],
			);

			const runAction = useCallback(
				(action: (message: string) => void) => {
					const trimmed = message.trim();
					if (!trimmed) {
						setError("Enter a commit message.");
						requestAnimationFrame(() => {
							textareaRef.current?.focus();
						});
						return;
					}
					setError(null);
					action(trimmed);
					setMessage("");
				},
				[message],
			);

			const handleMessageChange = useCallback(
				(event: ChangeEvent<HTMLTextAreaElement>) => {
					setMessage(event.target.value);
					if (error) {
						setError(null);
					}
				},
				[error],
			);

			const handleKeyDown = useCallback(
				(event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
					if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
						event.preventDefault();
						runAction(onCommit);
					}
				},
				[onCommit, runAction],
			);

			const commitLabel =
				selectedFileCount > 0
					? `Commit ${selectedFileCount} file${
							selectedFileCount !== 1 ? "s" : ""
						}`
					: "Commit";

			return (
				<div className="px-4 py-3 border-b border-border space-y-2">
					<Textarea
						ref={textareaRef}
						placeholder="Message"
						value={message}
						onChange={handleMessageChange}
						onKeyDown={handleKeyDown}
						disabled={disabled || pending}
						aria-invalid={error ? true : undefined}
						aria-describedby={error ? "commit-message-error" : undefined}
						className={cn(
							"resize-none overflow-hidden",
							error && "border-destructive focus-visible:ring-destructive",
						)}
						style={{ minHeight: "24px" }}
					/>
					{error && (
						<p
							id="commit-message-error"
							className="text-sm text-destructive"
							role="alert"
						>
							{error}
						</p>
					)}
					<div className="flex w-full">
						<Button
							className="flex-1 text-sm !h-auto py-1.5 rounded-r-none"
							disabled={disabled || pending}
							onClick={() => runAction(onCommit)}
							size="sm"
						>
							{pending && pendingAction === "commit" ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								commitLabel
							)}
						</Button>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									className="!h-auto py-1.5 px-1.5 rounded-l-none border-l border-primary-foreground/20"
									disabled={disabled || pending}
									size="sm"
									aria-label="More commit options"
								>
									{pending && pendingAction !== "commit" ? (
										<Loader2 className="w-4 h-4 animate-spin" />
									) : (
										<ChevronDown className="w-4 h-4" />
									)}
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" sideOffset={4}>
								<DropdownMenuItem
									disabled={disabled || pending}
									onSelect={(event) => {
										event.preventDefault();
										runAction(onCommitAndPush);
									}}
								>
									Commit and push
								</DropdownMenuItem>
								<DropdownMenuItem
									disabled={disabled || pending || !canCreatePr}
									onSelect={(event) => {
										event.preventDefault();
										runAction(onCommitAndCreatePR);
									}}
								>
									Commit and create PR
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>
			);
		},
	),
);
CommitInput.displayName = "CommitInput";

export { CommitInput };
export type { CommitInputHandle };
