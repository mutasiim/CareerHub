import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useResume } from "@/context/ResumeContext";

const steps = [
  "Uploading your resume...",
  "Reading and parsing content...",
  "Analyzing structure and impact...",
  "Generating AI feedback...",
];

export default function AnalyzingScreen() {
  const { loading } = useResume();
  const [currentStep, setCurrentStep] = useState(0);
  const [isTakingLonger, setIsTakingLonger] = useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const dot1 = useRef(new Animated.Value(0.35)).current;
  const dot2 = useRef(new Animated.Value(0.35)).current;
  const dot3 = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    if (!loading) {
      const redirect = setTimeout(() => router.replace("/resume"), 250);
      return () => clearTimeout(redirect);
    }

    const longerTimer = setTimeout(() => setIsTakingLonger(true), 20_000);

    return () => clearTimeout(longerTimer);
  }, [loading]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 5200,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();

    const dots = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(dot1, {
            toValue: 1,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.timing(dot2, {
            toValue: 0.35,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.timing(dot3, {
            toValue: 0.35,
            duration: 220,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(dot1, {
            toValue: 0.35,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.timing(dot2, {
            toValue: 1,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.timing(dot3, {
            toValue: 0.35,
            duration: 220,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(dot1, {
            toValue: 0.35,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.timing(dot2, {
            toValue: 0.35,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.timing(dot3, {
            toValue: 1,
            duration: 220,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    dots.start();

    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step < steps.length) {
        Animated.sequence([
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 260,
            useNativeDriver: true,
          }),
        ]).start();
        setCurrentStep(step);
      } else {
        clearInterval(interval);
      }
    }, 1200);

    return () => {
      dots.stop();
      clearInterval(interval);
    };
  }, [dot1, dot2, dot3, fadeAnim, progressAnim]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.container}>
      <View style={styles.glow} />

      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Analyzing</Text>

        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Analyzing your resume</Text>
        <Text style={styles.subtitle}>
          Our AI is reviewing your resume to generate personalized feedback.
        </Text>

        <View style={styles.panel}>
          <View style={styles.badge}>
            <Ionicons name="sparkles" size={14} color="#93c5fd" />
            <Text style={styles.badgeText}>AI Review In Progress</Text>
          </View>

          <Animated.Text style={[styles.stepText, { opacity: fadeAnim }]}>
            {steps[currentStep]}
          </Animated.Text>

          <View style={styles.loaderRow}>
            <Animated.View style={[styles.loaderDot, { opacity: dot1 }]} />
            <Animated.View style={[styles.loaderDot, { opacity: dot2 }]} />
            <Animated.View style={[styles.loaderDot, { opacity: dot3 }]} />
          </View>

          <View style={styles.progressTrack}>
            <Animated.View
              style={[styles.progressFill, { width: progressWidth }]}
            />
          </View>

          <Text style={styles.helperText}>
            {isTakingLonger
              ? "This is taking longer than usual, but your request is still processing."
              : "This may take a few seconds depending on traffic and resume length."}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#07122b",
    paddingHorizontal: 24,
    paddingTop: 56,
  },
  glow: {
    position: "absolute",
    top: 230,
    alignSelf: "center",
    width: 200,
    height: 200,
    borderRadius: 130,
    backgroundColor: "rgba(59,130,246,0.07)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 36,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingBottom: 90,
  },
  title: {
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: 16,
    lineHeight: 26,
    textAlign: "center",
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  panel: {
    marginTop: 10,
    backgroundColor: "rgba(30,41,59,0.95)",
    borderRadius: 28,
    padding: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  badge: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(59,130,246,0.14)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    marginBottom: 22,
  },
  badgeText: {
    color: "#bfdbfe",
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 6,
  },
  stepText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 24,
    minHeight: 32,
  },
  loaderRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 24,
  },
  loaderDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#3b82f6",
    marginHorizontal: 8,
  },
  progressTrack: {
    height: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 999,
    overflow: "hidden",
    marginBottom: 18,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#3b82f6",
    borderRadius: 999,

    // 👇 ADD THIS
    shadowColor: "#3b82f6",
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  helperText: {
    color: "#94a3b8",
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
  },
});
