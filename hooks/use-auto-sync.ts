import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { runSync } from "@/lib/sync";
import { useAuth } from "@/context/auth-context";

/** Triggers the sync engine on reconnect and on app foreground. */
export function useAutoSync(onSyncComplete?: () => void) {
  const { session } = useAuth();
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!session) return;

    const unsubscribeNet = NetInfo.addEventListener((state) => {
      const isOnline = !!state.isConnected && state.isInternetReachable !== false;
      if (isOnline && wasOffline.current) {
        runSync().then(onSyncComplete);
      }
      wasOffline.current = !isOnline;
    });

    const appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        runSync().then(onSyncComplete);
      }
    });

    // Fire once on mount too (covers "already online when the screen opens").
    runSync().then(onSyncComplete);

    return () => {
      unsubscribeNet();
      appStateSub.remove();
    };
  }, [session, onSyncComplete]);
}
