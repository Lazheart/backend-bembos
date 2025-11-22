const { QueryCommand } = require("@aws-sdk/client-dynamodb");
const { dynamo, TABLE_NAME } = require("./db");
const { response } = require("./utils");

async function handleList(event, user) {
  const tenantId = user.tenantId || 'DEFAULT';
  const role = (user.role || 'USER').toUpperCase();
  const createdBy = user.sub || 'anonymous';

  // Paginación: limit y lastKey
  const qs = event.queryStringParameters || {};
  const limit = qs.limit ? Math.max(1, Math.min(100, parseInt(qs.limit))) : 20;
  let ExclusiveStartKey = undefined;
  if (qs.lastKey) {
    try {
      ExclusiveStartKey = JSON.parse(Buffer.from(qs.lastKey, 'base64').toString('utf8'));
    } catch (e) {
      return response(400, { message: 'Invalid lastKey param' });
    }
  }

  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: {
      ':pk': { S: `TENANT#${tenantId}` },
    },
    Limit: limit,
  };
  if (ExclusiveStartKey) params.ExclusiveStartKey = ExclusiveStartKey;

  // Si no es OWNER, filtrar por createdBy
  if (role !== 'OWNER') {
    params.FilterExpression = 'createdBy = :createdBy';
    params.ExpressionAttributeValues[':createdBy'] = { S: createdBy };
  }

  const result = await dynamo.send(new QueryCommand(params));

  const orders = (result.Items || []).map((item) => ({
    orderId: item.SK.S.replace(/^ORDER#/, ''),
    status: item.status?.S,
    total: Number(item.total?.N || 0),
    createdAt: item.createdAt?.S,
    updatedAt: item.updatedAt?.S,
    createdBy: item.createdBy?.S,
  }));

  let nextKey = null;
  if (result.LastEvaluatedKey) {
    nextKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
  }

  return response(200, { orders, nextKey });
}

module.exports = { handleList };
