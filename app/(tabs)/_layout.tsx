import { useMemo } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/auth-context";
import { useAutoSync } from "@/hooks/use-auto-sync";
import { useTheme } from "@/context/theme-context";
import type { ThemeColors } from "@/constants/theme";

export default function TabsLayout() {
  const { session, loading } = useAuth();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  useAutoSync();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: [styles.tabBar, { height: 52 + insets.bottom, paddingBottom: insets.bottom + 6 }],
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Sell",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "storefront" : "storefront-outline"}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="queue"
        options={{
          title: "Order Queue",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "receipt" : "receipt-outline"}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "person-circle" : "person-circle-outline"}
              size={22}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    loading: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.background,
    },
    tabBar: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
      paddingTop: 8,
    },
    tabBarItem: {
      paddingTop: 2,
    },
    tabBarLabel: {
      fontSize: 11,
      fontWeight: "600",
    },
  });
}
