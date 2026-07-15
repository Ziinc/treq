import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ROADMAP_MILESTONES,
  buildRoadmapScene,
  type RoadmapSceneAPI,
} from './_roadmapScene';
import styles from './styles.module.css';

function useIsDark(): boolean {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const read = () =>
      document.documentElement.getAttribute('data-theme') === 'dark';
    setDark(read());

    const observer = new MutationObserver(() => setDark(read()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  return dark;
}

export default function RoadmapHero(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<RoadmapSceneAPI | null>(null);
  const dark = useIsDark();
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let mounted = true;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    buildRoadmapScene(canvas, {
      dark,
      reducedMotion,
      onActiveChange: (index) => {
        if (mounted) setActive(index);
      },
    }).then((api) => {
      if (!mounted) {
        api.dispose();
        return;
      }
      sceneRef.current = api;
      setReady(true);
    });

    return () => {
      mounted = false;
      sceneRef.current?.dispose();
      sceneRef.current = null;
      setReady(false);
    };
  }, [dark]);

  const select = useCallback((index: number) => {
    setActive(index);
    sceneRef.current?.setActive(index);
  }, []);

  const milestone = ROADMAP_MILESTONES[active];

  return (
    <section className={styles.hero} aria-label="Roadmap timeline visualization">
      <div className={styles.atmosphere} aria-hidden="true" />
      <div className={styles.inner}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>Product plan</p>
          <h1 className={styles.title}>Roadmap</h1>
          <p className={styles.lede}>
            Three milestones on one timeline: merge queues, workspace checks, then SSH remote development.
          </p>
        </div>

        <div className={styles.stage}>
          <canvas
            ref={canvasRef}
            className={`${styles.canvas}${ready ? ` ${styles.canvasReady}` : ''}`}
            aria-hidden="true"
          />

          <div className={styles.caption} aria-live="polite" key={milestone.id}>
            <span className={styles.quarter}>{milestone.quarter}</span>
            <a className={styles.captionTitle} href={milestone.href}>
              {milestone.title}
            </a>
            <p className={styles.captionSummary}>{milestone.summary}</p>
          </div>

          <div className={styles.controls} role="tablist" aria-label="Roadmap milestones">
            {ROADMAP_MILESTONES.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={index === active}
                className={`${styles.tab}${index === active ? ` ${styles.tabActive}` : ''}`}
                onClick={() => select(index)}
              >
                <span className={styles.tabQuarter}>{item.quarter}</span>
                <span className={styles.tabLabel}>{item.title}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
