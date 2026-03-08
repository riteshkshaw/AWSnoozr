import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';

export default function ResourceListScreen({ navigation, route }: any) {
  const [selectedType, setSelectedType] = useState(route?.params?.type || 'ec2');
  const resources = useSelector((state: any) => state.resources);

  const getResources = () => {
    switch (selectedType) {
      case 'ec2': return resources.ec2 || [];
      case 'rds': return resources.rds || [];
      case 'redshift': return resources.redshift || [];
      case 'eks': return resources.eks || [];
      default: return [];
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        {['ec2', 'rds', 'redshift', 'eks'].map(type => (
          <TouchableOpacity
            key={type}
            style={[styles.tab, selectedType === type && styles.tabActive]}
            onPress={() => setSelectedType(type)}
          >
            <Text style={[styles.tabText, selectedType === type && styles.tabTextActive]}>
              {type.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={getResources()}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('ResourceDetail', { resource: item })}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.id}</Text>
              <View style={[styles.badge, { backgroundColor: item.state === 'running' ? '#48bb78' : '#ed8936' }]}>
                <Text style={styles.badgeText}>{item.state}</Text>
              </View>
            </View>
            <Text style={styles.cardMeta}>{item.region} • {item.type || item.instanceType}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No {selectedType.toUpperCase()} resources found</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', padding: 8 },
  tab: { flex: 1, padding: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#4299e1' },
  tabText: { fontSize: 14, color: '#718096' },
  tabTextActive: { color: '#4299e1', fontWeight: '600' },
  card: { backgroundColor: '#fff', margin: 12, padding: 16, borderRadius: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#2d3748' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  cardMeta: { fontSize: 14, color: '#718096' },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#a0aec0' },
});
