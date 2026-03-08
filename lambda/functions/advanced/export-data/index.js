/**
 * Export Data Lambda
 * Generates CSV/JSON exports of resources
 */

const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({});
const EXPORTS_BUCKET = process.env.EXPORTS_BUCKET || 'awsnoozr-exports';

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event));

  const method = event.httpMethod;
  const path = event.path;

  try {
    if (method === 'POST' && path === '/export/csv') {
      return await exportToCSV(event);
    } else if (method === 'POST' && path === '/export/json') {
      return await exportToJSON(event);
    }

    return errorResponse(404, 'Not found');
  } catch (error) {
    console.error('Error:', error);
    return errorResponse(500, error.message);
  }
};

async function exportToCSV(event) {
  const body = JSON.parse(event.body);
  const { resources, resourceType } = body;

  // Convert to CSV
  const headers = Object.keys(resources[0] || {});
  const csvRows = [headers.join(',')];

  resources.forEach(resource => {
    const values = headers.map(header => {
      const value = resource[header];
      return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
    });
    csvRows.push(values.join(','));
  });

  const csv = csvRows.join('\n');

  // Upload to S3
  const fileName = `${resourceType}-export-${Date.now()}.csv`;
  await s3.send(
    new PutObjectCommand({
      Bucket: EXPORTS_BUCKET,
      Key: fileName,
      Body: csv,
      ContentType: 'text/csv'
    })
  );

  // Generate signed URL
  const command = new GetObjectCommand({
    Bucket: EXPORTS_BUCKET,
    Key: fileName
  });
  const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

  return successResponse({
    message: 'Export created',
    fileName,
    downloadUrl: signedUrl,
    expiresIn: 3600
  });
}

async function exportToJSON(event) {
  const body = JSON.parse(event.body);
  const { resources, resourceType } = body;

  // Upload to S3
  const fileName = `${resourceType}-export-${Date.now()}.json`;
  await s3.send(
    new PutObjectCommand({
      Bucket: EXPORTS_BUCKET,
      Key: fileName,
      Body: JSON.stringify(resources, null, 2),
      ContentType: 'application/json'
    })
  );

  // Generate signed URL
  const command = new GetObjectCommand({
    Bucket: EXPORTS_BUCKET,
    Key: fileName
  });
  const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

  return successResponse({
    message: 'Export created',
    fileName,
    downloadUrl: signedUrl,
    expiresIn: 3600
  });
}

function successResponse(data) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(data)
  };
}

function errorResponse(statusCode, message) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ error: message })
  };
}
