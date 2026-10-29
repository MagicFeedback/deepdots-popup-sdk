// Servidor de la test app (sin dependencias).
//
//   /dist/*, /package.json   → la build local del SDK (raíz del repo), para ?sdk=local
//   /release/*               → manifiesto y fixtures de compatibilidad (MF-3241)
//   /app/*, /sw.js            → la app (apps/test-app)
//   cualquier otra ruta       → index.html (SPA: /checkout, /products/42… se sirven igual)
//
// Uso: node apps/test-app/server.mjs [puerto]   (por defecto 5180)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(APP_DIR, '..', '..');
const PORT = Number(process.argv[2] || process.env.PORT || 5180);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function resolveFile(urlPath) {
  const rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  if (rel.startsWith('/dist/') || rel.startsWith('/release/') || rel === '/package.json') return join(REPO_ROOT, rel);
  if (rel.startsWith('/app/') || rel === '/sw.js') return join(APP_DIR, rel);
  return null;
}

const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = resolveFile(urlPath);
  try {
    const target = file ?? join(APP_DIR, 'index.html');
    const data = await readFile(target);
    const headers = {
      'Content-Type': TYPES[extname(target)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    };
    // El service worker controla toda la app aunque viva en /sw.js.
    if (urlPath === '/sw.js') headers['Service-Worker-Allowed'] = '/';
    res.writeHead(200, headers);
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`SDK test app on http://localhost:${PORT}`);
});
