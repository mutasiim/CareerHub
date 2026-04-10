import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useResume } from '@/context/ResumeContext';

export default function FeedbackScreen() {
  const { feedback, fileName, loading } = useResume();

  const [animatedScore, setAnimatedScore] = useState(0);
  const [animatedAtsScore, setAnimatedAtsScore] = useState(0);

  useEffect(() => {
    if (!feedback || feedback.isResume === false || typeof feedback.score !== 'number') {
      setAnimatedScore(0);
      return;
    }

    let start = 0;
    const end = feedback.score;
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
  }, [feedback]);

  useEffect(() => {
    if (!feedback || feedback.isResume === false || typeof feedback.atsScore !== 'number') {
      setAnimatedAtsScore(0);
      return;
    }

    let start = 0;
    const end = feedback.atsScore;
    const duration = 900;
    const stepTime = 16;
    const increment = Math.max(1, Math.ceil(end / (duration / stepTime)));

    const timer = setInterval(() => {
      start += increment;

      if (start >= end) {
        setAnimatedAtsScore(end);
        clearInterval(timer);
      } else {
        setAnimatedAtsScore(start);
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [feedback]);

  const getTierColors = (tier: 'Gold' | 'Silver' | 'Bronze') => {
    switch (tier) {
      case 'Gold':
        return {
          bg: 'rgba(250,204,21,0.16)',
          border: 'rgba(250,204,21,0.35)',
          text: '#fde68a',
          icon: 'trophy-outline' as const,
        };
      case 'Silver':
        return {
          bg: 'rgba(148,163,184,0.16)',
          border: 'rgba(148,163,184,0.35)',
          text: '#cbd5e1',
          icon: 'medal-outline' as const,
        };
      default:
        return {
          bg: 'rgba(180,83,9,0.18)',
          border: 'rgba(180,83,9,0.35)',
          text: '#fdba74',
          icon: 'ribbon-outline' as const,
        };
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>AI Feedback</Text>

        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <Text style={styles.message}>Your resume is still being analyzed...</Text>
      ) : feedback ? (
        feedback.isResume === false ? (
          <View style={styles.card}>
            {fileName ? <Text style={styles.fileName}>File: {fileName}</Text> : null}
            <Text style={styles.sectionTitle}>Invalid File</Text>
            <Text style={styles.bodyText}>{feedback.message}</Text>
          </View>
        ) : (
          <>
            <View style={styles.scoreCard}>
              {fileName ? <Text style={styles.fileName}>Resume: {fileName}</Text> : null}
              <Text style={styles.scoreNumber}>{animatedScore}/100</Text>
              <Text style={styles.scoreLabel}>Overall Resume Score</Text>
            </View>

            <View
              style={[
                styles.tierCard,
                {
                  backgroundColor: getTierColors(feedback.resumeTier).bg,
                  borderColor: getTierColors(feedback.resumeTier).border,
                },
              ]}
            >
              <Ionicons
                name={getTierColors(feedback.resumeTier).icon}
                size={20}
                color={getTierColors(feedback.resumeTier).text}
              />
              <Text style={[styles.tierText, { color: getTierColors(feedback.resumeTier).text }]}>
                {feedback.resumeTier} Resume
              </Text>
            </View>

            <View style={styles.atsCard}>
              <Text style={styles.sectionTitle}>ATS Score</Text>
              <Text style={styles.atsNumber}>{animatedAtsScore}/100</Text>
              <Text style={styles.atsLabel}>Screening / system-readability score</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Weakest Bullet</Text>
              <Text style={styles.bodyText}>{feedback.weakestBullet}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Rewritten Bullet</Text>
              <Text style={styles.bodyText}>{feedback.rewrittenBullet}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Score Breakdown</Text>
              <Text style={styles.bodyText}>
                Overall Impression: {feedback.scoreBreakdown.overallImpression}/15
              </Text>
              <Text style={styles.bodyText}>
                Content and Relevance: {feedback.scoreBreakdown.contentAndRelevance}/30
              </Text>
              <Text style={styles.bodyText}>
                Formatting and Visual Appeal: {feedback.scoreBreakdown.formattingAndVisualAppeal}/20
              </Text>
              <Text style={styles.bodyText}>
                Language and Professionalism: {feedback.scoreBreakdown.languageAndProfessionalism}/20
              </Text>
              <Text style={styles.bodyText}>
                Career Alignment / Impact: {feedback.scoreBreakdown.careerAlignmentImpact}/15
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Overall Impression</Text>
              <Text style={styles.bodyText}>{feedback.overallImpression}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Content and Relevance</Text>
              <Text style={styles.bodyText}>{feedback.contentAndRelevance}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Formatting and Visual Appeal</Text>
              <Text style={styles.bodyText}>{feedback.formattingAndVisualAppeal}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Language and Professionalism</Text>
              <Text style={styles.bodyText}>{feedback.languageAndProfessionalism}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Recommendations</Text>
              {feedback.recommendations.map((item, index) => (
                <Text key={index} style={styles.bodyText}>
                  {index + 1}. {item}
                </Text>
              ))}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Additional Notes</Text>
              <Text style={styles.bodyText}>{feedback.additionalNotes}</Text>
            </View>
          </>
        )
      ) : (
        <Text style={styles.message}>
          No feedback yet. Upload a resume first from the Resume tab.
        </Text>
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
    paddingTop: 56,
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
  scoreCard: {
    backgroundColor: '#1d4ed8',
    padding: 22,
    borderRadius: 18,
    marginBottom: 14,
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
  scoreLabel: {
    color: '#dbeafe',
    fontSize: 16,
    marginTop: 6,
    fontWeight: '600',
  },
  tierCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
    gap: 8,
  },
  tierText: {
    fontSize: 16,
    fontWeight: '700',
  },
  atsCard: {
    backgroundColor: '#111827',
    padding: 18,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  atsNumber: {
    color: '#60a5fa',
    fontSize: 34,
    fontWeight: '800',
    marginTop: 6,
  },
  atsLabel: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
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
    marginBottom: 12,
  },
  bodyText: {
    color: '#e2e8f0',
    fontSize: 16,
    lineHeight: 28,
    marginBottom: 10,
  },
  message: {
    color: '#94a3b8',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
});