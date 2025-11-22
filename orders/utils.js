const { v4: uuidv4 } = require('uuid');

function response(statusCode, body) {
  return {
    statusCode,
    body: JSON.stringify(body),
  };
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch (e) {
    return {};
  }
}

function generateOrderId() {
  // Usa UUID para IDs únicos
  return `ORD-${uuidv4()}`;
}

function getUserFromEvent(event) {
  // Extrae claims/autorizador (compatibilidad con API Gateway/Lambda authorizer)
  const user = (event.requestContext && event.requestContext.authorizer && event.requestContext.authorizer.claims) || {};
  return user;
}

module.exports = {
  response,
  parseBody,
  generateOrderId,
  getUserFromEvent,
};
