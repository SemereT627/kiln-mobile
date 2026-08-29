import { Stack } from "expo-router";

/** Day list (index) → day detail ([date]), both with their own custom
 * headers matching the rest of the app's style — no native header chrome. */
export default function QueueStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
