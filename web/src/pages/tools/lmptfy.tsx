import React, { useCallback, useEffect, useRef, useState } from 'react';
import Layout from '@theme/Layout';
import { useHistory, useLocation } from '@docusaurus/router';
import styles from './lmptfy.module.css';

// ── URL encoding ──────────────────────────────────────────────────────────────

function encodePrompt(text: string): string {
  return btoa(encodeURIComponent(text));
}

function decodePrompt(raw: string): string | null {
  try {
    return decodeURIComponent(atob(raw));
  } catch {
    return null;
  }
}

// ── Typing animation hook ─────────────────────────────────────────────────────

function useTypingAnimation(text: string | null, speed = 38) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!text) return;
    setDisplayed('');
    setDone(false);

    let i = 0;
    const chars = Array.from(text);

    const tick = () => {
      i++;
      setDisplayed(chars.slice(0, i).join(''));
      if (i >= chars.length) {
        setDone(true);
        return;
      }
      const jitter = speed + Math.random() * 30 - 10;
      setTimeout(tick, jitter);
    };

    const start = setTimeout(tick, 600);
    return () => clearTimeout(start);
  }, [text, speed]);

  return { displayed, done };
}

// ── ChatGPT / Claude URLs ─────────────────────────────────────────────────────

function chatgptUrl(prompt: string) {
  return `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
}

function claudeUrl(prompt: string) {
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LmptfyPage() {
  const location = useLocation();
  const history = useHistory();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [inputText, setInputText] = useState('');
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState<'chatgpt' | 'claude' | null>(null);

  const params = new URLSearchParams(location.search);
  const rawQ = params.get('q');
  const sharedPrompt = rawQ ? decodePrompt(rawQ) : null;

  const { displayed, done } = useTypingAnimation(sharedPrompt);

  const handleGenerate = useCallback(() => {
    if (!inputText.trim()) return;
    const encoded = encodePrompt(inputText.trim());
    const url = `${window.location.origin}/tools/lmptfy?q=${encoded}`;
    setGeneratedUrl(url);
    setCopied(false);
    history.push(`/tools/lmptfy?q=${encoded}`);
  }, [inputText, history]);

  const handleCopyUrl = useCallback(async () => {
    if (!generatedUrl) return;
    await navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [generatedUrl]);

  const handleOpenAI = useCallback(
    async (target: 'chatgpt' | 'claude') => {
      const prompt = sharedPrompt ?? inputText.trim();
      if (!prompt) return;

      await navigator.clipboard.writeText(prompt);
      setPromptCopied(target);
      setTimeout(() => setPromptCopied(null), 2500);

      const url = target === 'chatgpt' ? chatgptUrl(prompt) : claudeUrl(prompt);
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    [sharedPrompt, inputText],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleGenerate();
      }
    },
    [handleGenerate],
  );

  const promptToDisplay = sharedPrompt ?? '';
  const hasSharedPrompt = sharedPrompt !== null;

  return (
    <Layout
      title="LMPTFY — Let Me Prompt That For You"
      description="Generate a shareable link that types out an AI prompt for someone — tell them to just ask an AI already."
    >
      <div className={styles.page}>
        <div className={styles.header}>
          <div className={styles.breadcrumb}>
            <a href="/tools">Tools</a>
            <span> / </span>
            <span>LMPTFY</span>
          </div>
          <h1 className={styles.pageTitle}>Let Me Prompt That For You</h1>
          <p className={styles.pageSubtitle}>
            Generate a shareable link that shows someone how to just ask an AI.
          </p>
        </div>

        {/* Shared prompt viewer */}
        {hasSharedPrompt && (
          <div className={styles.viewerSection}>
            <div className={styles.aiBox}>
              <div className={styles.aiBoxHeader}>
                <div className={styles.aiBoxDots}>
                  <span />
                  <span />
                  <span />
                </div>
                <span className={styles.aiBoxTitle}>AI Prompt</span>
              </div>
              <div className={styles.aiBoxBody}>
                <span className={styles.promptCursor}>›</span>
                <span className={styles.typedText}>{displayed}</span>
                {!done && <span className={styles.caret} />}
              </div>
            </div>

            {done && (
              <div className={styles.buttons}>
                <button
                  className={`${styles.aiBtn} ${styles.chatgptBtn}`}
                  onClick={() => handleOpenAI('chatgpt')}
                >
                  <ChatGPTIcon />
                  Ask ChatGPT
                  {promptCopied === 'chatgpt' && (
                    <span className={styles.copiedBadge}>Prompt copied!</span>
                  )}
                </button>
                <button
                  className={`${styles.aiBtn} ${styles.claudeBtn}`}
                  onClick={() => handleOpenAI('claude')}
                >
                  <ClaudeIcon />
                  Ask Claude
                  {promptCopied === 'claude' && (
                    <span className={styles.copiedBadge}>Prompt copied!</span>
                  )}
                </button>
              </div>
            )}

            <div className={styles.divider}>
              <span>or generate your own</span>
            </div>
          </div>
        )}

        {/* Generator */}
        <div className={styles.generatorSection}>
          <p className={styles.generatorLabel}>
            {hasSharedPrompt ? 'Create a new LMPTFY link' : 'Type a prompt to generate a shareable link'}
          </p>
          <div className={styles.generatorBox}>
            <textarea
              ref={inputRef}
              className={styles.generatorInput}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. How does TCP/IP work?"
              rows={3}
            />
            <button
              className={styles.generateBtn}
              onClick={handleGenerate}
              disabled={!inputText.trim()}
            >
              Generate link
            </button>
          </div>

          {generatedUrl && (
            <div className={styles.resultBox}>
              <span className={styles.resultUrl}>{generatedUrl}</span>
              <button className={styles.copyBtn} onClick={handleCopyUrl}>
                {copied ? '✓ Copied!' : 'Copy link'}
              </button>
            </div>
          )}
        </div>

        <div className={styles.about}>
          <p>
            <strong>LMPTFY</strong> is a playful tool for sending people a hint to just ask an
            AI themselves. Generate a link, share it, and let the typing animation do the
            passive-aggressive work for you.
          </p>
        </div>
      </div>
    </Layout>
  );
}

// ── AI Brand Icons ────────────────────────────────────────────────────────────

function ChatGPTIcon() {
  return (
    <svg
      className={styles.aiIcon}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855l-5.843-3.371 2.019-1.168a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.4-.68zm2.010-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
    </svg>
  );
}

function ClaudeIcon() {
  return (
    <svg
      className={styles.aiIcon}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128-4.72-2.648-.23.097v5.56l.23.076zM19.37 15.955l-4.72-2.647-.08-.23.08-.128 4.72-2.648.23.097v5.56l-.23.076zM14.745 8.105l-2.744-4.72-.23-.08-.23.08-2.743 4.72.128.22h5.691l.128-.22zM14.745 15.895l-2.744 4.72-.23.08-.23-.08-2.743-4.72.128-.22h5.691l.128.22zM9.287 8.04l4.72 2.648.08.23-.08.128-4.72 2.647-.23-.08V8.117l.23-.076zM14.713 8.04l-4.72 2.648-.08.23.08.128 4.72 2.647.23-.08V8.117l-.23-.076z" />
    </svg>
  );
}
