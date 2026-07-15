import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ROADMAP_YEARS,
  firstPlannedIndex,
  isQuarterPlanned,
  quarterLabel,
  type YearRoadmap,
} from './_roadmapData';
import { buildRoadmapScene, type RoadmapSceneAPI } from './_roadmapScene';
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

function YearBlock({ year }: { year: YearRoadmap }): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<RoadmapSceneAPI | null>(null);
  const dark = useIsDark();
  const [active, setActive] = useState(() => firstPlannedIndex(year));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let mounted = true;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    buildRoadmapScene(canvas, {
      year,
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
  }, [dark, year]);

  const select = useCallback((index: number) => {
    setActive(index);
    sceneRef.current?.setActive(index);
  }, []);

  const slot = year.quarters[active];
  const planned = isQuarterPlanned(slot);

  return (
    <div className={styles.yearBlock}>
      <div className={styles.yearHeader}>
        <h2 className={styles.yearTitle} id={`year-${year.year}`}>
          {year.year}
        </h2>
        <p className={styles.yearLede}>
          Quarters without planned work stay grey on the timeline.
        </p>
      </div>

      <div className={styles.stage}>
        <canvas
          ref={canvasRef}
          className={`${styles.canvas}${ready ? ` ${styles.canvasReady}` : ''}`}
          aria-hidden="true"
        />

        <div className={styles.table} role="tablist" aria-label={`${year.year} quarters`}>
          {year.quarters.map((item, index) => {
            const hasPlan = isQuarterPlanned(item);
            const label = hasPlan
              ? item.milestones.map((m) => m.shortTitle).join(', ')
              : 'Nothing planned';
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={index === active}
                className={[
                  styles.row,
                  index === active ? styles.rowActive : '',
                  !hasPlan ? styles.rowEmpty : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => select(index)}
              >
                <span className={styles.rowQuarter}>{quarterLabel(year.year, item.id)}</span>
                <span className={styles.rowTitle}>{label}</span>
              </button>
            );
          })}
        </div>

        <div className={styles.outcome} aria-live="polite" key={`${year.year}-${slot.id}`}>
          {!planned ? (
            <>
              <p className={styles.outcomeTitleText}>
                {quarterLabel(year.year, slot.id)}
              </p>
              <p className={styles.outcomeText}>Nothing planned for this quarter.</p>
            </>
          ) : (
            <ul className={styles.outcomeList}>
              {slot.milestones.map((milestone) => (
                <li key={milestone.id} className={styles.outcomeItem}>
                  <a className={styles.outcomeTitle} href={milestone.href}>
                    {milestone.title}
                  </a>
                  <p className={styles.outcomeText}>{milestone.outcome}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RoadmapHero(): React.ReactElement {
  return (
    <section className={styles.hero} aria-label="Roadmap timeline">
      <div className={styles.atmosphere} aria-hidden="true" />
      <div className={styles.inner}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>Product plan</p>
          <h1 className={styles.title}>Roadmap</h1>
          <p className={styles.lede}>
            Year-by-year milestones. Newer years land above older ones as planning opens.
          </p>
        </div>

        {ROADMAP_YEARS.map((year) => (
          <YearBlock key={year.year} year={year} />
        ))}
      </div>
    </section>
  );
}
