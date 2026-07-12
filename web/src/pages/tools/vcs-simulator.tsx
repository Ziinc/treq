import React, { useEffect, useRef, useState } from 'react';
import Layout from '@theme/Layout';
import { renderGraph } from './_graph-shared';
import { SCENARIOS, type VcsTag, type SimStep } from './_vcs-simulator-scenarios';
import styles from './vcs-simulator.module.css';

// ── VCS badge ─────────────────────────────────────────────────────────────────

function VcsBadge({ vcs }: { vcs: VcsTag }) {
  const cls =
    vcs === 'git'
      ? styles.vcsBadgeGit
      : vcs === 'jj'
        ? styles.vcsBadgeJj
        : styles.vcsBadgeShell;
  return <span className={`${styles.vcsBadge} ${cls}`}>{vcs === 'shell' ? '$' : vcs}</span>;
}

// ── Terminal ───────────────────────────────────────────────────────────────────

function Terminal({ step }: { step: SimStep | null }) {
  const commandClass =
    step?.vcs === 'git'
      ? styles.terminalCommandGit
      : step?.vcs === 'jj'
        ? styles.terminalCommandJj
        : styles.terminalCommand;

  return (
    <div className={styles.terminalPanel}>
      <div className={styles.terminalHeader}>
        <div className={styles.terminalDots}>
          <div className={styles.terminalDot} style={{ background: '#ef4444' }} />
          <div className={styles.terminalDot} style={{ background: '#f59e0b' }} />
          <div className={styles.terminalDot} style={{ background: '#10b981' }} />
        </div>
        <span className={styles.terminalTitle}>terminal</span>
      </div>
      <div className={styles.terminalBody}>
        {!step ? (
          <span className={styles.terminalEmpty}>Select a step to execute it...</span>
        ) : (
          <>
            <div>
              <span className={styles.terminalPrompt}>$ </span>
              <span className={commandClass}>{step.command}</span>
            </div>
            {step.output && (
              <div className={styles.terminalOutput}>{step.output}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Graph canvas ───────────────────────────────────────────────────────────────

function GraphCanvas({
  step,
  dark,
}: {
  step: SimStep | null;
  dark: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    const state = step?.graphState ?? { branches: [], commits: [], title: '' };
    renderGraph(svgRef.current, state, dark, {
      highlightedId: step?.highlightedCommitId,
      headLabel: step?.headLabel,
    });
  }, [step, dark]);

  return (
    <div className={styles.graphPanel}>
      <div className={styles.graphHeader}>
        <span className={styles.graphTitle}>
          {step ? step.graphState.title : 'Commit graph'}
        </span>
        <span className={styles.graphMeta}>
          {step
            ? `${step.graphState.commits.length} commit${step.graphState.commits.length !== 1 ? 's' : ''}`
            : '—'}
        </span>
      </div>
      <div className={styles.graphCanvas}>
        <svg ref={svgRef} />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function VcsSimulatorPage() {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(-1); // -1 = before any step
  const [dark, setDark] = useState(false);

  const scenario = SCENARIOS[scenarioIdx];
  const currentStep = stepIdx >= 0 ? scenario.steps[stepIdx] : null;
  const totalSteps = scenario.steps.length;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const handleScenario = (idx: number) => {
    setScenarioIdx(idx);
    setStepIdx(-1);
  };

  const handleStep = (idx: number) => {
    setStepIdx(idx);
  };

  const handleNext = () => {
    if (stepIdx < totalSteps - 1) setStepIdx((i) => i + 1);
  };

  const handleBack = () => {
    if (stepIdx > -1) setStepIdx((i) => i - 1);
  };

  const handleReset = () => setStepIdx(-1);

  return (
    <Layout
      title="VCS Simulator"
      description="Step through git and jj commands interactively, watching the commit graph update in real time."
    >
      <div className={styles.page}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.breadcrumb}>
            <a href="/tools">Tools</a>
            <span> / </span>
            <span>VCS Simulator</span>
          </div>
          <h1 className={styles.pageTitle}>VCS Simulator</h1>
          <p className={styles.pageSubtitle}>
            Step through git and jj commands interactively — watch the commit graph update in real
            time and see the terminal output for each command.
          </p>
        </div>

        {/* Scenario selector */}
        <div className={styles.scenarioTabs}>
          {SCENARIOS.map((s, i) => (
            <button
              key={s.id}
              className={`${styles.scenarioTab} ${i === scenarioIdx ? styles.scenarioTabActive : ''}`}
              onClick={() => handleScenario(i)}
            >
              <span className={styles.scenarioIcon}>{s.icon}</span>
              {s.name}
            </button>
          ))}
        </div>

        <p className={styles.scenarioDesc}>{scenario.description}</p>

        <div className={styles.scenarioTagRow}>
          {scenario.tags.map((t) => (
            <span key={t} className={styles.scenarioTag}>{t}</span>
          ))}
        </div>

        {/* Workspace */}
        <div className={styles.workspace}>
          {/* Left: steps panel */}
          <div className={styles.stepsPanel}>
            <div className={styles.stepsPanelHeader}>
              <span className={styles.stepsPanelTitle}>Steps</span>
              <span className={styles.stepCounter}>
                {stepIdx < 0 ? 0 : stepIdx + 1} / {totalSteps}
              </span>
            </div>

            <div className={styles.stepsList}>
              {scenario.steps.map((step, i) => {
                const isDone = i < stepIdx;
                const isActive = i === stepIdx;
                const isPending = i > stepIdx;

                return (
                  <div
                    key={i}
                    className={`${styles.stepItem} ${isActive ? styles.stepItemActive : ''} ${isDone ? styles.stepItemDone : ''}`}
                    onClick={() => handleStep(i)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && handleStep(i)}
                    aria-label={`Step ${i + 1}: ${step.command}`}
                  >
                    <div
                      className={`${styles.stepStatus} ${isActive ? styles.stepStatusActive : isDone ? styles.stepStatusDone : styles.stepStatusPending}`}
                    >
                      {isDone ? '✓' : isActive ? '▶' : String(i + 1)}
                    </div>
                    <div className={styles.stepContent}>
                      <div className={styles.stepCommand}>
                        <VcsBadge vcs={step.vcs} />
                        <span>{step.command}</span>
                      </div>
                      <div className={styles.stepDesc}>{step.description}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={styles.stepsNav}>
              <button
                className={styles.navBtn}
                onClick={handleBack}
                disabled={stepIdx < 0}
              >
                ← Back
              </button>
              <button
                className={`${styles.navBtn} ${styles.navBtnPrimary}`}
                onClick={handleNext}
                disabled={stepIdx >= totalSteps - 1}
              >
                {stepIdx < 0 ? 'Start →' : 'Next →'}
              </button>
              <button
                className={styles.resetBtn}
                onClick={handleReset}
                disabled={stepIdx < 0}
                title="Reset to beginning"
              >
                ↺
              </button>
            </div>
          </div>

          {/* Right: graph + terminal */}
          <div className={styles.rightPanel}>
            {currentStep && (
              <div className={styles.infoBox}>
                <span className={styles.infoBoxIcon}>💡</span>
                <span>{currentStep.description}</span>
              </div>
            )}

            <GraphCanvas step={currentStep} dark={dark} />
            <Terminal step={currentStep} />
          </div>
        </div>
      </div>
    </Layout>
  );
}
