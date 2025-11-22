const { DynamoDBClient, QueryCommand } = require('@aws-sdk/client-dynamodb');
const { json } = require('../http');

const dynamo = new DynamoDBClient({});
const KITCHEN_TABLE = process.env.KITCHEN_TABLE || `KitchenTable-${process.env.SLS_STAGE || 'dev'}`;

exports.handler = async (event) => {
  try {
    const tenantId = (event.queryStringParameters && event.queryStringParameters.tenantId) || null;
    if (!tenantId) {
      return json(400, { message: 'tenantId query param required' }, event);
    }

    // Paginación: limit y lastKey
    const qs = event.queryStringParameters || {};
    const limit = qs.limit ? Math.max(1, Math.min(100, parseInt(qs.limit))) : 20;
    let ExclusiveStartKey = undefined;
    if (qs.lastKey) {
      try {
        ExclusiveStartKey = JSON.parse(Buffer.from(qs.lastKey, 'base64').toString('utf8'));
      } catch (e) {
        return json(400, { message: 'Invalid lastKey param' }, event);
      }
    }

    const params = {
      TableName: KITCHEN_TABLE,
      KeyConditionExpression: 'tenantId = :t',
      ExpressionAttributeValues: { ':t': { S: tenantId } },
      Limit: limit,
    };
    if (ExclusiveStartKey) params.ExclusiveStartKey = ExclusiveStartKey;

    const result = await dynamo.send(new QueryCommand(params));

    const kitchens = (result.Items || []).map(it => ({
      kitchenId: it.kitchenId.S,
      name: it.name?.S,
      maxCooking: Number(it.maxCooking?.N || 0),
      currentCooking: Number(it.currentCooking?.N || 0),
      active: !!it.active?.BOOL,
    }));

    let nextKey = null;
    if (result.LastEvaluatedKey) {
      nextKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
    }

    return json(200, { kitchens, nextKey }, event);
  } catch (err) {
    console.error('LIST KITCHENS ERROR:', err);
    return json(500, { message: 'Server error', error: err.message }, event);
  }
};