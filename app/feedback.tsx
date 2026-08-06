import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';

import { useResume } from '@/context/ResumeContext';

type ExpandableSectionProps = {
  title: string;
  scoreText?: string;
  intro?: string;
  highImpact?: { issue: string; fix: string }[];
  mediumImpact?: { issue: string; fix: string }[];
  recruiterInsight?: string;
  outcome?: string;
  body?: React.ReactNode;
  icon: keyof typeof Ionicons.glyphMap;
  expanded: boolean;
  onPress: () => void;
};

type FeedbackItem = {
  issue: string;
  fix: string;
};

type FeedbackSectionData = {
  intro?: string;
  highImpact?: FeedbackItem[];
  mediumImpact?: FeedbackItem[];
  recruiterInsight?: string;
  outcome?: string;
};

type NormalizedFeedback = {
  isResume: boolean;
  invalidMessage?: string;
  score?: number;
  scoreLabel?: string;
  resumeTier?: string;
  sections: Array<{
    key: string;
    title: string;
    icon: keyof typeof Ionicons.glyphMap;
    scoreText?: string;
    intro?: string;
    highImpact?: FeedbackItem[];
    mediumImpact?: FeedbackItem[];
    recruiterInsight?: string;
    outcome?: string;
    body?: React.ReactNode;
  }>;
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}


function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function buildSectionParagraph(section?: FeedbackSectionData): string | undefined {
  return section?.intro;
}

function normalizeFeedbackItems(value: unknown): FeedbackItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === 'string') {
        return { issue: item, fix: '' };
      }

      if (item && typeof item === 'object') {
        const issue = asString((item as Record<string, unknown>).issue)
          ?? asString((item as Record<string, unknown>).problem)
          ?? asString((item as Record<string, unknown>).title)
          ?? asString((item as Record<string, unknown>).heading)
          ?? asString((item as Record<string, unknown>).point)
          ?? '';

        const fix = asString((item as Record<string, unknown>).fix)
          ?? asString((item as Record<string, unknown>).suggestion)
          ?? asString((item as Record<string, unknown>).recommendation)
          ?? asString((item as Record<string, unknown>).action)
          ?? '';

        if (!issue && !fix) return null;
        return { issue, fix };
      }

      return null;
    })
    .filter((item): item is FeedbackItem => Boolean(item));
}

function normalizeSection(source: unknown): FeedbackSectionData | undefined {
  if (!source || typeof source !== 'object') return undefined;

  const record = source as Record<string, unknown>;

  const intro = asString(record.intro)
    ?? asString(record.summary)
    ?? asString(record.overview)
    ?? asString(record.description);

  const highImpact = normalizeFeedbackItems(
    record.highImpact
    ?? record.high_impact
    ?? record.highPriority
    ?? record.high_priority
    ?? record.criticalIssues
    ?? record.critical_issues
  );

  const mediumImpact = normalizeFeedbackItems(
    record.mediumImpact
    ?? record.medium_impact
    ?? record.mediumPriority
    ?? record.medium_priority
    ?? record.improvements
  );

  const recruiterInsight = asString(record.recruiterInsight)
    ?? asString(record.recruiter_insight)
    ?? asString(record.insight)
    ?? asString(record.hiringManagerInsight)
    ?? asString(record.hiring_manager_insight);

  const outcome = asString(record.outcome)
    ?? asString(record.result)
    ?? asString(record.impact)
    ?? asString(record.takeaway);

  if (!intro && highImpact.length === 0 && mediumImpact.length === 0 && !recruiterInsight && !outcome) {
    return undefined;
  }

  return {
    intro,
    highImpact,
    mediumImpact,
    recruiterInsight,
    outcome,
  };
}

function normalizeFeedback(feedback: any): NormalizedFeedback {
  if (!feedback) {
    return {
      isResume: false,
      invalidMessage: 'No feedback yet.',
      sections: [],
    };
  }

  if (feedback.isResume === false) {
    return {
      isResume: false,
      invalidMessage: asString(feedback.message) ?? 'This file could not be analyzed as a resume.',
      sections: [],
    };
  }

  const score = asNumber(feedback.score)
    ?? asNumber(feedback.overallScore)
    ?? asNumber(feedback.matchScore)
    ?? asNumber(feedback.resumeScore)
    ?? asNumber(feedback.overall_score);

  const scoreBreakdown = (feedback.scoreBreakdown ?? feedback.score_breakdown ?? {}) as Record<string, unknown>;

  const overallSection = normalizeSection(
    feedback.overallImpression
    ?? feedback.overall_impression
    ?? feedback.overall
  );

  const contentSection = normalizeSection(
    feedback.contentAndRelevance
    ?? feedback.content_and_relevance
    ?? feedback.content
  );

  const formattingSection = normalizeSection(
    feedback.formattingAndVisualAppeal
    ?? feedback.formatting_and_visual_appeal
    ?? feedback.formatting
    ?? feedback.layout
  );

  const languageSection = normalizeSection(
    feedback.languageAndProfessionalism
    ?? feedback.language_and_professionalism
    ?? feedback.language
    ?? feedback.professionalism
  );

  const sections: NormalizedFeedback['sections'] = [];

  if (overallSection) {
    sections.push({
      key: 'overall',
      title: 'Overall Impression',
      scoreText: asNumber(scoreBreakdown.overallImpression ?? scoreBreakdown.overall_impression ?? scoreBreakdown.overall)
        ? `${asNumber(scoreBreakdown.overallImpression ?? scoreBreakdown.overall_impression ?? scoreBreakdown.overall)}`
        : undefined,
      icon: 'sparkles-outline',
      body: <Text style={styles.bodyText}>{buildSectionParagraph(overallSection)}</Text>,
      ...overallSection,
    });
  }

  if (contentSection) {
    sections.push({
      key: 'content',
      title: 'Content and Relevance',
      scoreText: asNumber(scoreBreakdown.contentAndRelevance ?? scoreBreakdown.content_and_relevance ?? scoreBreakdown.content)
        ? `${asNumber(scoreBreakdown.contentAndRelevance ?? scoreBreakdown.content_and_relevance ?? scoreBreakdown.content)}`
        : undefined,
      icon: 'document-text-outline',
      body: <Text style={styles.bodyText}>{buildSectionParagraph(contentSection)}</Text>,
      ...contentSection,
    });
  }

  if (formattingSection) {
    sections.push({
      key: 'formatting',
      title: 'Formatting and Visual Appeal',
      scoreText: asNumber(scoreBreakdown.formattingAndVisualAppeal ?? scoreBreakdown.formatting_and_visual_appeal ?? scoreBreakdown.formatting ?? scoreBreakdown.layout)
        ? `${asNumber(scoreBreakdown.formattingAndVisualAppeal ?? scoreBreakdown.formatting_and_visual_appeal ?? scoreBreakdown.formatting ?? scoreBreakdown.layout)}`
        : undefined,
      icon: 'grid-outline',
      body: <Text style={styles.bodyText}>{buildSectionParagraph(formattingSection)}</Text>,
      ...formattingSection,
    });
  }

  if (languageSection) {
    sections.push({
      key: 'language',
      title: 'Language and Professionalism',
      scoreText: asNumber(scoreBreakdown.languageAndProfessionalism ?? scoreBreakdown.language_and_professionalism ?? scoreBreakdown.language ?? scoreBreakdown.professionalism)
        ? `${asNumber(scoreBreakdown.languageAndProfessionalism ?? scoreBreakdown.language_and_professionalism ?? scoreBreakdown.language ?? scoreBreakdown.professionalism)}`
        : undefined,
      icon: 'chatbubble-ellipses-outline',
      body: <Text style={styles.bodyText}>{buildSectionParagraph(languageSection)}</Text>,
      ...languageSection,
    });
  }

  const recommendations = asArray<string>(feedback.recommendations ?? feedback.nextSteps ?? feedback.next_steps ?? feedback.actionItems ?? feedback.action_items)
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0);

  if (recommendations.length > 0) {
    sections.push({
      key: 'recommendations',
      title: 'Recommendations',
      icon: 'rocket-outline',
      body: (
        <View style={styles.feedbackGroup}>
          {recommendations.map((item, index) => (
            <View key={index} style={styles.recommendationItem}>
              <Text style={styles.recommendationNumber}>{index + 1}</Text>
              <Text style={styles.recommendationText}>{item}</Text>
            </View>
          ))}
        </View>
      ),
    });
  }

  const additionalNotes = asString(feedback.additionalNotes)
    ?? asString(feedback.additional_notes)
    ?? asString(feedback.notes)
    ?? asString(feedback.finalNotes)
    ?? asString(feedback.final_notes);

  if (additionalNotes) {
    sections.push({
      key: 'notes',
      title: 'Additional Notes',
      icon: 'create-outline',
      body: (
        <View style={styles.notesBox}>
          <Text style={styles.bodyText}>{additionalNotes}</Text>
        </View>
      ),
    });
  }

  if (sections.length === 0) {
    const genericSummary = asString(feedback.summary)
      ?? asString(feedback.feedback)
      ?? asString(feedback.analysis)
      ?? asString(feedback.message);

    if (genericSummary) {
      sections.push({
        key: 'summary',
        title: 'Resume Feedback',
        icon: 'sparkles-outline',
        body: <Text style={styles.bodyText}>{genericSummary}</Text>,
      });
    }
  }

  return {
    isResume: true,
    score,
    scoreLabel: asString(feedback.scoreLabel)
      ?? asString(feedback.score_label)
      ?? asString(feedback.summaryLabel)
      ?? asString(feedback.summary_label),
    resumeTier: asString(feedback.resumeTier)
      ?? asString(feedback.resume_tier)
      ?? asString(feedback.tier),
    sections,
  };
}

function ExpandableSection({
  title,
  scoreText,
  intro,
  highImpact,
  mediumImpact,
  recruiterInsight,
  outcome,
  body,
  icon,
  expanded,
  onPress,
}: ExpandableSectionProps) {
  const [shouldRenderContent, setShouldRenderContent] = useState(expanded);
  const contentOpacity = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const contentTranslate = useRef(new Animated.Value(expanded ? 0 : -8)).current;
  const chevronRotate = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(chevronRotate, {
      toValue: expanded ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();

    if (expanded) {
      setShouldRenderContent(true);

      Animated.parallel([
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(contentTranslate, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(contentOpacity, {
          toValue: 0,
          duration: 160,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(contentTranslate, {
          toValue: -8,
          duration: 160,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setShouldRenderContent(false);
        }
      });
    }
  }, [expanded, chevronRotate, contentOpacity, contentTranslate]);

  const rotateInterpolate = chevronRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const handlePressIn = () => {
    Animated.spring(pressScale, {
      toValue: 0.985,
      friction: 8,
      tension: 160,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      friction: 8,
      tension: 160,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={[styles.expandableCardWrap, { transform: [{ scale: pressScale }] }]}> 
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        android_ripple={{ color: 'rgba(255,255,255,0.05)' }}
        style={[
          styles.expandableCard,
          expanded ? styles.expandableCardExpanded : null,
        ]}
      >
        <View style={styles.expandableHeader}>
          <View style={styles.expandableTitleWrap}>
            <View style={styles.expandableIconWrap}>
              <Ionicons name={icon} size={16} color="#93c5fd" />
            </View>

            <View style={styles.expandableTextWrap}>
              <Text style={styles.sectionTitle}>{title}</Text>
              {scoreText ? <Text style={styles.sectionScore}>{scoreText}</Text> : null}
            </View>
          </View>

          <Animated.View style={{ transform: [{ rotate: rotateInterpolate }] }}>
            <Ionicons name="chevron-down" size={20} color="#94a3b8" />
          </Animated.View>
        </View>

        {shouldRenderContent ? (
          <Animated.View
            style={[
              styles.expandableBody,
              {
                opacity: contentOpacity,
                transform: [{ translateY: contentTranslate }],
              },
            ]}
          >
            {body}
          </Animated.View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

export default function FeedbackScreen() {
  const { feedback, fileName, loading } = useResume();
  const normalizedFeedback = useMemo(() => normalizeFeedback(feedback), [feedback]);

  const headerAnim = useRef(new Animated.Value(0)).current;
  const heroAnim = useRef(new Animated.Value(0)).current;
  const sectionsAnim = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(0.55)).current;

  const [animatedScore, setAnimatedScore] = useState(0);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  useEffect(() => {
    if (!normalizedFeedback.isResume || typeof normalizedFeedback.score !== 'number') {
      setAnimatedScore(0);
      return;
    }

    let start = 0;
    const end = normalizedFeedback.score;
    const duration = 900;
    const stepTime = 16;
    const increment = Math.max(1, Math.ceil(end / (duration / stepTime)));

    const timer = setInterval(() => {
      start += increment;

      if (start >= end) {
        setAnimatedScore(end);
        clearInterval(timer);
      } else {
        setAnimatedScore(start);
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [normalizedFeedback]);


  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
    if (!normalizedFeedback.isResume) {
      return;
    }

    headerAnim.setValue(0);
    heroAnim.setValue(0);
    sectionsAnim.setValue(0);

    Animated.sequence([
      Animated.timing(headerAnim, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(heroAnim, {
        toValue: 1,
        duration: 340,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(sectionsAnim, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 0.9,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: 0.55,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    pulse.start();

    return () => {
      pulse.stop();
    };
  }, [normalizedFeedback, headerAnim, heroAnim, sectionsAnim, glowPulse]);

  const toggleSection = (sectionKey: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSection((current) => (current === sectionKey ? null : sectionKey));
  };

  const sectionCards = normalizedFeedback.isResume ? normalizedFeedback.sections : [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View
        style={[
          styles.headerRow,
          {
            opacity: headerAnim,
            transform: [
              {
                translateY: headerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-14, 0],
                }),
              },
            ],
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>AI Feedback</Text>

        <View style={styles.headerSpacer} />
      </Animated.View>

      {loading ? (
        <Text style={styles.message}>Your resume is still being analyzed...</Text>
      ) : !feedback ? (
        <Text style={styles.message}>
          No feedback yet. Upload a resume first from the Resume tab.
        </Text>
      ) : !normalizedFeedback.isResume ? (
        <View style={styles.card}>
          {fileName ? <Text style={styles.fileName}>File: {fileName}</Text> : null}
          <Text style={styles.sectionTitle}>Invalid File</Text>
          <Text style={styles.bodyText}>{normalizedFeedback.invalidMessage}</Text>
        </View>
      ) : (
        <>
          {(typeof normalizedFeedback.score === 'number'
            || normalizedFeedback.resumeTier
            || normalizedFeedback.scoreLabel) ? (
            <Animated.View
              style={[
                styles.heroWrap,
                {
                  opacity: heroAnim,
                  transform: [
                    {
                      translateY: heroAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [22, 0],
                      }),
                    },
                    {
                      scale: heroAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.98, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Animated.View style={[styles.scoreCardGlow, { opacity: glowPulse }]} />
              <View style={styles.scoreCard}>
                {fileName ? <Text style={styles.fileName}>Resume: {fileName}</Text> : null}
                {typeof normalizedFeedback.score === 'number' ? (
                  <Text style={styles.scoreNumber}>{animatedScore}/100</Text>
                ) : (
                  <Text style={styles.scoreTitle}>Resume Analysis</Text>
                )}
                {normalizedFeedback.scoreLabel ? (
                  <Text style={styles.scoreSub}>{normalizedFeedback.scoreLabel}</Text>
                ) : typeof normalizedFeedback.score === 'number' ? (
                  <Text style={styles.scoreSub}>
                    {animatedScore >= 85
                      ? "You're highly competitive"
                      : animatedScore >= 70
                      ? 'Strong foundation — a few upgrades away'
                      : 'Needs improvement to stand out'}
                  </Text>
                ) : null}
                {normalizedFeedback.resumeTier ? (
                  <Text style={styles.scoreMeta}>{normalizedFeedback.resumeTier} Tier</Text>
                ) : null}
              </View>

              <TouchableOpacity
                style={styles.jobsButton}
                activeOpacity={0.85}
                onPress={() => router.push('/jobs')}
              >
                <Ionicons name="briefcase-outline" size={18} color="#ffffff" />
                <Text style={styles.jobsButtonText}>Explore Jobs for You</Text>
              </TouchableOpacity>
            </Animated.View>
          ) : null}

          <Animated.View
            style={{
              opacity: sectionsAnim,
              transform: [
                {
                  translateY: sectionsAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                },
              ],
            }}
          >
            {sectionCards.length > 0 ? (
              sectionCards.map((section) => (
                <ExpandableSection
                  key={section.key}
                  title={section.title}
                  scoreText={section.scoreText}
                  icon={section.icon}
                  intro={section.intro}
                  highImpact={section.highImpact}
                  mediumImpact={section.mediumImpact}
                  recruiterInsight={section.recruiterInsight}
                  outcome={section.outcome}
                  body={section.body}
                  expanded={expandedSection === section.key}
                  onPress={() => toggleSection(section.key)}
                />
              ))
            ) : (
              <View style={styles.card}>
                {fileName ? <Text style={styles.fileName}>Resume: {fileName}</Text> : null}
                <Text style={styles.sectionTitle}>Analysis Complete</Text>
                <Text style={styles.bodyText}>
                  Your backend responded successfully, but no displayable feedback sections were found.
                </Text>
              </View>
            )}
          </Animated.View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  heroWrap: {
    position: 'relative',
    marginBottom: 18,
  },
  scoreCardGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(59,130,246,0.22)',
    borderRadius: 22,
    transform: [{ scale: 1.03 }],
  },
  scoreCard: {
    backgroundColor: '#1d4ed8',
    padding: 22,
    borderRadius: 18,
    alignItems: 'center',
    shadowColor: '#3b82f6',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  scoreNumber: {
    color: '#ffffff',
    fontSize: 42,
    fontWeight: '800',
    marginTop: 6,
  },
  scoreTitle: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '800',
    marginTop: 6,
    textAlign: 'center',
  },
  scoreSub: {
    color: '#dbeafe',
    fontSize: 18,
    marginTop: 6,
    fontWeight: '600',
    textAlign: 'center',
  },
  scoreMeta: {
    color: '#bfdbfe',
    fontSize: 14,
    marginTop: 8,
    fontWeight: '500',
    textAlign: 'center',
  },
  jobsButton: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: '#3b82f6',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  jobsButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  expandableCardWrap: {
    marginBottom: 14,
  },
  expandableCard: {
  backgroundColor: '#1e293b',
  padding: 16, // was 22
  borderRadius: 18,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.04)',
  overflow: 'hidden',
},
  expandableCardExpanded: {
    backgroundColor: '#243041',
    borderColor: 'rgba(96,165,250,0.12)',
  },
  expandableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  expandableTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  expandableIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(59,130,246,0.16)',
    marginRight: 12,
  },
  expandableTextWrap: {
    flex: 1,
  },
  sectionScore: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '500',
    marginTop: -2,
  },
  expandableBody: {
  marginTop: 10,   // was 14
  paddingTop: 10,  // was 8
  borderTopWidth: 1,
  borderTopColor: 'rgba(255,255,255,0.05)',
},
  feedbackGroup: {
    marginTop: 8,
    marginBottom: 14,
  },
  feedbackGroupTitle: {
    color: '#bfdbfe',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  feedbackItemCard: {
    backgroundColor: 'rgba(15,23,42,0.55)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
  },
  feedbackIssue: {
    color: '#ffffff',
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '700',
    marginBottom: 6,
  },
  feedbackFix: {
    color: '#cbd5e1',
    fontSize: 15,
    lineHeight: 24,
  },
  insightBox: {
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.14)',
  },
  insightLabel: {
    color: '#93c5fd',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  recommendationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(15,23,42,0.55)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
  },
  recommendationNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2563eb',
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 28,
    marginRight: 12,
  },
  recommendationText: {
  flex: 1,
  color: '#cbd5e1',
  fontSize: 14.5,
  lineHeight: 22,
},
  notesBox: {
    backgroundColor: 'rgba(15,23,42,0.55)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
  },
  card: {
    backgroundColor: '#1e293b',
    padding: 18,
    borderRadius: 16,
    marginBottom: 16,
  },
  fileName: {
    color: '#bfdbfe',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  sectionTitle: {
  color: '#ffffff',
  fontSize: 18,
  fontWeight: '700',
  marginBottom: 2, // was 6
},
  bodyText: {
  color: '#cbd5e1',   // softer white
  fontSize: 14.5,     // smaller
  lineHeight: 22,     // tighter lines (big improvement)
  marginBottom: 4,
  letterSpacing: 0.2, // makes it easier to scan
},
  message: {
    color: '#94a3b8',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
});