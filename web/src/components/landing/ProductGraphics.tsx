import type {ReactNode} from 'react';
import styles from '../../pages/index.module.css';

export function RebaseGraphic(): ReactNode {
  return (
    <svg
      className={styles.rebaseGraphic}
      viewBox="0 0 460 240"
      role="img"
      aria-label="A stacked branch rebases when main, the default branch it targets, moves forward">
      <title>When main moves, the stack rebases onto the new tip</title>

      <text className={styles.rebaseCaption} x="24" y="28">
        main moves
      </text>
      <text className={`${styles.rebaseCaption} ${styles.rebaseCaptionDim}`} x="118" y="28">
        · stack follows
      </text>

      <path className={styles.rebaseBase} d="M32 168 H210" />
      <path className={styles.rebaseBaseAdvance} d="M210 168 H358" />

      <circle className={styles.rebaseDot} cx="56" cy="168" r="7" />
      <circle className={styles.rebaseDot} cx="132" cy="168" r="7" />
      <circle className={styles.rebaseDot} cx="210" cy="168" r="7" />
      <circle className={styles.rebaseDotAdvance} cx="286" cy="168" r="7" />
      <circle className={styles.rebaseDotAdvance} cx="358" cy="168" r="8" />

      <g className={styles.rebaseMainLabel}>
        <text className={styles.rebaseLabel} x="210" y="196" textAnchor="middle">
          main
        </text>
      </g>

      <g className={styles.rebaseStackGhost} transform="translate(210 168)">
        <path className={styles.rebaseStack} d="M0 0 V-56" />
        <circle className={styles.rebaseStackDot} cx="0" cy="-56" r="8" />
        <text className={styles.rebaseLabel} x="14" y="-52">
          PR 1
        </text>
        <path className={styles.rebaseStack} d="M0 -56 V-112" />
        <circle className={`${styles.rebaseStackDot} ${styles.rebaseStackDotActive}`} cx="0" cy="-112" r="8" />
        <text className={styles.rebaseLabel} x="14" y="-108">
          PR 2
        </text>
      </g>

      <g className={styles.rebaseStackLive}>
        <path className={styles.rebaseStack} d="M0 0 V-56" />
        <circle className={styles.rebaseStackDot} cx="0" cy="-56" r="8" />
        <text className={styles.rebaseLabel} x="14" y="-52">
          PR 1
        </text>
        <path className={styles.rebaseStack} d="M0 -56 V-112" />
        <circle className={`${styles.rebaseStackDot} ${styles.rebaseStackDotActive}`} cx="0" cy="-112" r="8" />
        <text className={styles.rebaseLabel} x="14" y="-108">
          PR 2
        </text>
      </g>
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
