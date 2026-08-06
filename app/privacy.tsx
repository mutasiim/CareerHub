import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type PrivacySectionProps = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  children: React.ReactNode;
};

function PrivacySection({ icon, title, children }: PrivacySectionProps) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <Ionicons name={icon} size={20} color="#60a5fa" />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <Text style={styles.sectionText}>{children}</Text>
    </View>
  );
}

export default function PrivacyScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={25} color="#ffffff" />
          </Pressable>
          <Text style={styles.headerTitle}>Privacy</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>CAREERHUB</Text>
          <Text style={styles.heroTitle}>Privacy & Data Use</Text>
          <Text style={styles.heroText}>
            A plain-language explanation of how CareerHub handles resumes, job
            information, and saved jobs.
          </Text>
        </View>

        <PrivacySection icon="document-text-outline" title="Resume processing">
          When you choose a resume, CareerHub sends the PDF to its secure
          backend so the text can be extracted and analyzed. The extracted
          resume content is sent to OpenAI to generate feedback, career paths,
          and job-search terms.
        </PrivacySection>

        <PrivacySection icon="trash-outline" title="Temporary uploads">
          Uploaded PDF files are used only for processing and are deleted from
          the backend after text extraction or when processing fails. CareerHub
          does not intentionally keep a permanent copy of your uploaded PDF.
        </PrivacySection>

        <PrivacySection icon="sparkles-outline" title="Job match analysis">
          Match breakdowns send resume-derived career paths and keywords
          together with the selected job information to OpenAI. They do not send
          the original PDF, your name, email address, phone number, or contact
          section.
        </PrivacySection>

        <PrivacySection icon="bookmark-outline" title="Saved jobs">
          Saved jobs are stored locally on your device. They are not uploaded to
          the CareerHub backend. Removing the app or clearing its local storage
          may remove those saved jobs.
        </PrivacySection>

        <PrivacySection
          icon="briefcase-outline"
          title="Third-party job sources"
        >
          CareerHub displays openings from third-party providers and employer
          job boards. Opening a complete posting or applying may take you to the
          provider’s website, where that provider’s own privacy terms apply.
        </PrivacySection>

        <PrivacySection
          icon="shield-checkmark-outline"
          title="Service protection"
        >
          CareerHub uses upload validation, file-size limits, request limits,
          and temporary caching to protect the service and manage third-party
          API usage.
        </PrivacySection>

        <Text style={styles.updatedText}>Last updated: August 6, 2026</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#0f172a" },
  content: { paddingHorizontal: 20, paddingBottom: 48 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  backButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: "#ffffff", fontSize: 21, fontWeight: "800" },
  headerSpacer: { width: 46, height: 46 },
  heroCard: {
    backgroundColor: "#1e293b",
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 16,
  },
  eyebrow: {
    color: "#60a5fa",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 10,
  },
  heroTitle: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "900",
    marginBottom: 10,
  },
  heroText: { color: "#cbd5e1", fontSize: 15, lineHeight: 23 },
  sectionCard: {
    backgroundColor: "#1e293b",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.17)",
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 11,
  },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(59,130,246,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  sectionTitle: { color: "#ffffff", fontSize: 16, fontWeight: "800", flex: 1 },
  sectionText: { color: "#cbd5e1", fontSize: 14, lineHeight: 22 },
  updatedText: {
    color: "#64748b",
    fontSize: 12,
    textAlign: "center",
    marginTop: 9,
  },
});
