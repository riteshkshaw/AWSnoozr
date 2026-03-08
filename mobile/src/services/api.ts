import axios from 'axios';
import { fetchAuthSession } from '@aws-amplify/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_GATEWAY_URL;

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor to attach JWT token
apiClient.interceptors.request.use(
  async (config) => {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Error getting auth token:', error);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for offline handling
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.message === 'Network Error') {
      // Queue request for later
      await queueFailedRequest(error.config);
    }
    return Promise.reject(error);
  }
);

// Queue failed requests for offline support
async function queueFailedRequest(config: any) {
  try {
    const queue = await AsyncStorage.getItem('requestQueue');
    const requests = queue ? JSON.parse(queue) : [];
    requests.push({
      ...config,
      timestamp: Date.now()
    });
    await AsyncStorage.setItem('requestQueue', JSON.stringify(requests));
  } catch (error) {
    console.error('Error queuing request:', error);
  }
}

// Process queued requests when back online
export async function processQueuedRequests() {
  try {
    const queue = await AsyncStorage.getItem('requestQueue');
    if (!queue) return;

    const requests = JSON.parse(queue);
    for (const request of requests) {
      try {
        await apiClient(request);
      } catch (error) {
        console.error('Error processing queued request:', error);
      }
    }
    await AsyncStorage.removeItem('requestQueue');
  } catch (error) {
    console.error('Error processing queue:', error);
  }
}

// API methods (same as web, but with offline support)
export const api = {
  // Compute
  listEC2: () => apiClient.get('/compute/ec2').then(res => res.data),
  listEKS: () => apiClient.get('/compute/eks').then(res => res.data),
  stopEC2: (instanceId: string, region: string) =>
    apiClient.post(`/compute/ec2/${instanceId}/stop?region=${region}`, { action: 'stop' }).then(res => res.data),
  startEC2: (instanceId: string, region: string) =>
    apiClient.post(`/compute/ec2/${instanceId}/start?region=${region}`, { action: 'start' }).then(res => res.data),

  // Databases
  listRDS: () => apiClient.get('/databases/rds').then(res => res.data),
  listRedshift: () => apiClient.get('/databases/redshift').then(res => res.data),
  stopRDS: (resourceId: string, resourceType: string, region: string) =>
    apiClient.post(`/databases/rds/${resourceId}/stop?region=${region}`, { action: 'stop', resourceType }).then(res => res.data),
  startRDS: (resourceId: string, resourceType: string, region: string) =>
    apiClient.post(`/databases/rds/${resourceId}/start?region=${region}`, { action: 'start', resourceType }).then(res => res.data),

  // Schedules
  listSchedules: () => apiClient.get('/schedules').then(res => res.data),
  createSchedule: (schedule: any) => apiClient.post('/schedules', schedule).then(res => res.data),

  // Costs
  getCostSummary: () => apiClient.get('/costs/summary').then(res => res.data),
  getCostTrend: () => apiClient.get('/costs/trend').then(res => res.data),

  // Accounts
  listAccounts: () => apiClient.get('/accounts').then(res => res.data),

  // Device registration for push notifications
  registerDevice: (token: string, platform: string) =>
    apiClient.post('/devices/register', { deviceToken: token, platform }).then(res => res.data)
};

export default api;
