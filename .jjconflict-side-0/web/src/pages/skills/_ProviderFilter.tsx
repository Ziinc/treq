import React, { useEffect, useRef, useState } from 'react';
import styles from './index.module.css';

interface Provider {
  id: string;
  name: string;
  skillCount: number;
}

// A dropdown multi-select for filtering skills by provider (GitHub org).
// An empty selection means "all providers".
export function ProviderFilter({
  providers,
  selected,
  onChange,
}: {
  providers: Provider[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const label =
    selected.size === 0
      ? 'All providers'
      : `${selected.size} provider${selected.size > 1 ? 's' : ''}`;

  return (
    <div className={styles.providerFilter} ref={ref}>
      <button
        type="button"
        className={styles.providerButton}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{label}</span>
        <span className={styles.caret} aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className={styles.providerMenu} role="listbox" aria-label="Providers">
          {selected.size > 0 && (
            <button type="button" className={styles.providerClear} onClick={() => onChange(new Set())}>
              Clear all
            </button>
          )}
          {providers.map((p) => (
            <label key={p.id} className={styles.providerOption}>
              <input
                type="checkbox"
                checked={selected.has(p.id)}
                onChange={() => toggle(p.id)}
              />
              <span className={styles.providerName}>{p.name}</span>
              <span className={styles.providerCount}>{p.skillCount}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
