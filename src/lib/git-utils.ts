export interface ParsedFileChange {
  path: string;
  stagedStatus?: string | null;
  worktreeStatus?: string | null;
  isUntracked: boolean;
}

export const formatFileLabel = (path: string): { name: string; directory: string } => {
  const parts = path.split("/").filter(Boolean);
  const name = parts.pop() || path;
  const directory = parts.length > 0 ? parts.join("/") : "";
  return { name, directory };
};

export const statusLabel = (code?: string | null): string => {
  switch (code) {
    case "M":
      return "Modified";
    case "A":
      return "Added";
    case "D":
      return "Deleted";
    case "R":
      return "Renamed";
    case "??":
      return "Untracked";
    default:
      return "Changed";
  }
};

export const parseChangedFiles = (changedFiles: string[]): ParsedFileChange[] => {
  return changedFiles.map((file) => {
    if (file.startsWith("?? ")) {
      return {
        path: file.substring(3).trim(),
        stagedStatus: null,
        worktreeStatus: "??",
        isUntracked: true,
      };
    }

    if (file.length < 3) {
      return {
        path: file.trim(),
        stagedStatus: null,
        worktreeStatus: null,
        isUntracked: false,
      };
    }

    const stagedStatus = file[0] !== " " ? file[0] : null;
    const worktreeStatus = file[1] !== " " ? file[1] : null;
    const rawPath = file.substring(3).trim();
    const path = rawPath.includes(" -> ") ? rawPath.split(" -> ").pop() || rawPath : rawPath;

    return {
      path,
      stagedStatus,
      worktreeStatus,
      isUntracked: false,
    };
  });
};

export const filterStagedFiles = (files: ParsedFileChange[]): ParsedFileChange[] => {
  return files.filter((file) => file.stagedStatus && file.stagedStatus !== " ");
};

export const filterUnstagedFiles = (files: ParsedFileChange[]): ParsedFileChange[] => {
  return files.filter(
    (file) => (file.worktreeStatus && file.worktreeStatus !== " ") || file.isUntracked
  );
};
