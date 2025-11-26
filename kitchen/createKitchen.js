const { v4: uuidv4 } = require('uuid');
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { json } = require('../http');

const dynamo = new DynamoDBClient({});
const KITCHEN_TABLE = process.env.KITCHEN_TABLE || `KitchenTable-${process.env.SLS_STAGE || 'dev'}`;

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { name, role: bodyRole, maxCooking } = body;

    // Obtener tenantId y role del authorizer (más seguro). Fallback a body solo si authorizer ausente.
    let tenantId = null;
    let role = null;
    if (event && event.requestContext && event.requestContext.authorizer) {
      const auth = event.requestContext.authorizer;
      const claims = auth.claims || auth;
      tenantId = auth.tenantId || (claims && claims.tenantId) || null;
      role = auth.role || (claims && claims.role) || null;
    }
    if (!tenantId && body.tenantId) tenantId = body.tenantId;
    if (!role && bodyRole) role = bodyRole;

    if (!tenantId || !name) {
      return json(400, { message: 'Missing tenantId (from authorizer) or name' }, event);
    }
    if (!role || String(role).toLowerCase() !== 'admin') {
      return json(403, { message: 'Forbidden: admin role required' }, event);
    }

    const kitchenId = `KITCHEN-${uuidv4()}`;
    const now = new Date().toISOString();
    const item = {
      tenantId: { S: tenantId },
      kitchenId: { S: kitchenId },
      name: { S: String(name).trim() },
      maxCooking: { N: String(maxCooking && maxCooking > 0 ? maxCooking : 5) },
      currentCooking: { N: '0' },
      active: { BOOL: true },
      createdAt: { S: now },
      updatedAt: { S: now },
    };

    await dynamo.send(new PutItemCommand({
      TableName: KITCHEN_TABLE,
      Item: item,
      ConditionExpression: 'attribute_not_exists(kitchenId)'
    }));

    return json(201, { message: 'Kitchen created', kitchenId }, event);
  } catch (err) {
    console.error('CREATE KITCHEN ERROR:', err);
    return json(500, { message: 'Server error', error: err.message }, event);
  }
};