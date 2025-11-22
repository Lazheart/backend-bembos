const { DynamoDBClient, QueryCommand } = require('@aws-sdk/client-dynamodb');
const { json } = require('../http');

const dynamo = new DynamoDBClient({});
const MENU_TABLE = process.env.MENU_TABLE || 'MenuTable'; // PK=tenantId, SK=dishId

exports.handler = async (event) => {
	try {
		const qs = event.queryStringParameters || {};
		const tenantId = qs.tenantId || null;
		if (!tenantId) {
			return json(400, { message: 'tenantId query param required' }, event);
		}

		// Paginación: limit y lastKey
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
			TableName: MENU_TABLE,
			KeyConditionExpression: 'tenantId = :t',
			ExpressionAttributeValues: { ':t': { S: tenantId } },
			Limit: limit,
		};
		if (ExclusiveStartKey) params.ExclusiveStartKey = ExclusiveStartKey;

		const result = await dynamo.send(new QueryCommand(params));

		const dishes = (result.Items || []).map(d => ({
			dishId: d.dishId.S,
			name: d.name?.S,
			description: d.description?.S,
			price: Number(d.price?.N || 0),
			available: d.available ? !!d.available.BOOL : true,
			imageUrl: d.imageUrl?.S || null,
		})).filter(d => d.available);

		// Codificar LastEvaluatedKey para la siguiente página
		let nextKey = null;
		if (result.LastEvaluatedKey) {
			nextKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
		}

		return json(200, { dishes, nextKey }, event);
	} catch (err) {
		console.error('GET MENU ERROR:', err);
		return json(500, { message: 'Server error', error: err.message }, event);
	}
};
