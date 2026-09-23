// Local-only deterministic provider for Connections browser checks.
const http = require('node:http');
const server = http.createServer(async (request, response) => {
  if (request.url.startsWith('/fail/')) { response.writeHead(503).end(); return; }
  if (request.url.startsWith('/deny/')) { response.writeHead(401).end(); return; }
  if (request.url.startsWith('/drop/')) { request.socket.destroy(); return; }
  if (request.headers.authorization !== 'Bearer connection-test-secret') {
    response.writeHead(401).end();
    return;
  }
  if (request.url === '/v1/models') {
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ data: [{ id: 'fixture-model' }] }));
    return;
  }
  let data = '';
  for await (const chunk of request) data += chunk;
  const body = JSON.parse(data || '{}');
  if (body.stream) response.writeHead(200, { 'Content-Type': 'text/event-stream' }).end('data: [DONE]\n\n');
  else response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ id: 'fixture-response', model: body.model, choices: [{ message: { content: 'OK' } }] }));
});
server.listen(4100, '0.0.0.0', () => console.log('fixture provider ready'));
setTimeout(() => server.close(), 300000).unref();
