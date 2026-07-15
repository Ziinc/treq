import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquare, X } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import {
	ghClosePr,
	ghCreatePr,
	ghCreatePrComment,
	ghReopenPr,
	ghViewPr,
} from "../../lib/api";
import { formatDate, LabelChip, StateChip } from "./shared";

export function PrDetailPanel({
	repoFullName,
	prNumber,
	onClose,
}: {
	repoFullName: string;
	prNumber: number;
	onClose: () => void;
}) {
	const qc = useQueryClient();
	const [commentBody, setCommentBody] = useState("");

	const { data: pr, isLoading } = useQuery({
		queryKey: ["gh-pr", repoFullName, prNumber],
		queryFn: () => ghViewPr(repoFullName, prNumber),
	});

	const addComment = useMutation({
		mutationFn: () => ghCreatePrComment(repoFullName, prNumber, commentBody),
		onSuccess: () => {
			setCommentBody("");
			void qc.invalidateQueries({
				queryKey: ["gh-pr", repoFullName, prNumber],
			});
		},
	});

	const closePr = useMutation({
		mutationFn: () => ghClosePr(repoFullName, prNumber),
		onSuccess: () => {
			void qc.invalidateQueries({
				queryKey: ["gh-pr", repoFullName, prNumber],
			});
			void qc.invalidateQueries({ queryKey: ["gh-prs", repoFullName] });
		},
	});

	const reopenPr = useMutation({
		mutationFn: () => ghReopenPr(repoFullName, prNumber),
		onSuccess: () => {
			void qc.invalidateQueries({
				queryKey: ["gh-pr", repoFullName, prNumber],
			});
			void qc.invalidateQueries({ queryKey: ["gh-prs", repoFullName] });
		},
	});

	return (
		<div className="flex flex-col h-full">
			<div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
				<span className="text-sm font-semibold text-muted-foreground">
					Pull Request #{prNumber}
				</span>
				<Button
					variant="ghost"
					size="icon"
					className="h-7 w-7"
					onClick={onClose}
				>
					<X className="w-4 h-4" />
				</Button>
			</div>

			{isLoading && (
				<div className="flex-1 flex items-center justify-center">
					<Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
				</div>
			)}

			{pr && (
				<div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
					<div>
						<h2 className="text-base font-semibold">{pr.title}</h2>
						<div className="flex items-center gap-2 mt-1 flex-wrap">
							<StateChip state={pr.state} />
							<span className="text-xs text-muted-foreground font-mono">
								{pr.head_ref_name} → {pr.base_ref_name}
							</span>
						</div>
						<div className="text-xs text-muted-foreground mt-1">
							#{pr.number} opened by {pr.author.login} on{" "}
							{formatDate(pr.created_at)}
						</div>
						{pr.labels.length > 0 && (
							<div className="flex gap-1 flex-wrap mt-2">
								{pr.labels.map((l) => (
									<LabelChip key={l.name} name={l.name} color={l.color} />
								))}
							</div>
						)}
					</div>

					{pr.body && (
						<div className="text-sm text-foreground bg-muted/30 rounded-md p-3 whitespace-pre-wrap">
							{pr.body}
						</div>
					)}

					{(pr.comments ?? []).length > 0 && (
						<div className="space-y-3">
							<h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
								<MessageSquare className="w-3 h-3" />
								Comments ({pr.comments!.length})
							</h3>
							{pr.comments!.map((c) => (
								<div key={c.id} className="bg-muted/30 rounded-md p-3 text-sm">
									<div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
										<span className="font-medium">{c.author.login}</span>
										<span>·</span>
										<span>{formatDate(c.created_at)}</span>
									</div>
									<p className="whitespace-pre-wrap">{c.body}</p>
								</div>
							))}
						</div>
					)}

					<div className="space-y-2">
						<h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
							Add Comment
						</h3>
						<Textarea
							placeholder="Leave a comment..."
							value={commentBody}
							onChange={(e) => setCommentBody(e.target.value)}
							rows={3}
							className="text-sm"
						/>
						<div className="flex items-center gap-2">
							<Button
								size="sm"
								disabled={!commentBody.trim() || addComment.isPending}
								onClick={() => addComment.mutate()}
							>
								{addComment.isPending ? (
									<Loader2 className="w-3 h-3 mr-1 animate-spin" />
								) : null}
								Comment
							</Button>
							{pr.state === "OPEN" ? (
								<Button
									size="sm"
									variant="outline"
									disabled={closePr.isPending}
									onClick={() => closePr.mutate()}
								>
									{closePr.isPending ? (
										<Loader2 className="w-3 h-3 mr-1 animate-spin" />
									) : null}
									Close PR
								</Button>
							) : pr.state === "CLOSED" ? (
								<Button
									size="sm"
									variant="outline"
									disabled={reopenPr.isPending}
									onClick={() => reopenPr.mutate()}
								>
									{reopenPr.isPending ? (
										<Loader2 className="w-3 h-3 mr-1 animate-spin" />
									) : null}
									Reopen PR
								</Button>
							) : null}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

export function CreatePrForm({
	repoFullName,
	onSuccess,
	onCancel,
}: {
	repoFullName: string;
	onSuccess: (prNumber: number) => void;
	onCancel: () => void;
}) {
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [base, setBase] = useState("main");
	const [head, setHead] = useState("");
	const qc = useQueryClient();

	const create = useMutation({
		mutationFn: () => ghCreatePr(repoFullName, title, body, base, head),
		onSuccess: (prNumber) => {
			void qc.invalidateQueries({ queryKey: ["gh-prs", repoFullName] });
			onSuccess(prNumber);
		},
	});

	return (
		<div className="p-4 space-y-3 border-b border-border">
			<h3 className="text-sm font-semibold">New Pull Request</h3>
			<Input
				placeholder="Title"
				value={title}
				onChange={(e) => setTitle(e.target.value)}
				className="text-sm"
			/>
			<div className="flex gap-2 items-center">
				<Input
					placeholder="Head branch"
					value={head}
					onChange={(e) => setHead(e.target.value)}
					className="text-sm font-mono"
				/>
				<span className="text-muted-foreground text-sm shrink-0">→</span>
				<Input
					placeholder="Base branch"
					value={base}
					onChange={(e) => setBase(e.target.value)}
					className="text-sm font-mono"
				/>
			</div>
			<Textarea
				placeholder="Description (optional)"
				value={body}
				onChange={(e) => setBody(e.target.value)}
				rows={4}
				className="text-sm"
			/>
			<div className="flex gap-2">
				<Button
					size="sm"
					disabled={
						!title.trim() || !head.trim() || !base.trim() || create.isPending
					}
					onClick={() => create.mutate()}
				>
					{create.isPending ? (
						<Loader2 className="w-3 h-3 mr-1 animate-spin" />
					) : null}
					Create Pull Request
				</Button>
				<Button size="sm" variant="ghost" onClick={onCancel}>
					Cancel
				</Button>
			</div>
			{create.isError && (
				<p className="text-xs text-destructive">{String(create.error)}</p>
			)}
		</div>
	);
}
