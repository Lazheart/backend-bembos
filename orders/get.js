const { QueryCommand } = require("@aws-sdk/client-dynamodb");
const { dynamo, TABLE_NAME } = require("./db");
const { response } = require("./utils");

async function handleGet(event, user) {
  const tenantId = user.tenantId || 'DEFAULT';
  const role = (user.role || 'USER').toUpperCase();
  const createdBy = user.sub || 'anonymous';
  const path = event.path || '';
  const orderId = path.split('/')[2];

  const result = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: {
        ':pk': { S: `TENANT#${tenantId}` },
        ':sk': { S: `ORDER#${orderId}` },
      },
    })
  );

  if (!result.Items || result.Items.length === 0) {
    return response(404, { message: 'Order not found' });
  }

  const order = result.Items[0];

  if (role === 'USER' && order.createdBy.S !== createdBy) {
    return response(403, { message: 'Forbidden' });
  }

  return response(200, {
    orderId,
    status: order.status.S,
    items: JSON.parse(order.items.S),
    total: Number(order.total.N),
    createdAt: order.createdAt.S,
    updatedAt: order.updatedAt.S,
    createdBy: order.createdBy.S,
  });
}

module.exports = { handleGet };
