const { PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const { dynamo, s3, TABLE_NAME, BUCKET_NAME } = require("./db");
const { parseBody, generateOrderId, response } = require("./utils");

async function handleCreate(event, user) {
  const data = parseBody(event);
  const tenantId = user.tenantId || "DEFAULT";
  const orderId = generateOrderId();
  const items = Array.isArray(data.items) ? data.items : [];
  const total = typeof data.total === 'number' ? data.total : Number(data.total) || 0;
  const now = new Date().toISOString();
  const createdBy = user.sub || 'anonymous';

  const item = {
    PK: { S: `TENANT#${tenantId}` },
    SK: { S: `ORDER#${orderId}` },
    createdAt: { S: now },
    updatedAt: { S: now },
    createdBy: { S: createdBy },
    status: { S: 'CREATED' },
    items: { S: JSON.stringify(items) },
    total: { N: total.toString() },
  };

  await dynamo.send(
    new PutItemCommand({
      TableName: TABLE_NAME,
      Item: item,
    })
  );

  // Persistir copia en S3 (opcional, asíncrono)
  const s3Body = JSON.stringify({ orderId, tenantId, createdAt: now, createdBy, status: 'CREATED' });
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `${orderId}.json`,
      Body: s3Body,
      ContentType: 'application/json',
    })
  );

  return response(201, {
    message: 'Order created successfully',
    order: {
      orderId,
      tenantId,
      status: 'CREATED',
      items,
      total,
      createdAt: now,
      updatedAt: now,
      createdBy,
    },
  });
}

module.exports = { handleCreate };
