import { useLayoutEffect, type ReactNode } from "react";
import { mutate as defaultMutate, useSWRConfig, type Key } from "swr";

type ScopedMutate = typeof defaultMutate;

let scopedMutate: ScopedMutate = defaultMutate;

export function SWRMutateScope({ children }: { children: ReactNode }) {
  const { mutate } = useSWRConfig();
  useLayoutEffect(() => {
    scopedMutate = mutate as ScopedMutate;
    return () => {
      scopedMutate = defaultMutate;
    };
  }, [mutate]);
  return children;
}

export function keyMatchesPrefix(
  key: Key,
  prefix: readonly unknown[],
): boolean {
  if (!Array.isArray(key)) return false;
  if (key.length < prefix.length) return false;
  return prefix.every((part, i) => Object.is(key[i], part));
}

/** Revalidate SWR keys whose array form starts with `prefix`. Omit prefix to revalidate all. */
export function invalidateQueries(prefix?: readonly unknown[]) {
  if (!prefix) {
    return scopedMutate(() => true);
  }
  return scopedMutate((key) => keyMatchesPrefix(key, prefix));
}

export function setQueryData<T>(key: unknown[], data: T) {
  return scopedMutate(key, data, { revalidate: false });
}

export async function fetchAndCache<T>(
  key: unknown[],
  fn: () => Promise<T>,
): Promise<T> {
  const data = await fn();
  await scopedMutate(key, data, { revalidate: false });
  return data;
}

export async function clearSWRCache(): Promise<void> {
  await scopedMutate(() => true, undefined, { revalidate: false });
}

export const defaultSWRConfig = {
  revalidateOnFocus: false,
  errorRetryCount: 1,
} as const;

export const testSWRConfig = {
  revalidateOnFocus: false,
  errorRetryCount: 0,
  provider: () => new Map(),
};
