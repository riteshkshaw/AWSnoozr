import axios from 'axios';
import { fetchAuthSession } from 'aws-amplify/auth';

const API_BASE_URL = process.env.REACT_APP_API_GATEWAY_URL;

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add request interceptor to attach JWT token
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
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirect to login on unauthorized
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// API methods
const api = {
  // Compute - Read
  listEC2: () => apiClient.get('/compute/ec2'),
  listEKS: () => apiClient.get('/compute/eks'),

  // Compute - Control
  stopEC2: (instanceId, region, accountId) =>
    apiClient.post(`/compute/ec2/${instanceId}/stop?region=${region}&accountId=${accountId}`, { action: 'stop' }),
  startEC2: (instanceId, region, accountId) =>
    apiClient.post(`/compute/ec2/${instanceId}/start?region=${region}&accountId=${accountId}`, { action: 'start' }),
  scaleEKSNodeGroup: (cluster, nodegroupName, desiredSize, region, accountId) =>
    apiClient.post(
      `/compute/eks/${cluster}/nodegroup/${nodegroupName}/scale?region=${region}&accountId=${accountId}`,
      { desiredSize }
    ),
  listEKSWorkloads: (clusterName, region, accountId) =>
    apiClient.get(`/compute/eks/${clusterName}/workloads?region=${region}&accountId=${accountId}`)
      .then(res => res.data),
  scaleEKSDeployment: (clusterName, namespace, deployment, replicas, region, accountId) =>
    apiClient.post(
      `/compute/eks/${clusterName}/scale-deployment?region=${region}&accountId=${accountId}`,
      { namespace, deployment, replicas }
    ).then(res => res.data),

  // Databases - Read
  listRDS: () => apiClient.get('/databases/rds'),
  listRedshift: () => apiClient.get('/databases/redshift'),

  // Databases - Control
  stopRDS: (resourceId, resourceType, region, accountId) =>
    apiClient.post(`/databases/rds/${resourceId}/stop?region=${region}&accountId=${accountId}`, {
      action: 'stop',
      resourceType
    }),
  startRDS: (resourceId, resourceType, region, accountId) =>
    apiClient.post(`/databases/rds/${resourceId}/start?region=${region}&accountId=${accountId}`, {
      action: 'start',
      resourceType
    }),
  pauseRedshift: (clusterId, region, accountId) =>
    apiClient.post(`/databases/redshift/${clusterId}/pause?region=${region}&accountId=${accountId}`, {
      action: 'pause'
    }),
  resumeRedshift: (clusterId, region, accountId) =>
    apiClient.post(`/databases/redshift/${clusterId}/resume?region=${region}&accountId=${accountId}`, {
      action: 'resume'
    }),

  // Networking - Read
  listNATGateways: () => apiClient.get('/networking/nat-gateways'),
  listElasticIPs: () => apiClient.get('/networking/elastic-ips'),
  listLoadBalancers: () => apiClient.get('/networking/load-balancers'),

  // Storage - Read
  listEBSVolumes: () => apiClient.get('/storage/ebs'),

  // Schedules
  listSchedules: () => apiClient.get('/schedules'),
  createSchedule: (schedule) => apiClient.post('/schedules', schedule),
  updateSchedule: (resourceId, scheduleType, updates) =>
    apiClient.put(`/schedules/${resourceId}/${scheduleType}`, updates),
  deleteSchedule: (resourceId, scheduleType) =>
    apiClient.delete(`/schedules/${resourceId}/${scheduleType}`),

  // Costs
  getCostSummary: () => apiClient.get('/costs/summary'),
  getCostTrend: () => apiClient.get('/costs/trend'),
  getResourceCost: (resourceId, resourceType, region) =>
    apiClient.get(`/costs/resource/${resourceId}?resourceType=${resourceType}&region=${region}`),

  // Accounts (Multi-Account Support)
  listAccounts: () => apiClient.get('/accounts').then(res => res.data),
  createAccount: (account) => apiClient.post('/accounts', account).then(res => res.data),
  updateAccount: (accountId, updates) =>
    apiClient.put(`/accounts/${accountId}`, updates).then(res => res.data),
  deleteAccount: (accountId) =>
    apiClient.delete(`/accounts/${accountId}`).then(res => res.data),
  testAccountConnection: (accountId) =>
    apiClient.post(`/accounts/${accountId}/test`).then(res => res.data),
  aggregateResources: (resourceType = 'all', accountId = null) =>
    apiClient.get(`/accounts/resources?type=${resourceType}${accountId ? `&accountId=${accountId}` : ''}`).then(res => res.data),

  // Tags (Tag Filtering)
  getAllTags: () => apiClient.get('/tags').then(res => res.data),
  searchByTags: (tags) =>
    apiClient.get(`/tags/search?tags=${JSON.stringify(tags)}`).then(res => res.data),
  reindexTags: () => apiClient.post('/tags/reindex').then(res => res.data),
  bulkOperation: (action, filters) =>
    apiClient.post('/resources/bulk-operation', { action, filters }).then(res => res.data),

  // Budgets (Budget Enforcement)
  getCurrentBudget: () => apiClient.get('/budgets/current').then(res => res.data),
  createOrUpdateBudget: (budget) => apiClient.post('/budgets', budget).then(res => res.data),
  getBudgetForecast: () => apiClient.get('/budgets/forecast').then(res => res.data),
  checkBudget: (resource) => apiClient.post('/budgets/check', resource).then(res => res.data),
  logBudgetOverride: (override) => apiClient.post('/budgets/override', override).then(res => res.data)
};

export default api;
