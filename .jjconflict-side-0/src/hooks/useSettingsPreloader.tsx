import { useEffect } from "react";
import { getSettingsBatch } from "../lib/api";

/**
 * Pre-loads common settings in a single batch request to reduce
 * startup database calls from 3 to 1.
 */
export const useSettingsPreloader = () => {
  useEffect(() => {
    // Pre-fetch all common settings in one batch
    getSettingsBatch(["theme", "terminal_font_size", "diff_font_size"]).catch((error) => {
      console.error("Failed to preload settings:", error);
    });
  }, []);
};
