const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8080);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'profiles.json');
const clients = new Set();

fs.mkdirSync(DATA_DIR, { recursive: true });

function readProfiles() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (error) {
    return { profiles: [] };
  }
}

function writeProfiles(payload) {
  const temporaryFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(payload, null, 2));
  fs.renameSync(temporaryFile, DATA_FILE);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function broadcast(payload) {
  const message = `event: profiles\ndata: ${JSON.stringify(payload)}\n\n`;
  clients.forEach((client) => client.write(message));
}

function serveStatic(request, response) {
  const requestedPath = request.url === '/' ? '/index.html' : request.url.split('?')[0];
  const filePath = path.normalize(path.join(ROOT, requestedPath));

  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendJson(response, 404, { error: 'Nie znaleziono pliku.' });
    return;
  }

  const extensions = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
  response.writeHead(200, { 'Content-Type': extensions[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(response);
}

function collectBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) request.destroy(new Error('Payload too large'));
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/api/profiles') {
      sendJson(response, 200, readProfiles());
      return;
    }

    if (request.method === 'PUT' && request.url === '/api/profiles') {
      const payload = JSON.parse(await collectBody(request));
      if (!payload || !Array.isArray(payload.profiles)) {
        sendJson(response, 400, { error: 'Nieprawidłowy format profili.' });
        return;
      }

      writeProfiles(payload);
      broadcast(payload);
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === 'GET' && request.url === '/events') {
      response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      response.write(': connected\n\n');
      clients.add(response);
      request.on('close', () => clients.delete(response));
      return;
    }

    if (request.method === 'GET') {
      serveStatic(request, response);
      return;
    }

    sendJson(response, 405, { error: 'Metoda niedozwolona.' });
  } catch (error) {
    sendJson(response, 400, { error: 'Nie udało się przetworzyć żądania.' });
  }
});

server.listen(PORT, () => {
  console.log(`konkursiki działa na http://localhost:${PORT}`);
});

setInterval(() => {
  clients.forEach((client) => client.write(': keep-alive\n\n'));
}, 25000);

process.on('SIGINT', () => {
  clients.forEach((client) => client.end());
  server.close(() => process.exit(0));
});
