import "react-native-url-polyfill/auto";
import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";

// Supabase's default localStorage-based session persistence doesn't exist on
// native — this adapter persists the session in the platform keychain so the
// rep stays logged in (and can keep queuing sales) while offline.
const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — set them in mobile/.env",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// autoRefreshToken only keeps the refresh timer running while something
// calls startAutoRefresh() — Supabase doesn't wire this to app lifecycle on
// its own. Without it, a token can go stale while backgrounded and the
// refresh silently never resumes, surfacing later as a 401 mid-sync instead
// of refreshing on foreground like it should.
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
if (AppState.currentState === "active") {
  supabase.auth.startAutoRefresh();
}

// Base URL of the Next.js web app — the mobile app talks to its API routes
// (/api/ceramics for catalog reads, /api/sales/sync for the offline queue),
// not directly to Supabase, so the existing oversell trigger + auth helpers
// in that backend are the single point of enforcement for both clients.
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL!;

if (!API_BASE_URL) {
  throw new Error("Missing EXPO_PUBLIC_API_URL — set it in mobile/.env");
}
