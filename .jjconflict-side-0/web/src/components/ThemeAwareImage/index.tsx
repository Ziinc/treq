import React from 'react';
import clsx from 'clsx';
import styles from './styles.module.css';

interface ThemeAwareImageProps {
  src: string;
  alt: string;
  caption?: string;
  className?: string;
  invertInDarkMode?: boolean;
}

export default function ThemeAwareImage({
  src,
  alt,
  caption,
  className,
  invertInDarkMode = false,
}: ThemeAwareImageProps) {
  const shouldInvertInDarkMode = invertInDarkMode || src.endsWith('.excalidraw.svg');

  return (
    <figure className={clsx(styles.figure, className)}>
      <img
        className={clsx(styles.image, shouldInvertInDarkMode && styles.invertInDarkMode)}
        src={src}
        alt={alt}
      />
      {caption && <figcaption className={styles.caption}>{caption}</figcaption>}
    </figure>
  );
}
