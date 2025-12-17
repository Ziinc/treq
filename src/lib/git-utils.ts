export interface ParsedFileChange {
  path: string;
  stagedStatus?: string | null;
  workspaceStatus?: string | null;
  isUntracked: boolean;
}

export const formatFileLabel = (
  path: string
): { name: string; directory: string } => {
  if (!path) {
    return { name: "", directory: "" };
  }
  const parts = path.split("/").filter(Boolean);
  const name = parts.pop() || path;
  const directory = parts.length > 0 ? parts.join("/") : "";
  return { name, directory };
};

export const parseChangedFiles = (
  changedFiles: string[]
): ParsedFileChange[] => {
  return changedFiles.map((file) => {
    if (file.startsWith("?? ")) {
      return {
        path: file.substring(3).trim(),
        stagedStatus: null,
        workspaceStatus: "??",
        isUntracked: true,
      };
    }

    if (file.length < 3) {
      return {
        path: file.trim(),
        stagedStatus: null,
        workspaceStatus: null,
        isUntracked: false,
      };
    }

    const stagedStatus = file[0] !== " " ? file[0] : null;
    const workspaceStatus = file[1] !== " " ? file[1] : null;
    const rawPath = file.substring(3).trim();
    const path = rawPath.includes(" -> ")
      ? rawPath.split(" -> ").pop() || rawPath
      : rawPath;

    return {
      path,
      stagedStatus,
      workspaceStatus,
      isUntracked: false,
    };
  });
};

// Parse JJ file changes from JjFileChange[] to ParsedFileChange[]
// This maps JJ's model to the UI's expected format (all changes are "unstaged")
export const parseJjChangedFiles = (
  jjFiles: Array<{
    path: string;
    status: string;
    previous_path?: string | null;
  }>
): ParsedFileChange[] => {
  return jjFiles.map((file) => ({
    path: file.path,
    stagedStatus: null, // JJ has no staging
    workspaceStatus: file.status, // M, A, D
    isUntracked: file.status === "A", // Treat additions as untracked
  }));
};

const BINARY_EXTENSIONS = new Set([
  // Images
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".ico",
  ".webp",
  ".svg",
  ".tiff",
  ".avif",
  ".heic",
  // Documents
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  // Archives
  ".zip",
  ".tar",
  ".gz",
  ".rar",
  ".7z",
  ".bz2",
  ".xz",
  // Media
  ".mp3",
  ".mp4",
  ".wav",
  ".avi",
  ".mov",
  ".mkv",
  ".flac",
  ".ogg",
  ".webm",
  // Binaries
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".wasm",
  ".o",
  ".a",
  // Fonts
  ".ttf",
  ".otf",
  ".woff",
  ".woff2",
  ".eot",
  // Other
  ".bin",
  ".dat",
  ".db",
  ".sqlite",
  ".sqlite3",
]);

export const isBinaryFile = (filePath: string): boolean => {
  return [...BINARY_EXTENSIONS]
    .map((ext) => filePath.endsWith(ext))
    .some(Boolean);
};
