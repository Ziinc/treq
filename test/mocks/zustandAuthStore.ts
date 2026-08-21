/** Zustand hook mock that also exposes getState for AppStoreEffects. */
export function createAuthStoreMock<T extends object>(auth: T) {
  return Object.assign(
    (selector?: (state: T) => unknown) =>
      typeof selector === "function" ? selector(auth) : auth,
    {
      getState: () => ({
        ...auth,
        restoreSession: async () => {},
        exchangeToken: async () => {},
      }),
      setState: () => {},
    },
  );
}
