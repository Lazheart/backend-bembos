const { randomBytes } = require("crypto");
const { v4: uuidv4 } = require("uuid");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const s3 = new S3Client({});

const MENU_BUCKET = process.env.MENU_BUCKET || process.env.BUCKET || "menu-bucket";

function generateDishId() {
  return `DISH-${uuidv4()}`;
}

function isValidUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (e) {
    return false;
  }
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function uploadBase64ToS3(base64OrDataUri, tenantId, filename, contentType) {
  // soporta data:[mime];base64,XXXX o raw base64
  let matches = base64OrDataUri.match(/^data:(.+);base64,(.+)$/);
  let b64;
  if (matches) {
    contentType = contentType || matches[1];
    b64 = matches[2];
  } else {
    b64 = base64OrDataUri;
  }

  const buffer = Buffer.from(b64, "base64");
  const ext = (contentType || "image/jpeg").split("/", 2)[1] || "jpg";
  const key = `${tenantId}/menu/${Date.now()}-${randomBytes(6).toString("hex")}-${sanitizeFilename(filename || `image.${ext}`)}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: MENU_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType || `image/${ext}`,
      ACL: "public-read",
    })
  );

  const url = `https://${MENU_BUCKET}.s3.amazonaws.com/${encodeURIComponent(key)}`;
  return url;
}

module.exports = { generateDishId, isValidUrl, sanitizeFilename, uploadBase64ToS3 };
