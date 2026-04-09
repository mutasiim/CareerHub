import { StyleSheet, Text, View } from 'react-native';

export default function ResourcesScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Resources</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    color: '#ffffff',
    fontWeight: '600',
  },
});