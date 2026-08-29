import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { getPreference, setPreference } from "@/lib/db";
import { lightColors, darkColors, getShadow, type ThemeColors } from "@/constants/theme";

type Scheme = "light" | "dark";

const STORAGE_KEY = "theme_preference";

type ThemeContextValue = {
  scheme: Scheme;
  colors: ThemeColors;
  shadow: ReturnType<typeof getShadow>;
  toggleTheme: () => void;
  setScheme: (scheme: Scheme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  // Render immediately with the system scheme as a first-launch default —
  // the persisted choice (if any) swaps in a moment later once SQLite
  // resolves, instead of blocking the whole app behind a blank screen.
  const [scheme, setSchemeState] = useState<Scheme>(systemScheme === "dark" ? "dark" : "light");

  useEffect(() => {
    getPreference(STORAGE_KEY).then((saved) => {
      if (saved === "light" || saved === "dark") setSchemeState(saved);
    });
    // Only ever read the persisted choice once on mount — the system
    // scheme is just the first-launch default, not a live override.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setScheme(next: Scheme) {
    setSchemeState(next);
    setPreference(STORAGE_KEY, next);
  }

  function toggleTheme() {
    setScheme(scheme === "dark" ? "light" : "dark");
  }

  return (
    <ThemeContext.Provider
      value={{
        scheme,
        colors: scheme === "dark" ? darkColors : lightColors,
        shadow: getShadow(scheme),
        toggleTheme,
        setScheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
