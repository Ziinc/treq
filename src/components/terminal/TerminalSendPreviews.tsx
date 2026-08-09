import { useEffect, useMemo, useState } from "react";
import { Copy, FileText, FolderOpen, X } from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { readFile } from "../../lib/api";
import {
	type TreqSendAsset,
	assetsForPtySession,
	treqSendFileSrc,
} from "../../lib/treqSend";
import { copyTextToClipboard, cn } from "../../lib/utils";
import { useTreqSendOptional } from "../../hooks/useTreqSend";
import { useToast } from "../ui/toast";
import {
	Attachment,
	AttachmentAction,
	AttachmentActions,
	AttachmentContent,
	AttachmentGroup,
	AttachmentMedia,
	AttachmentTitle,
	AttachmentTrigger,
} from "../ui/attachment";
import {
	type CarouselApi,
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
} from "../ui/carousel";
import { Button } from "../ui/button";

interface TerminalSendPreviewsProps {
	ptySessionId: string;
	isActive?: boolean;
	className?: string;
}

/** OS-aware label for revealing a path in the desktop file manager. */
export function revealInFileManagerLabel(): string {
	const ua = navigator.userAgent.toLowerCase();
	if (ua.includes("mac")) return "Show in Finder";
	if (ua.includes("win")) return "Show in Explorer";
	return "Show in file manager";
}

export function TerminalSendPreviews({
	ptySessionId,
	isActive = false,
	className,
}: TerminalSendPreviewsProps) {
	const send = useTreqSendOptional();
	const [previewIndex, setPreviewIndex] = useState<number | null>(null);

	if (!send) return null;

	const assets = assetsForPtySession(send.assets, ptySessionId, isActive);
	if (assets.length === 0 && previewIndex == null) return null;

	const openPreview = (assetId: string) => {
		const index = assets.findIndex((asset) => asset.id === assetId);
		if (index >= 0) setPreviewIndex(index);
	};

	return (
		<>
			{assets.length > 0 && (
				<div
					data-testid="terminal-send-previews"
					className={cn(
						"pointer-events-none absolute inset-x-0 top-0 z-10",
						className,
					)}
				>
					<div
						aria-hidden
						className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#1e1e1e] via-[#1e1e1e]/85 to-transparent"
					/>
					<div className="pointer-events-auto relative px-3 pb-8 pt-3">
						<AttachmentGroup className="gap-2 py-0">
							{assets.map((asset) => (
								<Attachment
									key={asset.id}
									state="done"
									size="xs"
									orientation="vertical"
									className="w-16 bg-zinc-100/95 text-zinc-900 shadow-md"
								>
									<AttachmentTrigger
										data-testid={`terminal-send-preview-${asset.id}`}
										aria-label={`Preview ${asset.title}`}
										onClick={() => openPreview(asset.id)}
									/>
									<AttachmentMedia
										variant={asset.mediaType === "image" ? "image" : "icon"}
										className="aspect-square w-full rounded-md"
									>
										{asset.mediaType === "image" ? (
											<img
												src={treqSendFileSrc(asset.path)}
												alt={asset.title}
												draggable={false}
											/>
										) : (
											<FileText />
										)}
									</AttachmentMedia>
									<AttachmentContent>
										<AttachmentTitle className="text-[10px]">
											{asset.title}
										</AttachmentTitle>
									</AttachmentContent>
									<AttachmentActions className="top-1 right-1">
										<AttachmentAction
											type="button"
											data-testid={`terminal-send-dismiss-${asset.id}`}
											aria-label={`Dismiss ${asset.title}`}
											className="h-5 w-5 rounded-full border border-zinc-500 bg-[#c4c4c4] text-zinc-900 shadow-md hover:bg-[#d4d4d4]"
											onClick={() => {
												send.dismissAsset(asset.id);
												setPreviewIndex((current) => {
													if (current == null) return null;
													const remaining = assets.filter(
														(a) => a.id !== asset.id,
													);
													if (remaining.length === 0) return null;
													return Math.min(current, remaining.length - 1);
												});
											}}
										>
											<X className="h-3 w-3" strokeWidth={2.5} />
										</AttachmentAction>
									</AttachmentActions>
								</Attachment>
							))}
						</AttachmentGroup>
					</div>
				</div>
			)}

			{previewIndex != null && assets.length > 0 && (
				<SendAssetLightbox
					assets={assets}
					initialIndex={Math.min(previewIndex, assets.length - 1)}
					onClose={() => setPreviewIndex(null)}
				/>
			)}
		</>
	);
}

interface SendAssetLightboxProps {
	assets: TreqSendAsset[];
	initialIndex: number;
	onClose: () => void;
}

function SendAssetLightbox({
	assets,
	initialIndex,
	onClose,
}: SendAssetLightboxProps) {
	const { addToast } = useToast();
	const [api, setApi] = useState<CarouselApi>();
	const [currentIndex, setCurrentIndex] = useState(initialIndex);
	const [textByPath, setTextByPath] = useState<Record<string, string>>({});
	const revealLabel = useMemo(() => revealInFileManagerLabel(), []);

	const current = assets[currentIndex] ?? assets[0];

	useEffect(() => {
		if (!api) return;
		setCurrentIndex(initialIndex);
		api.scrollTo(initialIndex, true);
		const onSelect = () => setCurrentIndex(api.selectedScrollSnap());
		api.on("select", onSelect);
		return () => {
			api.off("select", onSelect);
		};
	}, [api, initialIndex]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				onClose();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onClose]);

	useEffect(() => {
		const textAssets = assets.filter((asset) => asset.mediaType === "text");
		let cancelled = false;
		Promise.all(
			textAssets.map(async (asset) => {
				try {
					const content = await readFile(asset.path);
					return [asset.path, content] as const;
				} catch {
					return [asset.path, ""] as const;
				}
			}),
		).then((entries) => {
			if (cancelled) return;
			setTextByPath(Object.fromEntries(entries));
		});
		return () => {
			cancelled = true;
		};
	}, [assets]);

	const copyCurrentAsset = async () => {
		if (!current) return;
		try {
			if (current.mediaType === "text") {
				const content =
					textByPath[current.path] ?? (await readFile(current.path));
				await copyTextToClipboard(content);
			} else {
				const response = await fetch(treqSendFileSrc(current.path));
				const blob = await response.blob();
				const type = blob.type || "image/png";
				if (
					typeof ClipboardItem !== "undefined" &&
					navigator.clipboard?.write
				) {
					await navigator.clipboard.write([
						new ClipboardItem({ [type]: blob }),
					]);
				} else {
					await copyTextToClipboard(current.path);
				}
			}
			addToast({
				title: "Copied",
				description:
					current.mediaType === "text"
						? "Asset text copied to clipboard"
						: "Asset copied to clipboard",
				type: "success",
			});
		} catch (error) {
			addToast({
				title: "Copy failed",
				description: error instanceof Error ? error.message : String(error),
				type: "error",
			});
		}
	};

	const revealCurrentAsset = async () => {
		if (!current) return;
		try {
			await revealItemInDir(current.path);
		} catch (error) {
			addToast({
				title: "Open failed",
				description: error instanceof Error ? error.message : String(error),
				type: "error",
			});
		}
	};

	return (
		<div
			data-testid="treq-send-preview-lightbox"
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-md"
			onClick={onClose}
		>
			<div
				className="absolute right-4 top-4 z-20 flex items-center gap-1 rounded-full border border-white/15 bg-black/40 p-1 shadow-lg backdrop-blur"
				onClick={(event) => event.stopPropagation()}
			>
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					className="h-8 w-8 text-white hover:bg-white/15 hover:text-white"
					aria-label="Copy asset"
					data-testid="treq-send-copy"
					onClick={copyCurrentAsset}
				>
					<Copy className="h-4 w-4" />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					className="h-8 w-8 text-white hover:bg-white/15 hover:text-white"
					aria-label={revealLabel}
					data-testid="treq-send-reveal"
					onClick={revealCurrentAsset}
				>
					<FolderOpen className="h-4 w-4" />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					className="h-8 w-8 text-white hover:bg-white/15 hover:text-white"
					aria-label="Close preview"
					data-testid="treq-send-close"
					onClick={onClose}
				>
					<X className="h-4 w-4" />
				</Button>
			</div>

			<div
				className="relative w-full max-w-5xl px-14"
				onClick={(event) => event.stopPropagation()}
			>
				{current && (
					<p className="mb-3 truncate text-center text-sm text-white/80">
						{current.title}
					</p>
				)}
				<Carousel
					key={`send-carousel-${initialIndex}-${assets.map((a) => a.id).join(":")}`}
					setApi={setApi}
					opts={{ startIndex: initialIndex, loop: false }}
					className="w-full"
				>
					<CarouselContent>
						{assets.map((asset) => (
							<CarouselItem
								key={asset.id}
								className="flex items-center justify-center"
							>
								{asset.mediaType === "image" ? (
									<img
										src={treqSendFileSrc(asset.path)}
										alt={asset.title}
										className="max-h-[80vh] max-w-full object-contain"
										draggable={false}
									/>
								) : (
									<pre
										data-testid="treq-send-text-preview"
										className="max-h-[80vh] w-full max-w-3xl overflow-auto whitespace-pre-wrap break-words rounded-lg bg-zinc-950/70 p-6 font-mono text-sm leading-relaxed text-zinc-100 select-text"
									>
										{textByPath[asset.path] ?? "Loading…"}
									</pre>
								)}
							</CarouselItem>
						))}
					</CarouselContent>
					<CarouselPrevious className="left-0 border-white/20 bg-black/40 text-white hover:bg-black/60 hover:text-white" />
					<CarouselNext className="right-0 border-white/20 bg-black/40 text-white hover:bg-black/60 hover:text-white" />
				</Carousel>
			</div>
		</div>
	);
}
