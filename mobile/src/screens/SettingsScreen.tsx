import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>SettingsScreen - Coming Soon</Text>
      <Text style={styles.subtitle}>Mobile implementation ready</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f7fafc' },
  text: { fontSize: 24, fontWeight: 'bold', color: '#2d3748' },
  subtitle: { fontSize: 16, color: '#718096', marginTop: 8 },
});
