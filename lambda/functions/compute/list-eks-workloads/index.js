/**
 * List EKS Workloads Lambda
 * Calls Kubernetes API to retrieve deployments and pods for a cluster.
 * Authenticates using a presigned STS token (aws eks get-token equivalent).
 */

const { EKSClient, DescribeClusterCommand } = require('@aws-sdk/client-eks');
const { DynamoDBClient, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');
const { SignatureV4 } = require('@smithy/signature-v4');
const { Sha256 } = require('@aws-crypto/sha256-js');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const https = require('https');

const dynamodb = new DynamoDBClient({});
const TABLE_NAME = process.env.ACCOUNTS_TABLE_NAME || 'awsnoozr-prod-accounts';

async function getCredentialsForAccount(accountId) {
  const { Item } = await dynamodb.send(
    new GetItemCommand({ TableName: TABLE_NAME, Key: { accountId: { S: accountId } } })
  );
  if (!Item) throw new Error(`Account ${accountId} not found`);
  const account = unmarshall(Item);
  const sts = new STSClient({});
  const { Credentials } = await sts.send(
    new AssumeRoleCommand({
      RoleArn: account.roleArn,
      RoleSessionName: 'AWSnoozrEKSSession',
      ExternalId: account.externalId,
      DurationSeconds: 900
    })
  );
  return {
    accessKeyId: Credentials.AccessKeyId,
    secretAccessKey: Credentials.SecretAccessKey,
    sessionToken: Credentials.SessionToken
  };
}

async function getEKSToken(clusterName, credentials) {
  const signer = new SignatureV4({
    credentials,
    region: 'us-east-1',
    service: 'sts',
    sha256: Sha256
  });

  const request = {
    method: 'GET',
    protocol: 'https:',
    hostname: 'sts.amazonaws.com',
    path: '/',
    query: {
      Action: 'GetCallerIdentity',
      Version: '2011-06-15'
    },
    headers: {
      host: 'sts.amazonaws.com',
      'x-k8s-aws-id': clusterName
    }
  };

  const signed = await signer.presign(request, { expiresIn: 60 });

  const queryString = Object.entries(signed.query || {})
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const presignedUrl = `https://${signed.hostname}${signed.path}?${queryString}`;
  const base64url = Buffer.from(presignedUrl)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `k8s-aws-v1.${base64url}`;
}

function k8sGet(endpoint, caCert, token, path) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const req = https.request(
      {
        hostname: url.hostname,
        path,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        },
        ca: Buffer.from(caCert, 'base64')
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`Parse error: ${data.slice(0, 200)}`)); }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

exports.handler = async (event) => {
  const { clusterName } = event.pathParameters || {};
  const accountId = event.queryStringParameters?.accountId;
  const region = event.queryStringParameters?.region || 'us-east-1';

  if (!clusterName || !accountId) {
    return respond(400, { error: 'clusterName and accountId are required' });
  }

  try {
    const credentials = await getCredentialsForAccount(accountId);

    const eks = new EKSClient({ region, credentials });
    const { cluster } = await eks.send(new DescribeClusterCommand({ name: clusterName }));

    const endpoint = cluster.endpoint;
    const caCert = cluster.certificateAuthority.data;
    const token = await getEKSToken(clusterName, credentials);

    const [deploymentsResp, podsResp] = await Promise.all([
      k8sGet(endpoint, caCert, token, '/apis/apps/v1/deployments'),
      k8sGet(endpoint, caCert, token, '/api/v1/pods')
    ]);

    const deployments = (deploymentsResp.items || []).map((d) => ({
      namespace: d.metadata.namespace,
      name: d.metadata.name,
      replicas: d.spec.replicas ?? 0,
      readyReplicas: d.status.readyReplicas ?? 0,
      availableReplicas: d.status.availableReplicas ?? 0,
      image: d.spec.template.spec.containers?.[0]?.image || '-'
    }));

    const pods = (podsResp.items || []).map((p) => ({
      namespace: p.metadata.namespace,
      name: p.metadata.name,
      phase: p.status.phase,
      node: p.spec.nodeName,
      ready: (p.status.conditions || []).find((c) => c.type === 'Ready')?.status === 'True'
    }));

    // Group by namespace for easy rendering
    const namespaces = {};
    deployments.forEach((d) => {
      if (!namespaces[d.namespace]) namespaces[d.namespace] = { deployments: [], pods: [] };
      namespaces[d.namespace].deployments.push(d);
    });
    pods.forEach((p) => {
      if (!namespaces[p.namespace]) namespaces[p.namespace] = { deployments: [], pods: [] };
      namespaces[p.namespace].pods.push(p);
    });

    return respond(200, { clusterName, namespaces });
  } catch (err) {
    console.error('Error listing EKS workloads:', err);
    return respond(500, { error: err.message });
  }
};

function respond(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(body)
  };
}
