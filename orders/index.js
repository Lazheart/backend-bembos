const { handleCreate } = require('./create');
const { handleList } = require('./list');
const { handleGet } = require('./get');
const { handleCancel } = require('./cancel');
const { getUserFromEvent, response } = require('./utils');

async function handler(event) {
  const method = event.httpMethod;
  const path = event.path || '';
  const user = getUserFromEvent(event);

  try {
    if (method === 'POST' && path === '/orders') {
      return await handleCreate(event, user);
    }

    if (method === 'GET' && path === '/orders') {
      return await handleList(event, user);
    }

    if (method === 'GET' && /^\/orders\/[^/]+$/.test(path)) {
      return await handleGet(event, user);
    }

    if (method === 'DELETE' && /^\/orders\/[^/]+$/.test(path)) {
      return await handleCancel(event, user);
    }

    return response(404, { message: 'Route not found' });
  } catch (err) {
    console.error('Orders handler error:', err);
    return response(500, { error: err.message });
  }
}

module.exports = { handler };
