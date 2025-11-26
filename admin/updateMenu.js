const { DynamoDBClient, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const dynamo = new DynamoDBClient({});
const MENU_TABLE = process.env.MENU_TABLE || "MenuTable"; // Per-dish table: PK=tenantId, SK=dishId
const { json } = require("../http");
const { isValidUrl, uploadBase64ToS3 } = require("./menuHelpers");

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
  const { dishId, name, description, price, available, imageUrl, imageBase64, imageFilename, imageContentType } = body;

    // Obtener role y tenant desde authorizer (más seguro). Fallback a body.role/tenantId solo si authorizer ausente.
    let role = null;
    let tenantId = null;
    if (event && event.requestContext && event.requestContext.authorizer) {
      const auth = event.requestContext.authorizer;
      const claims = auth.claims || auth;
      role = auth.role || (claims && claims.role) || null;
      tenantId = auth.tenantId || (claims && claims.tenantId) || null;
    }
    if (!role && body.role) role = body.role;
    if (!tenantId && body.tenantId) tenantId = body.tenantId;

    // Campos mínimos
    if (!tenantId || (!dishId && !name) || (price === undefined || price === null)) {
      return json(400, { message: "Missing fields: tenantId (from authorizer), name (for create) and price are required" }, event);
    }

    // Role: por seguridad, este endpoint es para admin. Requerir role === 'admin'.
    if (!role || String(role).toLowerCase() !== "admin") {
      return json(403, { message: "Forbidden: admin role required" }, event);
    }

  const normalizedName = name ? String(name).trim() : null;
  const numericPrice = Number(price);
  if (!dishId && !normalizedName) return json(400, { message: "Invalid name" }, event);
    if (Number.isNaN(numericPrice) || numericPrice < 0) return json(400, { message: "Invalid price" }, event);

    let finalImageUrl = null;

    if (imageUrl) {
      if (!isValidUrl(imageUrl)) return json(400, { message: "Invalid imageUrl" }, event);
      finalImageUrl = imageUrl;
    } else if (imageBase64) {
      // subir a S3
      try {
        finalImageUrl = await uploadBase64ToS3(imageBase64, tenantId, imageFilename, imageContentType);
      } catch (err) {
        console.error("S3 upload error:", err);
        return json(500, { message: "Failed to upload image" }, event);
      }
    }

    const now = new Date().toISOString();

    // Create vs Update handling
    // This handler is intended for updates only (PATCH). For creating new dishes use POST /admin/menu (admin/createMenu.handler).
    if (!dishId) {
      return json(400, { message: "Missing dishId for update. Use POST to create new dishes." }, event);
    }

    // Update existing dish (upsert fields)
    const updateExprParts = ["updatedAt = :updatedAt", "price = :price"];
    const exprAttrValues = {
      ":updatedAt": { S: now },
      ":price": { N: String(numericPrice) },
    };
    const exprAttrNames = {};

    if (normalizedName) {
      updateExprParts.push("#name = :name");
      exprAttrValues[":name"] = { S: normalizedName };
      exprAttrNames["#name"] = "name";
    }
    if (description !== undefined) {
      updateExprParts.push("description = :description");
      exprAttrValues[":description"] = { S: String(description) };
    }
    if (available !== undefined) {
      updateExprParts.push("available = :available");
      exprAttrValues[":available"] = { BOOL: !!available };
    }
    if (finalImageUrl) {
      updateExprParts.push("imageUrl = :imageUrl");
      exprAttrValues[":imageUrl"] = { S: finalImageUrl };
    }

    const UpdateExpression = "SET " + updateExprParts.join(", ");

    try {
      await dynamo.send(
        new UpdateItemCommand({
          TableName: MENU_TABLE,
          Key: { tenantId: { S: tenantId }, dishId: { S: dishId } },
          UpdateExpression,
          ExpressionAttributeValues: exprAttrValues,
          ExpressionAttributeNames: Object.keys(exprAttrNames).length ? exprAttrNames : undefined,
          ConditionExpression: "attribute_exists(dishId)",
        })
      );
    } catch (err) {
      if (err.name === "ConditionalCheckFailedException") {
        return json(404, { message: "Dish not found" }, event);
      }
      console.error("Dynamo error (update dish):", err);
      return json(500, { message: "Failed to update dish" }, event);
    }
    return json(200, { message: "Dish updated", dishId, imageUrl: finalImageUrl }, event);
  } catch (err) {
    console.error("UPDATE MENU ERROR:", err);
    return json(500, { message: "Server error", error: err.message }, event);
  }
};
