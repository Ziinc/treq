import { useState, useEffect } from "react";
import { gitGetChangedFiles } from "../lib/api";
import { parseChangedFiles, type ParsedFileChange } from "../lib/git-utils";

/**
 * Hook to load and track changed files for a given workspace path
 * Returns a Map where keys are full file paths and values are ParsedFileChange objects
 */
export function useChangedFiles(basePath: string | undefined): Map<string, ParsedFileChange> {
  const [changedFiles, setChangedFiles] = useState<Map<string, ParsedFileChange>>(new Map());

  useEffect(() => {
    if (!basePath) {
      setChangedFiles(new Map());
      return;
    }

    const loadChangedFiles = async () => {
      try {
        const files = await gitGetChangedFiles(basePath);
        const parsed = parseChangedFiles(files);
        const fileMap = new Map<string, ParsedFileChange>();
        for (const file of parsed) {
          fileMap.set(`${basePath}/${file.path}`, file);
        }
        setChangedFiles(fileMap);
      } catch (error) {
        // Silently fail - git status is optional
        console.error("Failed to load git status:", error);
        setChangedFiles(new Map());
      }
    };

    loadChangedFiles();
  }, [basePath]);

  return changedFiles;
}
