const { QueryCommand } = require("@aws-sdk/client-dynamodb");
const { dynamo, TABLE_NAME } = require("./db");
const { response } = require("./utils");

async function handleList(event, user) {
  const tenantId = user.tenantId || 'DEFAULT';
  const role = (user.role || 'USER').toUpperCase();
  const createdBy = user.sub || 'anonymous';

  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: {
      ':pk': { S: `TENANT#${tenantId}` },
    },
  };

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

  return response(200, { orders });
}

module.exports = { handleList };
