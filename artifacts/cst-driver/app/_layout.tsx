import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Feather } from "@expo/vector-icons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/context/AuthContext";
import { JobsProvider } from "@/context/JobsContext";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// Inject @font-face via CSS on web BEFORE React renders anything so that
// FontObserver (used by expo-font) finds the font already present when icons mount.
// Metro serves TTF via localhost which is inaccessible from the browser proxy,
// so we use jsDelivr CDN for the web bundle only.
if (Platform.OS === "web" && typeof document !== "undefined") {
  const STYLE_ID = "feather-icons-fontface";
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "@font-face {",
      "  font-family: 'feather';",
      "  src: url('https://cdn.jsdelivr.net/npm/@expo/vector-icons@15.1.1/build/vendor/react-native-vector-icons/Fonts/Feather.ttf') format('truetype');",
      "  font-weight: normal;",
      "  font-style: normal;",
      "}",
    ].join("\n");
    document.head.appendChild(style);
  }
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="job" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    // On native (Expo Go / dev build), include Feather font via the bundled asset.
    // On web we use the CSS @font-face above; spreading here would override that
    // with the unreachable Metro localhost URL, so we skip it.
    ...(Platform.OS !== "web" ? Feather.font : {}),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <AuthProvider>
                <JobsProvider>
                  <RootLayoutNav />
                </JobsProvider>
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
