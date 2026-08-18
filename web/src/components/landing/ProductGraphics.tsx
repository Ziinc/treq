import type {ReactNode} from 'react';
import styles from '../../pages/index.module.css';

export function RebaseGraphic(): ReactNode {
  return (
    <svg
      className={styles.rebaseGraphic}
      viewBox="0 0 420 220"
      role="img"
      aria-label="Stacked branches rebase onto a moving base">
      <title>Stacked workspaces rebase when the base moves</title>
      <path className={styles.rebaseBase} d="M24 180 H396" />
      <circle className={styles.rebaseDot} cx="48" cy="180" r="7" />
      <circle className={styles.rebaseDot} cx="140" cy="180" r="7" />
      <circle className={styles.rebaseDot} cx="232" cy="180" r="7" />
      <circle className={styles.rebaseDotMove} cx="324" cy="180" r="8" />
      <text className={styles.rebaseLabel} x="48" y="204">
        main
      </text>
      <path className={styles.rebaseStack} d="M140 180 C140 120, 232 120, 232 70" />
      <circle className={styles.rebaseStackDot} cx="232" cy="70" r="8" />
      <text className={styles.rebaseLabel} x="248" y="64">
        PR 1
      </text>
      <path className={styles.rebaseStack} d="M232 70 C232 36, 324 36, 324 28" />
      <circle className={`${styles.rebaseStackDot} ${styles.rebaseStackDotActive}`} cx="324" cy="28" r="8" />
      <text className={styles.rebaseLabel} x="340" y="24">
        PR 2
      </text>
    </svg>
  );
}

export function WorkspaceTreeGraphic(): ReactNode {
  return (
    <div className={styles.treeGraphic} aria-label="Workspace directory layout">
      <ul>
        <li>
          <span className={styles.treeFolder}>.treq</span>
          <ul>
            <li>
              <span className={styles.treeFolder}>workspaces</span>
              <ul>
                <li>
                  <span className={styles.treeFolder}>feat-event-ingest</span>
                  <ul>
                    <li>packages/</li>
                    <li>README.md</li>
                  </ul>
                </li>
                <li>
                  <span className={styles.treeFolder}>feat-empty-event-message</span>
                  <ul>
                    <li>packages/</li>
                    <li>README.md</li>
                  </ul>
                </li>
                <li>
                  <span className={styles.treeFolder}>feat-keyvalues-cache</span>
                </li>
              </ul>
            </li>
          </ul>
        </li>
      </ul>
    </div>
  );
}
