import { View, ActivityIndicator } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { useAuth } from "@/context/auth-context";
import { useAutoSync } from "@/hooks/use-auto-sync";

export default function TabsLayout() {
  const { session, loading } = useAuth();
  useAutoSync();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs screenOptions={{ headerTitleStyle: { fontWeight: "700" } }}>
      <Tabs.Screen name="index" options={{ title: "Sell" }} />
      <Tabs.Screen name="queue" options={{ title: "Sale Queue" }} />
    </Tabs>
  );
}
