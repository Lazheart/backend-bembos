const { QueryCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const { dynamo, TABLE_NAME } = require("./db");
const { response } = require("./utils");

async function handleCancel(event, user) {
  const tenantId = user.tenantId || 'DEFAULT';
  const role = (user.role || 'USER').toUpperCase();
  const createdBy = user.sub || 'anonymous';
  const path = event.path || '';
  const orderId = path.split('/')[2];

  // Obtener pedido
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

  // Only creator or OWNER can cancel
  if (role !== 'OWNER' && order.createdBy.S !== createdBy) {
    return response(403, { message: 'Forbidden' });
  }

  await dynamo.send(
    new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: { S: `TENANT#${tenantId}` },
        SK: { S: `ORDER#${orderId}` },
      },
      UpdateExpression: 'SET #s = :s, updatedAt = :t',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':s': { S: 'CANCELLED' },
        ':t': { S: new Date().toISOString() },
      },
    })
  );

  return response(200, { message: `Order ${orderId} cancelled.` });
}

module.exports = { handleCancel };
