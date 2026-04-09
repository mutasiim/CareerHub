import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useResume } from '@/context/ResumeContext';

export default function FeedbackScreen() {
  const { feedback, fileName, loading } = useResume();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>AI Feedback</Text>

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
              <Text style={styles.scoreNumber}>{feedback.score}/100</Text>
              <Text style={styles.scoreLabel}>Overall Resume Score</Text>
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
    paddingTop: 70,
    paddingBottom: 40,
  },
  title: {
    fontSize: 30,
    color: '#ffffff',
    fontWeight: '700',
    marginBottom: 24,
    textAlign: 'center',
  },
  scoreCard: {
    backgroundColor: '#1d4ed8',
    padding: 22,
    borderRadius: 18,
    marginBottom: 18,
    alignItems: 'center',
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