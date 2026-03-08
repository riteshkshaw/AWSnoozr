import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { setEC2, setRDS, setRedshift, setEKS } from '../store/resourcesSlice';

export default function DashboardScreen({ navigation }: any) {
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [costData, setCostData] = useState<any>(null);
  const dispatch = useDispatch();
  const resources = useSelector((state: any) => state.resources);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Load resources in parallel
      const [ec2Data, rdsData, redshiftData, eksData, costs] = await Promise.all([
        api.listEC2(),
        api.listRDS(),
        api.listRedshift(),
        api.listEKS(),
        api.getCostSummary(),
      ]);

      dispatch(setEC2(ec2Data.instances || []));
      dispatch(setRDS(rdsData.instances || []));
      dispatch(setRedshift(redshiftData.clusters || []));
      dispatch(setEKS(eksData.clusters || []));
      setCostData(costs);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboardData();
  };

  const getTotalResources = () => {
    return (
      (resources.ec2?.length || 0) +
      (resources.rds?.length || 0) +
      (resources.redshift?.length || 0) +
      (resources.eks?.length || 0)
    );
  };

  const getRunningCount = () => {
    const running = resources.ec2?.filter((i: any) => i.state === 'running').length || 0;
    const rdsRunning = resources.rds?.filter((i: any) => i.state === 'available').length || 0;
    return running + rdsRunning;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4299e1" />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>Dashboard</Text>
        <Text style={styles.subtitle}>AWS Resource Overview</Text>
      </View>

      {/* Cost Summary */}
      {costData && (
        <View style={styles.costCard}>
          <Text style={styles.cardTitle}>💰 Monthly Cost</Text>
          <Text style={styles.costAmount}>${costData.totalCost || '0.00'}</Text>
          <View style={styles.costDetails}>
            <View style={styles.costItem}>
              <Text style={styles.costLabel}>Forecast</Text>
              <Text style={styles.costValue}>${costData.forecast || '0.00'}</Text>
            </View>
            <View style={styles.costItem}>
              <Text style={styles.costLabel}>Last Month</Text>
              <Text style={styles.costValue}>${costData.lastMonth || '0.00'}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Resource Summary Cards */}
      <View style={styles.statsGrid}>
        <TouchableOpacity
          style={styles.statCard}
          onPress={() => navigation.navigate('Resources', { type: 'ec2' })}
        >
          <Ionicons name="server" size={32} color="#4299e1" />
          <Text style={styles.statNumber}>{resources.ec2?.length || 0}</Text>
          <Text style={styles.statLabel}>EC2 Instances</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.statCard}
          onPress={() => navigation.navigate('Resources', { type: 'rds' })}
        >
          <Ionicons name="database" size={32} color="#48bb78" />
          <Text style={styles.statNumber}>{resources.rds?.length || 0}</Text>
          <Text style={styles.statLabel}>RDS Databases</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.statCard}
          onPress={() => navigation.navigate('Resources', { type: 'redshift' })}
        >
          <Ionicons name="analytics" size={32} color="#ed8936" />
          <Text style={styles.statNumber}>{resources.redshift?.length || 0}</Text>
          <Text style={styles.statLabel}>Redshift</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.statCard}
          onPress={() => navigation.navigate('Resources', { type: 'eks' })}
        >
          <Ionicons name="cube" size={32} color="#9f7aea" />
          <Text style={styles.statNumber}>{resources.eks?.length || 0}</Text>
          <Text style={styles.statLabel}>EKS Clusters</Text>
        </TouchableOpacity>
      </View>

      {/* Quick Stats */}
      <View style={styles.quickStats}>
        <View style={styles.quickStatItem}>
          <Ionicons name="checkmark-circle" size={24} color="#48bb78" />
          <View>
            <Text style={styles.quickStatNumber}>{getRunningCount()}</Text>
            <Text style={styles.quickStatLabel}>Running</Text>
          </View>
        </View>

        <View style={styles.quickStatItem}>
          <Ionicons name="pause-circle" size={24} color="#ed8936" />
          <View>
            <Text style={styles.quickStatNumber}>
              {getTotalResources() - getRunningCount()}
            </Text>
            <Text style={styles.quickStatLabel}>Stopped</Text>
          </View>
        </View>

        <View style={styles.quickStatItem}>
          <Ionicons name="calendar" size={24} color="#4299e1" />
          <View>
            <Text style={styles.quickStatNumber}>
              {/* TODO: Get from schedules */}
              -
            </Text>
            <Text style={styles.quickStatLabel}>Scheduled</Text>
          </View>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.actionsCard}>
        <Text style={styles.cardTitle}>⚡ Quick Actions</Text>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Resources')}
        >
          <Ionicons name="server-outline" size={20} color="#4299e1" />
          <Text style={styles.actionText}>View All Resources</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Schedules')}
        >
          <Ionicons name="time-outline" size={20} color="#4299e1" />
          <Text style={styles.actionText}>Manage Schedules</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Costs')}
        >
          <Ionicons name="analytics-outline" size={20} color="#4299e1" />
          <Text style={styles.actionText}>View Cost Analytics</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f7fafc',
  },
  loadingText: {
    marginTop: 16,
    color: '#718096',
    fontSize: 16,
  },
  header: {
    padding: 20,
    paddingTop: 50,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2d3748',
  },
  subtitle: {
    fontSize: 16,
    color: '#718096',
    marginTop: 4,
  },
  costCard: {
    backgroundColor: '#fff',
    margin: 20,
    marginTop: 10,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 12,
  },
  costAmount: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#4299e1',
    marginBottom: 16,
  },
  costDetails: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  costItem: {
    alignItems: 'center',
  },
  costLabel: {
    fontSize: 12,
    color: '#718096',
    marginBottom: 4,
  },
  costValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2d3748',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10,
  },
  statCard: {
    backgroundColor: '#fff',
    width: '45%',
    margin: '2.5%',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2d3748',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 14,
    color: '#718096',
    marginTop: 4,
    textAlign: 'center',
  },
  quickStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#fff',
    margin: 20,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  quickStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quickStatNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2d3748',
  },
  quickStatLabel: {
    fontSize: 12,
    color: '#718096',
  },
  actionsCard: {
    backgroundColor: '#fff',
    margin: 20,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 40,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    gap: 12,
  },
  actionText: {
    fontSize: 16,
    color: '#2d3748',
  },
});
