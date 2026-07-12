import React, { useState, useCallback, useEffect } from 'react';
import styles from './bingo-card.module.css';
const TOPICS = [
    {
        id: 'pr-reviewer',
        label: 'PR Reviewer',
        emoji: '🔍',
        items: [
            'Nit:',
            'LGTM',
            'Can you add tests?',
            'Rename variable',
            'Can this be async?',
            'Please rebase',
            'Requesting changes',
            'Squash your commits',
            'This could be a one-liner',
            'Have you considered…',
            'See previous comment',
            'Magic number',
            'Add a JSDoc comment',
            'Missing type annotation',
            'DRY this up',
            'Why not just use X?',
            'Approve with nits',
            'Out of scope',
            'Run the linter',
            'Needs more context',
            'Can we abstract this?',
            'Left an inline comment',
            'Missing semicolon',
            'This breaks the contract',
            'Approved without reading',
            'Performance concern',
            'Security concern',
            'Nitpick: whitespace',
            'Can you split this PR?',
            'Approved with comments',
        ],
    },
    {
        id: 'ai-slop',
        label: 'AI Slop',
        emoji: '🤖',
        items: [
            'As an AI language model',
            "I cannot assist with that",
            'I apologize for any confusion',
            'Certainly! Here\'s how…',
            'Of course! I\'d be happy to',
            'Let me know if you need help',
            'I hope this helps!',
            'It\'s important to note that',
            'Delve into',
            'Hallucinated citation',
            'Confidently wrong answer',
            'Unnecessary disclaimer',
            'Excessive bullet points',
            'Great question!',
            'Repeated the question back',
            'In conclusion,',
            'Asked for code, got essay',
            'Markdown in plain text',
            'Truncated mid-sentence',
            'As of my knowledge cutoff',
            'I don\'t have real-time access',
            'Lorem ipsum filler',
            'Sycophantic opener',
            'Overexplained obvious thing',
            'Regurgitated the prompt',
            'Refused a harmless request',
            'Added unsolicited caveats',
            'Fake stats with no source',
            'Five paragraphs, zero info',
            'Blamed hallucination on user',
        ],
    },
    {
        id: 'vibe-coding',
        label: 'Vibe Coding',
        emoji: '✨',
        items: [
            'Ship it, fix later',
            'YOLO deploy to prod',
            'AI wrote this, idk',
            'No tests, vibes only',
            'Paste error into ChatGPT',
            'It works on my machine',
            'Commit: "stuff"',
            'Context window overflow',
            'Hallucinated API method',
            'Trust the AI',
            'README written by Claude',
            '0 tests, 100% confidence',
            'Asked AI to fix AI code',
            'Opened 12 Cursor tabs',
            'The AI knows best',
            'npm i --legacy-peer-deps',
            'Delete node_modules',
            'Just vibe with it',
            'Works until it doesn\'t',
            'Main branch deploy',
            'Blamed the framework',
            'Forgot to close the PR',
            'Four "rm -rf" undos',
            'Prompt-engineered tests',
            'Let the LLM decide',
            'Merged without reviewing',
            '"Fix it, I\'ll review later"',
            'Whole file pasted to AI',
            'Autocomplete wrote this',
            'Ship first, understand never',
        ],
    },
];
const GRID_SIZE = 5;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;
const FREE_INDEX = Math.floor(TOTAL_CELLS / 2); // center: index 12
// ── Helpers ────────────────────────────────────────────────────────────────────
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
function buildBoard(topic) {
    const picked = shuffle(topic.items).slice(0, TOTAL_CELLS - 1);
    const board = [...picked];
    board.splice(FREE_INDEX, 0, 'FREE');
    return board;
}
function checkBingo(marked) {
    const wins = [];
    // Rows
    for (let r = 0; r < GRID_SIZE; r++) {
        const row = Array.from({ length: GRID_SIZE }, (_, c) => r * GRID_SIZE + c);
        if (row.every((i) => marked.has(i)))
            wins.push(row);
    }
    // Columns
    for (let c = 0; c < GRID_SIZE; c++) {
        const col = Array.from({ length: GRID_SIZE }, (_, r) => r * GRID_SIZE + c);
        if (col.every((i) => marked.has(i)))
            wins.push(col);
    }
    // Diagonals
    const diag1 = Array.from({ length: GRID_SIZE }, (_, i) => i * GRID_SIZE + i);
    const diag2 = Array.from({ length: GRID_SIZE }, (_, i) => i * GRID_SIZE + (GRID_SIZE - 1 - i));
    if (diag1.every((i) => marked.has(i)))
        wins.push(diag1);
    if (diag2.every((i) => marked.has(i)))
        wins.push(diag2);
    return wins;
}
// ── Component ──────────────────────────────────────────────────────────────────
export function BingoCardContent() {
    const [activeTopicId, setActiveTopicId] = useState(TOPICS[0].id);
    const [board, setBoard] = useState(() => buildBoard(TOPICS[0]));
    const [marked, setMarked] = useState(() => new Set([FREE_INDEX]));
    const [winLines, setWinLines] = useState(new Set());
    const [justWon, setJustWon] = useState(false);
    const activeTopic = TOPICS.find((t) => t.id === activeTopicId);
    const randomise = useCallback(() => {
        const topic = TOPICS.find((t) => t.id === activeTopicId);
        setBoard(buildBoard(topic));
        const fresh = new Set([FREE_INDEX]);
        setMarked(fresh);
        setWinLines(new Set());
        setJustWon(false);
    }, [activeTopicId]);
    const switchTopic = useCallback((id) => {
        const topic = TOPICS.find((t) => t.id === id);
        setActiveTopicId(id);
        setBoard(buildBoard(topic));
        const fresh = new Set([FREE_INDEX]);
        setMarked(fresh);
        setWinLines(new Set());
        setJustWon(false);
    }, []);
    const toggleCell = useCallback((idx) => {
        if (idx === FREE_INDEX)
            return;
        setMarked((prev) => {
            const next = new Set(prev);
            if (next.has(idx)) {
                next.delete(idx);
            }
            else {
                next.add(idx);
            }
            return next;
        });
    }, []);
    useEffect(() => {
        const wins = checkBingo(marked);
        const winSet = new Set(wins.flat());
        setWinLines(winSet);
        if (wins.length > 0 && !justWon) {
            setJustWon(true);
        }
    }, [marked, justWon]);
    return (<div className={styles.page}>
      <div className={styles.pageHeader}>
        <div className={styles.breadcrumb}>
          <a href="/tools">Tools</a>
          <span> / </span>
          <span>Bingo Card</span>
        </div>
        <h1 className={styles.pageTitle}>Bingo Card Generator</h1>
        <p className={styles.pageSubtitle}>
          Mark squares as you spot them. First to five in a row wins.
        </p>
      </div>

      <div className={styles.content}>
        <div className={styles.tabs}>
          {TOPICS.map((topic) => (<button key={topic.id} className={`${styles.tab} ${topic.id === activeTopicId ? styles.tabActive : ''}`} onClick={() => switchTopic(topic.id)}>
              <span className={styles.tabEmoji}>{topic.emoji}</span>
              {topic.label}
            </button>))}
        </div>

        <div className={styles.controls}>
          <button className={styles.shuffleBtn} onClick={randomise}>
            <span className={styles.shuffleIcon}>🔀</span>
            Shuffle
          </button>
          {justWon && (<span className={styles.bingoBadge}>🎉 BINGO!</span>)}
        </div>

        <div className={styles.cardWrapper}>
          <div className={styles.headerRow}>
            {['B', 'I', 'N', 'G', 'O'].map((letter) => (<div key={letter} className={styles.headerCell}>
                {letter}
              </div>))}
          </div>
          <div className={styles.grid}>
            {board.map((text, idx) => {
            const isFree = idx === FREE_INDEX;
            const isMarked = marked.has(idx);
            const isWin = winLines.has(idx);
            return (<button key={idx} className={[
                    styles.cell,
                    isFree ? styles.cellFree : '',
                    isMarked ? styles.cellMarked : '',
                    isWin ? styles.cellWin : '',
                ]
                    .filter(Boolean)
                    .join(' ')} onClick={() => toggleCell(idx)} aria-pressed={isMarked} aria-label={isFree ? 'Free space' : text}>
                  {isFree ? (<span className={styles.freeLabel}>FREE</span>) : (<span className={styles.cellText}>{text}</span>)}
                </button>);
        })}
          </div>
        </div>

        <p className={styles.hint}>
          Click any square to mark it. The center square is always free.
        </p>
      </div>
    </div>);
}
