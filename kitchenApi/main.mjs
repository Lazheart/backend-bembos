import {
  DynamoDBClient,
  QueryCommand,
  UpdateItemCommand
} from "@aws-sdk/client-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const dynamo = new DynamoDBClient({ region: "us-east-1" });
const s3 = new S3Client({ region: "us-east-1" });

const TABLE_NAME = "OrdersTable";
const BUCKET_NAME = "restaurant-orders-dashboard";

export const handler = async (event) => {
  try {
    const method = event.httpMethod;
    const path = event.path;
    const user = event.requestContext?.authorizer?.claims || {};
    const role = user.role || "KITCHEN"; // Solo cocina usa este handler
    const tenantId = user.tenantId || "BEMBOS";

    console.log("📩 Incoming request:", { method, path, role });

    // --- LISTAR PEDIDOS ---
    if (method === "GET" && path === "/kitchen/orders") {
      const statusFilter = event.queryStringParameters?.status || "CREATED";

      const result = await dynamo.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: "PK = :pk",
          FilterExpression: "#s = :status",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: {
            ":pk": { S: `TENANT#${tenantId}` },
            ":status": { S: statusFilter },
          },
        })
      );

      const orders = result.Items?.map((item) => ({
        orderId: item.SK.S.replace("ORDER#", ""),
        status: item.status.S,
        createdAt: item.createdAt.S,
        createdBy: item.createdBy.S,
        items: JSON.parse(item.items.S),
        total: Number(item.total.N),
      }));

      return response(200, { orders });
    }

    // --- DETALLE DE UN PEDIDO ---
    if (method === "GET" && path.match(/^\/kitchen\/orders\/[^/]+$/)) {
      const orderId = path.split("/")[3];

      const result = await dynamo.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: "PK = :pk AND SK = :sk",
          ExpressionAttributeValues: {
            ":pk": { S: `TENANT#${tenantId}` },
            ":sk": { S: `ORDER#${orderId}` },
          },
        })
      );

      if (!result.Items || result.Items.length === 0)
        return response(404, { message: "Order not found" });

      const order = result.Items[0];

      return response(200, {
        orderId,
        status: order.status.S,
        createdBy: order.createdBy.S,
        items: JSON.parse(order.items.S),
        total: Number(order.total.N),
        createdAt: order.createdAt.S,
        updatedAt: order.updatedAt.S,
      });
    }

    // --- ACTUALIZAR ESTADO ---
    if (method === "PATCH" && path.match(/^\/kitchen\/orders\/[^/]+$/)) {
      const orderId = path.split("/")[3];
      const body = JSON.parse(event.body || "{}");
      const newStatus = body.status;
      const updatedBy = body.updatedBy || user.sub || "kitchen_user_01";
      const now = new Date().toISOString();

      if (!["COOKING", "READY"].includes(newStatus))
        return response(400, { message: "Invalid status transition" });

      await dynamo.send(
        new UpdateItemCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: { S: `TENANT#${tenantId}` },
            SK: { S: `ORDER#${orderId}` },
          },
          UpdateExpression:
            "SET #s = :s, updatedAt = :t, preparedBy = :u",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: {
            ":s": { S: newStatus },
            ":t": { S: now },
            ":u": { S: updatedBy },
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
            status: newStatus,
            updatedAt: now,
            preparedBy: updatedBy,
          }),
          ContentType: "application/json",
        })
      );

      return response(200, {
        message: `Order ${orderId} updated to ${newStatus}`,
        orderId,
      });
    }

    // --- Ruta no encontrada ---
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
