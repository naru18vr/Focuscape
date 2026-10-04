// Serve the exact static export at its production base path for browser tests.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve('out');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain', '.ico': 'image/x-icon' };
createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!path.startsWith('/Focuscape/')) { response.writeHead(404).end(); return; }
    const file = resolve(root, path.slice('/Focuscape/'.length) + (path.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(root + sep)) { response.writeHead(404).end(); return; }
    const content = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    response.end(content);
  } catch { response.writeHead(404).end(); }
}).listen(4173, '127.0.0.1');
