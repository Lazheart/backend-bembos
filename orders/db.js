const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { S3Client } = require("@aws-sdk/client-s3");

const REGION = process.env.AWS_REGION || "us-east-1";
const TABLE_NAME = process.env.ORDERS_TABLE || "OrdersTable";
const BUCKET_NAME = process.env.ORDERS_BUCKET || "restaurant-orders-dashboard";

const dynamo = new DynamoDBClient({ region: REGION });
const s3 = new S3Client({ region: REGION });

module.exports = {
  dynamo,
  s3,
  TABLE_NAME,
  BUCKET_NAME,
};
