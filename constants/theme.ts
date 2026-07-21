export type ThemeColors = typeof lightColors;

export const lightColors = {
  primary: "#2563eb",
  primaryDark: "#1d4ed8",
  primarySoft: "#eff6ff",
  success: "#059669",
  successSoft: "#ecfdf5",
  warning: "#d97706",
  warningSoft: "#fffbeb",
  danger: "#dc2626",
  dangerSoft: "#fef2f2",
  text: "#0f172a",
  textMuted: "#64748b",
  textFaint: "#94a3b8",
  border: "#e6e9ef",
  borderStrong: "#d7dce4",
  surface: "#ffffff",
  surfaceMuted: "#f4f6f9",
  background: "#f8f9fb",
};

export const darkColors: ThemeColors = {
  primary: "#3b82f6",
  primaryDark: "#60a5fa",
  primarySoft: "#1e293b",
  success: "#34d399",
  successSoft: "#0f2b23",
  warning: "#fbbf24",
  warningSoft: "#2e2308",
  danger: "#f87171",
  dangerSoft: "#3a1414",
  text: "#f1f5f9",
  textMuted: "#94a3b8",
  textFaint: "#64748b",
  border: "#27303f",
  borderStrong: "#39424f",
  surface: "#161b24",
  surfaceMuted: "#1f2530",
  background: "#0b0e13",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
};

export function getShadow(scheme: "light" | "dark") {
  const opacityScale = scheme === "dark" ? 1.6 : 1;
  return {
    card: {
      shadowColor: "#000000",
      shadowOpacity: 0.06 * opacityScale,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 3 },
      elevation: 2,
    },
    floating: {
      shadowColor: "#000000",
      shadowOpacity: 0.18 * opacityScale,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
  };
}

/** @deprecated Static light-mode fallback — prefer useTheme() so styles react
 * to the user's theme choice. Kept only for call sites not yet migrated. */
export const colors = lightColors;
/** @deprecated see `colors` above. */
export const shadow = getShadow("light");
