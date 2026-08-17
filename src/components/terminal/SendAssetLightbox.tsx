import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Copy, FolderOpen, X, ZoomIn, ZoomOut } from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { readFile } from "../../lib/api";
import { type TreqSendAsset, treqSendFileSrc } from "../../lib/treqSend";
import { copyTextToClipboard, cn } from "../../lib/utils";
import { useToast } from "../ui/toast";
import {
  type CarouselApi,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "../ui/carousel";
import { Button } from "../ui/button";

/** OS-aware label for revealing a path in the desktop file manager. */
export function revealInFileManagerLabel(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "Show in Finder";
  if (ua.includes("win")) return "Show in Explorer";
  return "Show in file manager";
}

const IMAGE_ZOOM_MIN = 1;
const IMAGE_ZOOM_MAX = 2;
const IMAGE_ZOOM_STEP = 1;
const IMAGE_ZOOM_DEFAULT = 1;
/** Fallback height as vh when natural size is unknown (jsdom / slow decode). */
const IMAGE_ZOOM_FALLBACK_VIEWPORT_FRACTION = 0.8;

function clampImageZoom(value: number): number {
  return Math.min(
    IMAGE_ZOOM_MAX,
    Math.max(IMAGE_ZOOM_MIN, Math.round(value * 100) / 100),
  );
}

function fallbackImageHeight(zoomFactor: number): string {
  const vh =
    Math.round(IMAGE_ZOOM_FALLBACK_VIEWPORT_FRACTION * zoomFactor * 10000) /
    100;
  return `${vh}vh`;
}

interface SendAssetLightboxProps {
  assets: TreqSendAsset[];
  initialIndex: number;
  onClose: () => void;
}

export function SendAssetLightbox({
  assets,
  initialIndex,
  onClose,
}: SendAssetLightboxProps) {
  const { addToast } = useToast();
  const [api, setApi] = useState<CarouselApi>();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [textByPath, setTextByPath] = useState<Record<string, string>>({});
  const [imageZoom, setImageZoom] = useState(IMAGE_ZOOM_DEFAULT);
  /** Fitted display size at 100% zoom, keyed by asset id (from natural size on load). */
  const [baseSizeById, setBaseSizeById] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const revealLabel = useMemo(() => revealInFileManagerLabel(), []);

  const current = assets[currentIndex] ?? assets[0];
  const showingImage = current?.mediaType === "image";

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
    setImageZoom(IMAGE_ZOOM_DEFAULT);
  }, [currentIndex]);

  const rememberFittedBaseSize = (assetId: string, img: HTMLImageElement) => {
    if (img.naturalWidth <= 0 || img.naturalHeight <= 0) return;
    const maxH = window.innerHeight * 0.8;
    // Fit to at least ~75vw of the viewport (carousel is min 75vw / typically 90vw).
    const maxW = Math.min(
      window.innerWidth * 0.9,
      Math.max(img.parentElement?.clientWidth || 0, window.innerWidth * 0.75),
    );
    // Allow upscaling so small assets fill the lightbox on initial load.
    const fitScale = Math.min(
      maxW / img.naturalWidth,
      maxH / img.naturalHeight,
    );
    const width = img.naturalWidth * fitScale;
    const height = img.naturalHeight * fitScale;
    setBaseSizeById((prev) => {
      const existing = prev[assetId];
      if (existing && existing.width === width && existing.height === height) {
        return prev;
      }
      return { ...prev, [assetId]: { width, height } };
    });
  };

  /** Explicit width so zoom grows layout (transform/scale does not; CSS zoom won't serialize in jsdom captures). */
  const imageSizeStyle = (assetId: string): CSSProperties => {
    const zoomFactor = assetId === current?.id ? imageZoom : IMAGE_ZOOM_DEFAULT;
    const base = baseSizeById[assetId];
    if (base) {
      return {
        width: base.width * zoomFactor,
        height: base.height * zoomFactor,
        maxWidth: "none",
        maxHeight: "none",
      };
    }
    return {
      height: fallbackImageHeight(zoomFactor),
      width: "auto",
      maxWidth: "none",
      maxHeight: "none",
    };
  };

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

  const zoomIn = () => {
    setImageZoom((currentZoom) =>
      clampImageZoom(currentZoom + IMAGE_ZOOM_STEP),
    );
  };

  const zoomOut = () => {
    setImageZoom((currentZoom) =>
      clampImageZoom(currentZoom - IMAGE_ZOOM_STEP),
    );
  };

  const toggleImageZoom = () => {
    setImageZoom((currentZoom) =>
      currentZoom === IMAGE_ZOOM_DEFAULT ? IMAGE_ZOOM_MAX : IMAGE_ZOOM_DEFAULT,
    );
  };

  const lightboxControls = (
    <div
      className="flex shrink-0 items-center gap-1 rounded-full border border-white/15 bg-black/40 p-1 shadow-lg backdrop-blur"
      onClick={(event) => event.stopPropagation()}
    >
      {showingImage && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="h-8 w-8 text-white hover:bg-white/15 hover:text-white"
            aria-label="Zoom out"
            data-testid="treq-send-zoom-out"
            disabled={imageZoom <= IMAGE_ZOOM_MIN}
            onClick={zoomOut}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span
            data-testid="treq-send-zoom-level"
            className="min-w-10 px-1 text-center text-xs tabular-nums text-white/80"
          >
            {Math.round(imageZoom * 100)}%
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="h-8 w-8 text-white hover:bg-white/15 hover:text-white"
            aria-label="Zoom in"
            data-testid="treq-send-zoom-in"
            disabled={imageZoom >= IMAGE_ZOOM_MAX}
            onClick={zoomIn}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <span aria-hidden className="mx-0.5 h-4 w-px bg-white/20" />
        </>
      )}
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
  );

  return (
    <div
      data-testid="treq-send-preview-lightbox"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        data-testid="treq-send-preview-carousel-shell"
        className="relative min-w-[75vw] w-[90vw] px-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          data-testid="treq-send-preview-header"
          className="mb-3 flex flex-col items-center gap-1.5"
        >
          {current && (
            <p className="max-w-full truncate text-center text-sm text-white/80">
              {current.title}
            </p>
          )}
          {lightboxControls}
        </div>
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
                className="flex min-h-0 items-stretch justify-center"
              >
                {asset.mediaType === "image" ? (
                  <div
                    data-testid={
                      asset.id === current?.id
                        ? "treq-send-image-scroll"
                        : undefined
                    }
                    className={cn(
                      "w-full max-w-full overflow-auto",
                      asset.id === current?.id && imageZoom > IMAGE_ZOOM_DEFAULT
                        ? "h-[80vh]"
                        : "max-h-[80vh]",
                    )}
                  >
                    <div
                      className={cn(
                        "flex min-h-full min-w-full justify-center",
                        asset.id === current?.id &&
                          imageZoom > IMAGE_ZOOM_DEFAULT
                          ? "items-start"
                          : "items-center",
                      )}
                    >
                      <img
                        src={treqSendFileSrc(asset.path)}
                        alt={asset.title}
                        className={cn(
                          "object-contain",
                          asset.id === current?.id && showingImage
                            ? imageZoom === IMAGE_ZOOM_DEFAULT
                              ? "cursor-zoom-in"
                              : "cursor-zoom-out"
                            : undefined,
                        )}
                        style={imageSizeStyle(asset.id)}
                        onLoad={(event) =>
                          rememberFittedBaseSize(asset.id, event.currentTarget)
                        }
                        onClick={
                          asset.id === current?.id ? toggleImageZoom : undefined
                        }
                        draggable={false}
                      />
                    </div>
                  </div>
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
          <CarouselPrevious className="fixed left-3 top-1/2 h-16 w-16 border-white/20 bg-black/40 text-white hover:bg-black/60 hover:text-white [&_svg]:size-8" />
          <CarouselNext className="fixed right-3 top-1/2 h-16 w-16 border-white/20 bg-black/40 text-white hover:bg-black/60 hover:text-white [&_svg]:size-8" />
        </Carousel>
      </div>
    </div>
  );
}
