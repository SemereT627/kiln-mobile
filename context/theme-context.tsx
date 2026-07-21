import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";
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
  const [scheme, setSchemeState] = useState<Scheme>(systemScheme === "dark" ? "dark" : "light");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY).then((saved) => {
      if (saved === "light" || saved === "dark") setSchemeState(saved);
      setLoaded(true);
    });
    // Only ever read the persisted choice once on mount — the system
    // scheme is just the first-launch default, not a live override.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setScheme(next: Scheme) {
    setSchemeState(next);
    SecureStore.setItemAsync(STORAGE_KEY, next);
  }

  function toggleTheme() {
    setScheme(scheme === "dark" ? "light" : "dark");
  }

  if (!loaded) return null;

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
