import { defaultAuthState, useAuthStore } from "./authStore";
import {
  defaultDiffSettingsState,
  useDiffSettingsStore,
} from "./diffSettingsStore";
import { defaultEditorAppsState, useEditorAppsStore } from "./editorAppsStore";
import {
  defaultTerminalSettingsState,
  useTerminalSettingsStore,
} from "./terminalSettingsStore";
import { defaultThemeState, useThemeStore } from "./themeStore";
import {
  clearToastTimers,
  defaultToastState,
  useToastStore,
} from "./toastStore";
import { defaultTreqSendState, useTreqSendStore } from "./treqSendStore";
import {
  defaultZoomSettingsState,
  useZoomSettingsStore,
} from "./zoomSettingsStore";

export function resetAllStores() {
  useThemeStore.setState({ ...defaultThemeState });
  useDiffSettingsStore.setState({ ...defaultDiffSettingsState });
  useTerminalSettingsStore.setState({ ...defaultTerminalSettingsState });
  useZoomSettingsStore.setState({ ...defaultZoomSettingsState });
  useEditorAppsStore.setState({ ...defaultEditorAppsState });
  useAuthStore.setState({ ...defaultAuthState });
  clearToastTimers();
  useToastStore.setState({ ...defaultToastState });
  useTreqSendStore.setState({ ...defaultTreqSendState });
}
