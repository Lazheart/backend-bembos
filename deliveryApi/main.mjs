import { DynamoDBClient, QueryCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const dynamo = new DynamoDBClient({ region: "us-east-1" });
const s3 = new S3Client({ region: "us-east-1" });

const TABLE_NAME = "OrdersTable";
const BUCKET_NAME = "restaurant-orders-dashboard";

export const handler = async (event) => {
  try {
    const method = event.httpMethod;
    const path = event.path;
    const body = event.body ? JSON.parse(event.body) : {};
    const role = event.requestContext?.authorizer?.role || "USER";
    const userId = event.requestContext?.authorizer?.userId || "anonymous";

    if (role !== "DELIVERY") {
      return response(403, { message: "Access denied. DELIVERY role required." });
    }

    // --- 1️⃣ Listar pedidos disponibles para entrega ---
    if (method === "GET" && path === "/orders") {
      const tenantId = event.queryStringParameters?.tenantId || "DEFAULT";

      const result = await dynamo.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: "PK = :pk",
          ExpressionAttributeValues: {
            ":pk": { S: `TENANT#${tenantId}` },
          },
          FilterExpression: "#s = :ready",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: {
            ":pk": { S: `TENANT#${tenantId}` },
            ":ready": { S: "READY" },
          },
        })
      );

      const orders = result.Items?.map((i) => ({
        orderId: i.SK.S.replace("ORDER#", ""),
        status: i.status.S,
        total: Number(i.total.N),
        createdAt: i.createdAt.S,
        createdBy: i.createdBy.S,
      }));

      return response(200, { availableOrders: orders || [] });
    }

    // --- 2️⃣ Cambiar READY → SENDED ---
    if (method === "PUT" && path === "/orders/sent") {
      const { tenantId, orderId } = body;
      if (!tenantId || !orderId) return response(400, { message: "Missing tenantId or orderId" });

      const now = new Date().toISOString();

      await dynamo.send(
        new UpdateItemCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: { S: `TENANT#${tenantId}` },
            SK: { S: `ORDER#${orderId}` },
          },
          UpdateExpression:
            "SET #s = :s, updatedAt = :t, deliveredBy = :d",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: {
            ":s": { S: "SENDED" },
            ":t": { S: now },
            ":d": { S: userId },
          },
        })
      );

      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: `${orderId}.json`,
          Body: JSON.stringify({
            orderId,
            tenantId,
            status: "SENDED",
            updatedAt: now,
            deliveredBy: userId,
          }),
          ContentType: "application/json",
        })
      );

      return response(200, { message: `Order ${orderId} marked as SENDED.` });
    }

    // --- 3️⃣ Cambiar SENDED → DELIVERED ---
    if (method === "PUT" && path === "/orders/delivered") {
      const { tenantId, orderId } = body;
      if (!tenantId || !orderId) return response(400, { message: "Missing tenantId or orderId" });

      const now = new Date().toISOString();

      await dynamo.send(
        new UpdateItemCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: { S: `TENANT#${tenantId}` },
            SK: { S: `ORDER#${orderId}` },
          },
          UpdateExpression:
            "SET #s = :s, updatedAt = :t, deliveredAt = :dt",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: {
            ":s": { S: "DELIVERED" },
            ":t": { S: now },
            ":dt": { S: now },
          },
        })
      );

      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: `${orderId}.json`,
          Body: JSON.stringify({
            orderId,
            tenantId,
            status: "DELIVERED",
            updatedAt: now,
            deliveredAt: now,
            deliveredBy: userId,
          }),
          ContentType: "application/json",
        })
      );

      return response(200, { message: `Order ${orderId} delivered successfully.` });
    }

    return response(404, { message: "Route not found" });
  } catch (err) {
    console.error("❌ Error:", err);
    return response(500, { error: err.message });
  }
};

const response = (statusCode, body) => ({
  statusCode,
  body: JSON.stringify(body),
});
