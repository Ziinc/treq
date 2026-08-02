import React from 'react';
import type { SkillFile } from './types';
import styles from './styles.module.css';

// Shown only on narrow viewports (see the media query in styles.module.css) —
// the two-pane tree/viewer layout doesn't fit on mobile, so file choice
// becomes a dropdown instead of a sidebar tree.
export function MobileFileSelect({
  files,
  selectedPath,
  onSelect,
}: {
  files: SkillFile[];
  selectedPath: string | null;
  onSelect: (file: SkillFile) => void;
}) {
  return (
    <select
      className={styles.mobileSelect}
      aria-label="Choose a file"
      value={selectedPath ?? ''}
      onChange={(e) => {
        const file = files.find((f) => f.path === e.target.value);
        if (file) onSelect(file);
      }}
    >
      {!selectedPath && <option value="" disabled>Select a file…</option>}
      {files.map((file) => (
        <option key={file.path} value={file.path}>
          {file.path}
        </option>
      ))}
    </select>
  );
}
