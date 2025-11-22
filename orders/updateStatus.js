const { QueryCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const { dynamo, TABLE_NAME } = require("./db");
const { response } = require("./utils");

/**
 * Body: { status: 'CANCELLED' | 'COOKING' | 'SENDED' }
 * Rules:
 * - CANCELLED: allowed only if current status === 'CREATED' and requester is creator or OWNER
 * - COOKING: allowed only for OWNER and if current status === 'CREATED'
 * - SENDED: allowed only for OWNER and if current status === 'COOKING'
 */
async function handleUpdateStatus(event, user) {
  const tenantId = user.tenantId || 'DEFAULT';
  const role = (user.role || 'USER').toUpperCase();
  const createdBy = user.sub || 'anonymous';
  const path = event.path || '';
  const orderId = path.split('/')[2];

  const body = event.body ? JSON.parse(event.body) : {};
  const desired = (body.status || '').toString().toUpperCase();

  const allowedStatuses = ['CREATED', 'COOKING', 'SENDED', 'DELIVERED', 'CANCELLED'];
  if (!allowedStatuses.includes(desired)) {
    return response(400, { message: 'Invalid status' });
  }

  // Get current order
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
  const current = (order.status && order.status.S) || 'CREATED';

  // Authorization and transition rules
  if (desired === 'CANCELLED') {
    if (current !== 'CREATED') {
      return response(400, { message: 'Order cannot be cancelled at this stage' });
    }
    if (role !== 'OWNER' && order.createdBy.S !== createdBy) {
      return response(403, { message: 'Forbidden' });
    }
  } else if (desired === 'COOKING') {
    if (role !== 'OWNER') return response(403, { message: 'Only OWNER can set COOKING' });
    if (current !== 'CREATED') return response(400, { message: 'Can only set COOKING from CREATED' });
  } else if (desired === 'SENDED') {
    if (role !== 'OWNER') return response(403, { message: 'Only OWNER can set SENDED' });
    if (current !== 'COOKING') return response(400, { message: 'Can only set SENDED from COOKING' });
  } else if (desired === 'DELIVERED') {
    // Delivered can be set only when order was already SENDED. Allowed by OWNER or delivery role.
    if (current !== 'SENDED') return response(400, { message: 'Can only set DELIVERED from SENDED' });
    if (role !== 'OWNER' && role !== 'DELIVERY') return response(403, { message: 'Only OWNER or DELIVERY role can set DELIVERED' });
  }

  // perform update
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
        ':s': { S: desired },
        ':t': { S: new Date().toISOString() },
      },
    })
  );

  return response(200, { message: `Order ${orderId} status updated to ${desired}` });
}

module.exports = { handleUpdateStatus };
