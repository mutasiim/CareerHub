import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { ResumeProvider } from "@/context/ResumeContext";
import { SavedJobsProvider } from "@/context/SavedJobsContext";
import { JobDetailsProvider } from "@/context/JobDetailsContext";
import { useColorScheme } from "@/hooks/use-color-scheme";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ResumeProvider>
      <SavedJobsProvider>
        <JobDetailsProvider>
          <ThemeProvider
            value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
          >
            <Stack
              screenOptions={{
                headerShown: false,
                headerBackButtonDisplayMode: "minimal",
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

              <Stack.Screen
                name="feedback"
                options={{
                  headerShown: false,
                }}
              />

              <Stack.Screen
                name="analyzing"
                options={{
                  headerShown: false,
                }}
              />

              <Stack.Screen
                name="jobs"
                options={{
                  headerShown: false,
                }}
              />

              <Stack.Screen
                name="job-details"
                options={{
                  headerShown: false,
                }}
              />

              <Stack.Screen
                name="modal"
                options={{
                  headerShown: true,
                  headerBackButtonDisplayMode: "minimal",
                  presentation: "modal",
                  title: "Modal",
                }}
              />
            </Stack>
            <StatusBar style="auto" />
          </ThemeProvider>
        </JobDetailsProvider>
      </SavedJobsProvider>
    </ResumeProvider>
  );
}
