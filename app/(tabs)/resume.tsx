import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useResume } from '@/context/ResumeContext';

export default function ResumeScreen() {
  const { fileName, setFileName, setFeedback, loading, setLoading } = useResume();

  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];

      setFileName(file.name);
      setLoading(true);
      setFeedback(null);

      const formData = new FormData();
      formData.append('resume', {
        uri: file.uri,
        name: file.name,
        type: file.mimeType || 'application/pdf',
      } as any);

      const response = await fetch(
        'https://contributions-iso-trailer-dicke.trycloudflare.com/analyze-resume',
        {
          method: 'POST',
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze resume');
      }

      setFeedback(data.result);
      setLoading(false);
      router.push('/feedback');
    } catch (error: any) {
      console.error('ERROR:', error);
      setLoading(false);
      Alert.alert('Error', error?.message || 'Upload failed');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Resume Upload</Text>

      <TouchableOpacity
        style={styles.button}
        onPress={handleUpload}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading
            ? 'Analyzing Resume...'
            : fileName
            ? 'Upload Another Resume'
            : 'Upload Resume'}
        </Text>
      </TouchableOpacity>

      {fileName && !loading && (
        <View style={styles.successBox}>
          <Text style={styles.successText}>✅ Uploaded Successfully</Text>
          <Text style={styles.fileText}>{fileName}</Text>
        </View>
      )}

      {loading && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Analyzing your resume...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    color: '#fff',
    marginBottom: 30,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#3b82f6',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  successBox: {
    marginTop: 20,
    alignItems: 'center',
  },
  successText: {
    color: '#22c55e',
    fontSize: 16,
    marginBottom: 5,
    fontWeight: '600',
  },
  fileText: {
    color: '#94a3b8',
    fontSize: 15,
    textAlign: 'center',
  },
  loadingBox: {
    marginTop: 25,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#cbd5e1',
    fontSize: 15,
  },
});