import { useEffect, useState } from "react";
import { FileText, X } from "lucide-react";
import { readFile } from "../../lib/api";
import {
	type TreqSendAsset,
	assetsForPtySession,
	treqSendFileSrc,
} from "../../lib/treqSend";
import { useTreqSendOptional } from "../../hooks/useTreqSend";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

interface TerminalSendPreviewsProps {
	ptySessionId: string;
	isActive?: boolean;
	className?: string;
}

export function TerminalSendPreviews({
	ptySessionId,
	isActive = false,
	className,
}: TerminalSendPreviewsProps) {
	const send = useTreqSendOptional();
	const [previewAsset, setPreviewAsset] = useState<TreqSendAsset | null>(null);

	if (!send) return null;

	const assets = assetsForPtySession(send.assets, ptySessionId, isActive);
	if (assets.length === 0 && !previewAsset) return null;

	return (
		<>
			{assets.length > 0 && (
				<div
					data-testid="terminal-send-previews"
					className={cn(
						"pointer-events-none absolute inset-x-0 bottom-0 z-10",
						className,
					)}
				>
					{/* Gradient scrim so thumbs sit over terminal content without a hard edge */}
					<div
						aria-hidden
						className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#1e1e1e] via-[#1e1e1e]/85 to-transparent"
					/>
					<div className="pointer-events-auto relative flex gap-2 overflow-x-auto px-3 pb-3 pt-8">
						{assets.map((asset) => (
							<div
								key={asset.id}
								className="group relative h-14 w-14 flex-shrink-0"
							>
								<button
									type="button"
									data-testid={`terminal-send-preview-${asset.id}`}
									aria-label={`Preview ${asset.title}`}
									title={asset.title}
									className="h-14 w-14 overflow-hidden rounded-md border border-white/15 bg-[#2a2a2a] shadow-md transition hover:border-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									onClick={() => setPreviewAsset(asset)}
								>
									{asset.mediaType === "image" ? (
										<img
											src={treqSendFileSrc(asset.path)}
											alt={asset.title}
											className="h-full w-full object-cover"
											draggable={false}
										/>
									) : (
										<div className="flex h-full w-full flex-col items-center justify-center gap-1 px-1 text-zinc-300">
											<FileText className="h-4 w-4" />
											<span className="w-full truncate text-[10px] leading-tight">
												{asset.title}
											</span>
										</div>
									)}
								</button>
								<button
									type="button"
									data-testid={`terminal-send-dismiss-${asset.id}`}
									aria-label={`Dismiss ${asset.title}`}
									className="absolute -right-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-zinc-900 text-zinc-200 shadow hover:bg-zinc-700 hover:text-white"
									onClick={() => {
										send.dismissAsset(asset.id);
										if (previewAsset?.id === asset.id) {
											setPreviewAsset(null);
										}
									}}
								>
									<X className="h-3 w-3" />
								</button>
							</div>
						))}
					</div>
				</div>
			)}

			<SendAssetPreviewModal
				asset={previewAsset}
				onOpenChange={(open) => {
					if (!open) setPreviewAsset(null);
				}}
			/>
		</>
	);
}

interface SendAssetPreviewModalProps {
	asset: TreqSendAsset | null;
	onOpenChange: (open: boolean) => void;
}

export function SendAssetPreviewModal({
	asset,
	onOpenChange,
}: SendAssetPreviewModalProps) {
	const [textContent, setTextContent] = useState<string | null>(null);
	const [textError, setTextError] = useState<string | null>(null);
	const [textLoading, setTextLoading] = useState(false);

	useEffect(() => {
		if (!asset || asset.mediaType !== "text") {
			setTextContent(null);
			setTextError(null);
			setTextLoading(false);
			return;
		}

		let cancelled = false;
		setTextLoading(true);
		setTextError(null);
		readFile(asset.path)
			.then((content) => {
				if (!cancelled) {
					setTextContent(content);
					setTextLoading(false);
				}
			})
			.catch((error: unknown) => {
				if (!cancelled) {
					setTextContent(null);
					setTextError(
						error instanceof Error ? error.message : "Failed to read file",
					);
					setTextLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [asset]);

	return (
		<Dialog open={!!asset} onOpenChange={onOpenChange}>
			<DialogContent
				data-testid="treq-send-preview-modal"
				className={cn(
					"flex max-h-[85vh] w-full flex-col gap-3",
					asset?.mediaType === "image" ? "max-w-4xl" : "max-w-3xl",
				)}
			>
				<DialogHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
					<div className="min-w-0 space-y-1 text-left">
						<DialogTitle className="truncate">
							{asset?.title ?? "Preview"}
						</DialogTitle>
						<DialogDescription className="truncate font-mono text-xs">
							{asset?.path}
						</DialogDescription>
					</div>
					<Button
						type="button"
						variant="ghost"
						className="h-8 w-8 flex-shrink-0 p-0"
						aria-label="Close preview"
						onClick={() => onOpenChange(false)}
					>
						<X className="h-4 w-4" />
					</Button>
				</DialogHeader>

				{asset?.mediaType === "image" ? (
					<div className="min-h-0 flex-1 overflow-auto rounded-lg bg-black/40 p-2">
						<img
							src={treqSendFileSrc(asset.path)}
							alt={asset.title}
							className="mx-auto max-h-[70vh] max-w-full object-contain"
							draggable={false}
						/>
					</div>
				) : (
					<div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted/20">
						{textLoading ? (
							<div className="p-4 text-sm text-muted-foreground">Loading…</div>
						) : textError ? (
							<div className="p-4 text-sm text-destructive">{textError}</div>
						) : (
							<pre
								data-testid="treq-send-text-preview"
								className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed select-text"
							>
								{textContent ?? ""}
							</pre>
						)}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
