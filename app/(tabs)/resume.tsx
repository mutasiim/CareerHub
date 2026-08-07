import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useResume } from "@/context/ResumeContext";

const API_URL = "https://careerhub-backend-xbe9.onrender.com";
const ANALYSIS_TIMEOUT_MS = 120_000;

export default function ResumeScreen() {
  const { fileName, setFileName, setFeedback, loading, setLoading } =
    useResume();

  const handleUpload = async () => {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | null = null;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];
      timeout = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);

      setFileName(file.name);
      setLoading(true);
      setFeedback(null);
      router.push("/analyzing");

      const formData = new FormData();
      formData.append("resume", {
        uri: file.uri,
        name: file.name,
        type:
          file.mimeType ||
          (file.name.toLowerCase().endsWith(".docx")
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "application/pdf"),
      } as any);

      const response = await fetch(`${API_URL}/analyze-resume`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      const rawResponse = await response.text();
      let data: any = null;

      try {
        data = rawResponse ? JSON.parse(rawResponse) : null;
      } catch {
        throw new Error(
          "The server returned an unreadable response. Please try again.",
        );
      }

      if (!response.ok) {
        throw new Error(
          data?.error || data?.details || "Failed to analyze resume",
        );
      }

      setFeedback(data);
      router.replace("/feedback");
    } catch (error: any) {
      console.error("ERROR:", error);
      const message =
        error?.name === "AbortError"
          ? "Resume analysis took too long. Please try again in a moment."
          : error?.message || "Upload failed";

      Alert.alert("Analysis unavailable", message);
      router.replace("/resume");
    } finally {
      if (timeout) clearTimeout(timeout);
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.glowOne} />
      <View style={styles.glowTwo} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>CareerHub</Text>
        <Text style={styles.title}>Upload your resume</Text>
        <Text style={styles.subtitle}>
          Get detailed AI-powered feedback, scoring, and actionable improvements
          in seconds.
        </Text>

        <View style={styles.uploadCard}>
          <View style={styles.iconWrap}>
            <Ionicons name="cloud-upload-outline" size={34} color="#ffffff" />
          </View>

          <Text style={styles.cardTitle}>
            {fileName ? "Resume ready to analyze" : "Drop in your resume"}
          </Text>

          <Text style={styles.cardText}>
            Upload a PDF or Word resume and get a full review with score
            breakdown, strengths, and recommendations.
          </Text>

          {fileName ? (
            <View style={styles.filePreview}>
              <View style={styles.fileIconBox}>
                <Ionicons name="document-text" size={22} color="#93c5fd" />
              </View>
              <View style={styles.fileTextWrap}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {fileName}
                </Text>
                <Text style={styles.fileMeta}>
                  {fileName.toLowerCase().endsWith(".docx")
                    ? "Word document"
                    : "PDF"}{" "}
                  selected successfully
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.emptyHint}>
              <Ionicons name="document-outline" size={18} color="#94a3b8" />
              <Text style={styles.emptyHintText}>
                Supported formats: PDF and DOCX
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleUpload}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <View style={styles.buttonLoadingRow}>
                <ActivityIndicator size="small" color="#ffffff" />
                <Text style={styles.buttonText}>Analyzing resume...</Text>
              </View>
            ) : (
              <View style={styles.buttonRow}>
                <Ionicons
                  name={
                    fileName ? "refresh-outline" : "arrow-up-circle-outline"
                  }
                  size={20}
                  color="#ffffff"
                />
                <Text style={styles.buttonText}>
                  {fileName ? "Upload another resume" : "Choose resume file"}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.bottomHint}>
            Your feedback will include a score, breakdown, and personalized
            improvement suggestions.
          </Text>

          <Text style={styles.privacyNotice}>
            By choosing a resume, you agree to CareerHub processing its content
            to provide AI-powered feedback.{" "}
            <Text
              style={styles.privacyLink}
              onPress={() => router.push("/privacy")}
            >
              Privacy & Data Use
            </Text>
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(59,130,246,0.12)",
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "web" ? 48 : 90,
    paddingBottom: Platform.OS === "web" ? 40 : 30,
  },
  glowOne: {
    position: "absolute",
    top: 80,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(59,130,246,0.12)",
  },
  glowTwo: {
    position: "absolute",
    bottom: 120,
    left: -50,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(29,78,216,0.10)",
  },
  eyebrow: {
    color: "#60a5fa",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  title: {
    color: "#ffffff",
    fontSize: 34,
    fontWeight: "800",
    lineHeight: 40,
    marginBottom: 12,
  },
  subtitle: {
    color: "#cbd5e1",
    fontSize: 16,
    lineHeight: 26,
    marginBottom: 28,
  },
  uploadCard: {
    backgroundColor: "rgba(30,41,59,0.95)",
    borderRadius: 28,
    padding: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  iconWrap: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: "rgba(59,130,246,0.22)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  cardTitle: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 10,
  },
  cardText: {
    color: "#cbd5e1",
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 20,
  },
  emptyHint: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 22,
  },
  emptyHintText: {
    color: "#94a3b8",
    fontSize: 14,
    marginLeft: 8,
  },
  filePreview: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15,23,42,0.8)",
    borderRadius: 18,
    padding: 14,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  fileIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(59,130,246,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  fileTextWrap: {
    flex: 1,
  },
  fileName: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  fileMeta: {
    color: "#94a3b8",
    fontSize: 13,
  },
  button: {
    backgroundColor: "#2563eb",
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.85,
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  buttonLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  bottomHint: {
    color: "#94a3b8",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  privacyNotice: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 12,
  },
  privacyLink: {
    color: "#60a5fa",
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});
