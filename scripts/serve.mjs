import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const port = Number(process.env.PORT || 4173);
const mime = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml',
  '.webmanifest':'application/manifest+json', '.png':'image/png',
};
const server = createServer(async (request, response) => {
  if (!['GET','HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow:'GET, HEAD' }).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + sep)) {
      response.writeHead(403).end('Forbidden'); return;
    }
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    const body = await readFile(file);
    response.writeHead(200, {
      'Content-Type':mime[extname(file)] || 'application/octet-stream',
      'Cache-Control':'no-cache',
      'X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404, { 'Content-Type':'text/plain' }).end('Not found');
  }
});
server.listen(port, '127.0.0.1', () => {
  console.log('Focus Break is ready at http://127.0.0.1:' + port);
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
