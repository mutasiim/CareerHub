import { useJobDetails } from "@/context/JobDetailsContext";
import { useResume } from "@/context/ResumeContext";
import { useSavedJobs } from "@/context/SavedJobsContext";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const API_URL = "https://careerhub-backend-xbe9.onrender.com";

type MatchAnalysis = {
  matchScore: number | null;
  assessmentType: "Complete" | "Preliminary";
  confidence: "High" | "Moderate" | "Limited";
  summary: string;
  matchingStrengths: string[];
  notMentioned: string[];
  experienceAlignment: string;
  beforeApplying: string[];
};

function formatPostedDate(createdAt?: string): string | null {
  if (!createdAt) return null;
  const createdTime = Date.parse(createdAt);
  if (!Number.isFinite(createdTime)) return null;

  const daysAgo = Math.max(
    0,
    Math.floor((Date.now() - createdTime) / 86_400_000),
  );
  if (daysAgo === 0) return "Posted today";
  if (daysAgo === 1) return "Posted yesterday";
  if (daysAgo < 30) return `Posted ${daysAgo} days ago`;
  return `Posted ${Math.floor(daysAgo / 30)} months ago`;
}

function formatSalary({
  salaryMin,
  salaryMax,
  salaryText,
}: {
  salaryMin?: number;
  salaryMax?: number;
  salaryText?: string;
}): string | null {
  if (salaryText) return salaryText;

  const money = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount);

  if (salaryMin && salaryMax)
    return `${money(salaryMin)} – ${money(salaryMax)}`;
  if (salaryMin) return `From ${money(salaryMin)}`;
  if (salaryMax) return `Up to ${money(salaryMax)}`;
  return null;
}

export default function JobDetailsScreen() {
  const { selectedJob } = useJobDetails();
  const { feedback } = useResume();
  const { isJobSaved, toggleSavedJob } = useSavedJobs();
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [matchAnalysis, setMatchAnalysis] = useState<MatchAnalysis | null>(
    null,
  );
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [pastedDescription, setPastedDescription] = useState("");

  if (!selectedJob) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.unavailableWrap}>
          <View style={styles.emptyIcon}>
            <Ionicons name="briefcase-outline" size={30} color="#60a5fa" />
          </View>
          <Text style={styles.unavailableTitle}>Job details unavailable</Text>
          <Text style={styles.unavailableText}>
            Return to Jobs and choose an opening to view its details.
          </Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => router.replace("/jobs")}
          >
            <Text style={styles.primaryButtonText}>Back to Jobs</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const saved = isJobSaved(selectedJob);
  const postedDate = formatPostedDate(selectedJob.createdAt);
  const salary = formatSalary(selectedJob);
  const description = selectedJob.description?.trim() || "";
  const sourceOnlyProvidedPreview =
    selectedJob.source?.toLowerCase() === "jooble" ||
    /^(?:\.{3}|…)|(?:\.{3}|…)$/.test(description);
  const canExpandDescription =
    !sourceOnlyProvidedPreview && description.length > 300;
  const pastedFullDescription = pastedDescription.trim();
  const hasPastedFullDescription = pastedFullDescription.length >= 300;
  const comparisonDescription = hasPastedFullDescription
    ? pastedFullDescription
    : description;
  const comparisonIsPreviewOnly =
    sourceOnlyProvidedPreview && !hasPastedFullDescription;
  const resumeSignals =
    feedback?.isResume === true
      ? {
          careerPaths: feedback.careerPaths,
          jobKeywords: feedback.jobKeywords,
          recommendedSearchTerms: feedback.recommendedSearchTerms,
        }
      : null;

  const handleAnalyzeMatch = async () => {
    if (!resumeSignals) {
      setMatchError("Upload and analyze a resume before comparing this job.");
      return;
    }

    if (!comparisonDescription) {
      setMatchError(
        "This source did not provide enough job information to compare.",
      );
      return;
    }

    try {
      setMatchLoading(true);
      setMatchError(null);

      const response = await fetch(`${API_URL}/jobs/match-analysis`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resumeSignals,
          job: {
            title: selectedJob.title,
            company: selectedJob.company,
            location: selectedJob.location,
            type: selectedJob.type,
            description: comparisonDescription,
            source: selectedJob.source,
            isPreviewOnly: comparisonIsPreviewOnly,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Unable to analyze this match.");
      }

      setMatchAnalysis(data);
    } catch (error: any) {
      setMatchError(
        error?.message ||
          "Unable to analyze this match right now. Try again shortly.",
      );
    } finally {
      setMatchLoading(false);
    }
  };

  const handleShare = async () => {
    const details = [
      `${selectedJob.title} at ${selectedJob.company}`,
      selectedJob.location,
      selectedJob.applyUrl,
    ].filter(Boolean);

    try {
      await Share.share({ message: details.join("\n") });
    } catch {
      Alert.alert("Unable to share", "This job could not be shared right now.");
    }
  };

  const handleApply = async () => {
    if (!selectedJob.applyUrl) {
      Alert.alert(
        "Application link unavailable",
        "The job source did not provide an application link.",
      );
      return;
    }

    try {
      const supported = await Linking.canOpenURL(selectedJob.applyUrl);
      if (!supported) throw new Error("Unsupported URL");
      await Linking.openURL(selectedJob.applyUrl);
    } catch {
      Alert.alert(
        "Unable to open application",
        "There was a problem opening the provider's application page.",
      );
    }
  };

  const metadata = [selectedJob.type, postedDate, salary].filter(
    Boolean,
  ) as string[];

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable style={styles.circleButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={25} color="#ffffff" />
          </Pressable>
          <Text style={styles.headerTitle}>Job Details</Text>
          <Pressable style={styles.circleButton} onPress={handleShare}>
            <Ionicons name="share-outline" size={23} color="#60a5fa" />
          </Pressable>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>
            {selectedJob.source
              ? `VIA ${selectedJob.source.toUpperCase()}`
              : "CAREERHUB JOB"}
          </Text>
          <Text style={styles.jobTitle}>{selectedJob.title}</Text>
          <Text style={styles.company}>{selectedJob.company}</Text>
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={18} color="#94a3b8" />
            <Text style={styles.location}>{selectedJob.location}</Text>
          </View>

          {metadata.length > 0 ? (
            <View style={styles.chipRow}>
              {metadata.map((item) => (
                <View key={item} style={styles.chip}>
                  <Text style={styles.chipText}>{item}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {selectedJob.fit ? (
          <View style={styles.matchCard}>
            <View style={styles.matchIcon}>
              <Ionicons name="sparkles" size={21} color="#60a5fa" />
            </View>
            <View style={styles.matchCopy}>
              <Text style={styles.matchLabel}>{selectedJob.fit}</Text>
              <Text style={styles.matchText}>
                CareerHub found this opening while matching jobs to the career
                direction and search terms from your resume.
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.breakdownCard}>
          <View style={styles.breakdownHeader}>
            <View style={styles.breakdownHeaderIcon}>
              <Ionicons name="analytics-outline" size={21} color="#a5b4fc" />
            </View>
            <View style={styles.breakdownHeaderCopy}>
              <Text style={styles.breakdownTitle}>Your match breakdown</Text>
              <Text style={styles.breakdownSubtitle}>
                Compare this opening with your resume analysis
              </Text>
            </View>
          </View>

          {!matchAnalysis ? (
            <>
              <Text style={styles.breakdownIntro}>
                See the strengths that align, important qualifications not
                mentioned in your resume analysis, and what to improve before
                applying.
              </Text>

              {sourceOnlyProvidedPreview ? (
                <View style={styles.fullDescriptionInputCard}>
                  <View style={styles.fullDescriptionInputHeader}>
                    <Ionicons
                      name="clipboard-outline"
                      size={19}
                      color="#a5b4fc"
                    />
                    <View style={styles.fullDescriptionInputCopy}>
                      <Text style={styles.fullDescriptionInputTitle}>
                        Want the complete comparison?
                      </Text>
                      <Text style={styles.fullDescriptionInputHint}>
                        Copy the full description from the original posting and
                        paste it below.
                      </Text>
                    </View>
                  </View>
                  <TextInput
                    value={pastedDescription}
                    onChangeText={setPastedDescription}
                    placeholder="Paste the complete job description here..."
                    placeholderTextColor="#64748b"
                    style={styles.fullDescriptionInput}
                    multiline
                    textAlignVertical="top"
                  />
                  <View style={styles.inputStatusRow}>
                    <Text
                      style={[
                        styles.inputStatusText,
                        hasPastedFullDescription && styles.inputStatusReady,
                      ]}
                    >
                      {hasPastedFullDescription
                        ? "Full comparison ready"
                        : pastedDescription.length > 0
                          ? "Keep pasting the complete posting"
                          : "Optional — otherwise CareerHub will run a preliminary check"}
                    </Text>
                    {pastedDescription.length > 0 ? (
                      <Pressable onPress={() => setPastedDescription("")}>
                        <Text style={styles.clearInputText}>Clear</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ) : null}

              {matchError ? (
                <View style={styles.matchErrorBox}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={18}
                    color="#fca5a5"
                  />
                  <Text style={styles.matchErrorText}>{matchError}</Text>
                </View>
              ) : null}

              <Pressable
                style={[
                  styles.analyzeButton,
                  matchLoading && styles.analyzeButtonDisabled,
                ]}
                disabled={matchLoading}
                onPress={handleAnalyzeMatch}
              >
                {matchLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Ionicons name="sparkles" size={19} color="#ffffff" />
                )}
                <Text style={styles.analyzeButtonText}>
                  {matchLoading
                    ? "Analyzing this match..."
                    : comparisonIsPreviewOnly
                      ? "Run preliminary match"
                      : "Analyze full match"}
                </Text>
              </Pressable>

              <Text style={styles.onDemandNote}>
                Runs only when requested. Identical comparisons are cached to
                reduce usage.
              </Text>
            </>
          ) : (
            <View style={styles.analysisResults}>
              <View style={styles.scoreRow}>
                {matchAnalysis.matchScore !== null ? (
                  <View style={styles.scoreCircle}>
                    <Text style={styles.scoreNumber}>
                      {matchAnalysis.matchScore}
                    </Text>
                    <Text style={styles.scoreOutOf}>/100</Text>
                  </View>
                ) : (
                  <View style={styles.preliminaryCircle}>
                    <Ionicons
                      name="document-outline"
                      size={27}
                      color="#fbbf24"
                    />
                  </View>
                )}
                <View style={styles.scoreCopy}>
                  <Text style={styles.scoreLabel}>
                    {matchAnalysis.assessmentType === "Preliminary"
                      ? "Preliminary match"
                      : "Resume alignment"}
                  </Text>
                  <View style={styles.confidenceBadge}>
                    <Text style={styles.confidenceText}>
                      {matchAnalysis.confidence} confidence
                    </Text>
                  </View>
                </View>
              </View>

              <Text style={styles.analysisSummary}>
                {matchAnalysis.summary}
              </Text>

              {matchAnalysis.matchingStrengths.length > 0 ? (
                <View style={styles.analysisSection}>
                  <Text style={styles.analysisSectionTitle}>What aligns</Text>
                  {matchAnalysis.matchingStrengths.map((item, index) => (
                    <View
                      key={`${item}-${index}`}
                      style={styles.analysisListRow}
                    >
                      <Ionicons
                        name="checkmark-circle"
                        size={19}
                        color="#34d399"
                      />
                      <Text style={styles.analysisListText}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {matchAnalysis.notMentioned.length > 0 ? (
                <View style={styles.analysisSection}>
                  <Text style={styles.analysisSectionTitle}>Not mentioned</Text>
                  <Text style={styles.analysisSectionHint}>
                    This does not mean you lack these qualifications—only that
                    they were not found in the current resume analysis.
                  </Text>
                  {matchAnalysis.notMentioned.map((item, index) => (
                    <View
                      key={`${item}-${index}`}
                      style={styles.analysisListRow}
                    >
                      <Ionicons
                        name="help-circle-outline"
                        size={19}
                        color="#fbbf24"
                      />
                      <Text style={styles.analysisListText}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.analysisSection}>
                <Text style={styles.analysisSectionTitle}>
                  Experience alignment
                </Text>
                <Text style={styles.analysisParagraph}>
                  {matchAnalysis.experienceAlignment}
                </Text>
              </View>

              {matchAnalysis.beforeApplying.length > 0 ? (
                <View style={styles.analysisSection}>
                  <Text style={styles.analysisSectionTitle}>
                    Before applying
                  </Text>
                  {matchAnalysis.beforeApplying.map((item, index) => (
                    <View key={`${item}-${index}`} style={styles.actionListRow}>
                      <View style={styles.actionNumber}>
                        <Text style={styles.actionNumberText}>{index + 1}</Text>
                      </View>
                      <Text style={styles.analysisListText}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {matchAnalysis.assessmentType === "Preliminary" ? (
                <Text style={styles.limitedNotice}>
                  This score uses a partial job description. Review the complete
                  posting before applying.
                </Text>
              ) : null}
            </View>
          )}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeadingRow}>
            <View style={styles.sectionIcon}>
              <Ionicons
                name="document-text-outline"
                size={20}
                color="#60a5fa"
              />
            </View>
            <View style={styles.sectionHeadingCopy}>
              <Text style={styles.sectionTitle}>Job description</Text>
              <Text style={styles.sectionSubtitle}>
                {sourceOnlyProvidedPreview
                  ? `Preview provided by ${selectedJob.source || "the job source"}`
                  : "Full details provided by the job source"}
              </Text>
            </View>
          </View>

          <View style={styles.descriptionDivider} />

          <Text
            style={styles.description}
            numberOfLines={
              canExpandDescription && !descriptionExpanded ? 10 : undefined
            }
          >
            {description ||
              "The job source did not provide a description for this opening."}
          </Text>

          {canExpandDescription ? (
            <Pressable
              style={styles.descriptionAction}
              onPress={() => setDescriptionExpanded((current) => !current)}
            >
              <Text style={styles.descriptionActionText}>
                {descriptionExpanded ? "Show less" : "Read full description"}
              </Text>
              <Ionicons
                name={descriptionExpanded ? "chevron-up" : "chevron-down"}
                size={18}
                color="#60a5fa"
              />
            </Pressable>
          ) : sourceOnlyProvidedPreview || !description ? (
            <Pressable style={styles.descriptionAction} onPress={handleApply}>
              <Text style={styles.descriptionActionText}>
                View complete posting
              </Text>
              <Ionicons name="open-outline" size={18} color="#60a5fa" />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.actionRow}>
          <Pressable
            style={[styles.secondaryButton, saved && styles.savedButton]}
            onPress={() => toggleSavedJob(selectedJob)}
          >
            <Ionicons
              name={saved ? "bookmark" : "bookmark-outline"}
              size={21}
              color={saved ? "#ffffff" : "#93c5fd"}
            />
            <Text
              style={[
                styles.secondaryButtonText,
                saved && styles.savedButtonText,
              ]}
            >
              {saved ? "Saved" : "Save"}
            </Text>
          </Pressable>

          <Pressable style={styles.secondaryButton} onPress={handleShare}>
            <Ionicons name="share-outline" size={21} color="#93c5fd" />
            <Text style={styles.secondaryButtonText}>Share</Text>
          </Pressable>
        </View>

        <Pressable style={styles.primaryButton} onPress={handleApply}>
          <Text style={styles.primaryButtonText}>
            {selectedJob.source
              ? `Apply on ${selectedJob.source}`
              : "Apply on source website"}
          </Text>
          <Ionicons name="open-outline" size={20} color="#ffffff" />
        </Pressable>

        <Text style={styles.sourceNote}>
          CareerHub helps you review this listing. Applications are completed on
          the original provider’s website.
        </Text>
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
  headerTitle: { color: "#ffffff", fontSize: 21, fontWeight: "800" },
  circleButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
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
    marginBottom: 12,
  },
  jobTitle: {
    color: "#ffffff",
    fontSize: 27,
    lineHeight: 34,
    fontWeight: "800",
  },
  company: { color: "#cbd5e1", fontSize: 18, fontWeight: "700", marginTop: 10 },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 5,
  },
  location: { color: "#94a3b8", fontSize: 15, flex: 1 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 18 },
  chip: {
    backgroundColor: "#111827",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "#293548",
  },
  chipText: { color: "#cbd5e1", fontSize: 12, fontWeight: "700" },
  matchCard: {
    flexDirection: "row",
    backgroundColor: "rgba(37,99,235,0.12)",
    borderRadius: 18,
    padding: 17,
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.28)",
    marginBottom: 16,
  },
  matchIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(59,130,246,0.16)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  matchCopy: { flex: 1 },
  matchLabel: {
    color: "#bfdbfe",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 5,
  },
  matchText: { color: "#cbd5e1", fontSize: 14, lineHeight: 21 },
  breakdownCard: {
    backgroundColor: "#171f34",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(129,140,248,0.34)",
    marginBottom: 16,
  },
  breakdownHeader: { flexDirection: "row", alignItems: "center" },
  breakdownHeaderIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(99,102,241,0.18)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  breakdownHeaderCopy: { flex: 1 },
  breakdownTitle: { color: "#ffffff", fontSize: 18, fontWeight: "800" },
  breakdownSubtitle: { color: "#94a3b8", fontSize: 12, marginTop: 4 },
  breakdownIntro: {
    color: "#cbd5e1",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 17,
  },
  fullDescriptionInputCard: {
    backgroundColor: "rgba(15,23,42,0.65)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(129,140,248,0.22)",
    padding: 13,
    marginTop: 15,
  },
  fullDescriptionInputHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    marginBottom: 11,
  },
  fullDescriptionInputCopy: { flex: 1 },
  fullDescriptionInputTitle: {
    color: "#e0e7ff",
    fontSize: 13,
    fontWeight: "800",
  },
  fullDescriptionInputHint: {
    color: "#94a3b8",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  fullDescriptionInput: {
    minHeight: 116,
    maxHeight: 210,
    borderRadius: 11,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#2f3c54",
    color: "#e2e8f0",
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  inputStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 8,
  },
  inputStatusText: {
    color: "#64748b",
    fontSize: 10,
    lineHeight: 14,
    flex: 1,
  },
  inputStatusReady: { color: "#6ee7b7" },
  clearInputText: { color: "#a5b4fc", fontSize: 11, fontWeight: "800" },
  analyzeButton: {
    minHeight: 50,
    borderRadius: 13,
    backgroundColor: "#4f46e5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 17,
  },
  analyzeButtonDisabled: { opacity: 0.72 },
  analyzeButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  onDemandNote: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 9,
  },
  matchErrorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "rgba(127,29,29,0.2)",
    borderRadius: 11,
    padding: 11,
    marginTop: 13,
  },
  matchErrorText: { color: "#fecaca", fontSize: 12, lineHeight: 18, flex: 1 },
  analysisResults: { marginTop: 18 },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15,23,42,0.6)",
    borderRadius: 16,
    padding: 15,
  },
  scoreCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 5,
    borderColor: "#6366f1",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  preliminaryCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: "rgba(251,191,36,0.55)",
    backgroundColor: "rgba(120,53,15,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  scoreNumber: { color: "#ffffff", fontSize: 24, fontWeight: "900" },
  scoreOutOf: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 8,
  },
  scoreCopy: { marginLeft: 15, flex: 1 },
  scoreLabel: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  confidenceBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(99,102,241,0.2)",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginTop: 7,
  },
  confidenceText: { color: "#c7d2fe", fontSize: 11, fontWeight: "800" },
  analysisSummary: {
    color: "#dbe3ef",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 15,
  },
  analysisSection: {
    borderTopWidth: 1,
    borderTopColor: "rgba(148,163,184,0.13)",
    paddingTop: 15,
    marginTop: 15,
  },
  analysisSectionTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 9,
  },
  analysisSectionHint: {
    color: "#94a3b8",
    fontSize: 11,
    lineHeight: 17,
    marginBottom: 10,
  },
  analysisListRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    marginBottom: 9,
  },
  analysisListText: { color: "#cbd5e1", fontSize: 13, lineHeight: 19, flex: 1 },
  analysisParagraph: { color: "#cbd5e1", fontSize: 13, lineHeight: 20 },
  actionListRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  actionNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(99,102,241,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  actionNumberText: { color: "#c7d2fe", fontSize: 11, fontWeight: "900" },
  limitedNotice: {
    color: "#fcd34d",
    fontSize: 11,
    lineHeight: 17,
    backgroundColor: "rgba(120,53,15,0.18)",
    borderRadius: 10,
    padding: 10,
    marginTop: 7,
  },
  sectionCard: {
    backgroundColor: "#1e293b",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 16,
  },
  sectionTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "800",
  },
  sectionHeadingRow: { flexDirection: "row", alignItems: "center" },
  sectionHeadingCopy: { flex: 1 },
  sectionIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "rgba(59,130,246,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  sectionSubtitle: { color: "#94a3b8", fontSize: 12, marginTop: 3 },
  descriptionDivider: {
    height: 1,
    backgroundColor: "rgba(148,163,184,0.14)",
    marginVertical: 17,
  },
  description: { color: "#d7dfeb", fontSize: 15, lineHeight: 24 },
  descriptionAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: "rgba(59,130,246,0.1)",
    marginTop: 17,
  },
  descriptionActionText: {
    color: "#60a5fa",
    fontSize: 14,
    fontWeight: "800",
  },
  actionRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  secondaryButton: {
    flex: 1,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#1e293b",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#3b4b65",
  },
  secondaryButtonText: { color: "#dbeafe", fontSize: 15, fontWeight: "800" },
  savedButton: { backgroundColor: "#1d4ed8", borderColor: "#2563eb" },
  savedButtonText: { color: "#ffffff" },
  primaryButton: {
    minHeight: 56,
    backgroundColor: "#2563eb",
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingHorizontal: 18,
  },
  primaryButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  sourceNote: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 13,
    paddingHorizontal: 12,
  },
  unavailableWrap: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingBottom: 80,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 18,
  },
  unavailableTitle: {
    color: "#ffffff",
    fontSize: 23,
    fontWeight: "800",
    textAlign: "center",
  },
  unavailableText: {
    color: "#94a3b8",
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
    marginTop: 9,
    marginBottom: 24,
  },
});
