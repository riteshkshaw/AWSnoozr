/**
 * Control EKS Workload Lambda
 * Scales a Kubernetes Deployment to a specified replica count.
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

function k8sPatch(endpoint, caCert, token, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const bodyStr = JSON.stringify(body);
    const req = https.request(
      {
        hostname: url.hostname,
        path,
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/strategic-merge-patch+json',
          'Content-Length': Buffer.byteLength(bodyStr),
          Accept: 'application/json'
        },
        ca: Buffer.from(caCert, 'base64')
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try { resolve({ statusCode: res.statusCode, body: JSON.parse(data) }); }
          catch (e) { reject(new Error(`Parse error: ${data.slice(0, 200)}`)); }
        });
      }
    );
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

exports.handler = async (event) => {
  const { clusterName, namespace, deployment } = event.pathParameters || {};
  const body = JSON.parse(event.body || '{}');
  const { replicas } = body;
  const accountId = event.queryStringParameters?.accountId;
  const region = event.queryStringParameters?.region || 'us-east-1';
  const userEmail = event.requestContext?.authorizer?.claims?.email || 'unknown';

  if (!clusterName || !namespace || !deployment || replicas === undefined || !accountId) {
    return respond(400, { error: 'clusterName, namespace, deployment, replicas and accountId are required' });
  }

  console.log(`Scale deployment: ${namespace}/${deployment} → ${replicas} replicas in ${clusterName} by ${userEmail}`);

  try {
    const credentials = await getCredentialsForAccount(accountId);

    const eks = new EKSClient({ region, credentials });
    const { cluster } = await eks.send(new DescribeClusterCommand({ name: clusterName }));

    const endpoint = cluster.endpoint;
    const caCert = cluster.certificateAuthority.data;
    const token = await getEKSToken(clusterName, credentials);

    const result = await k8sPatch(
      endpoint,
      caCert,
      token,
      `/apis/apps/v1/namespaces/${namespace}/deployments/${deployment}`,
      { spec: { replicas } }
    );

    if (result.statusCode >= 400) {
      return respond(result.statusCode, { error: result.body.message || 'Scale failed' });
    }

    return respond(200, {
      message: `Deployment ${namespace}/${deployment} scaled to ${replicas} replicas`,
      clusterName,
      namespace,
      deployment,
      replicas
    });
  } catch (err) {
    console.error('Error scaling deployment:', err);
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
