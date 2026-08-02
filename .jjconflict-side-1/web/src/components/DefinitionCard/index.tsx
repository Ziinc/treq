import React from 'react';
import styles from './styles.module.css';

interface DefinitionCardProps {
  term: string;
  definition: string;
}

export default function DefinitionCard({ term, definition }: DefinitionCardProps) {
  return (
    <div className={styles.card}>
      <p className={styles.label}>Definition</p>
      <p className={styles.term}>{term}</p>
      <p className={styles.definition}>{definition}</p>
    </div>
  );
}
