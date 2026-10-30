import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};
const PUBLIC_FILES = new Set(['index.html', 'app.js', 'api.js', 'config.js', 'styles.css']);

createServer((req, res) => {
  const name = req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]).slice(1);
  const file = path.join(root, name);
  if (!PUBLIC_FILES.has(name) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] });
  createReadStream(file).pipe(res);
}).listen(port, () => {
  console.log(`Frontend available at http://localhost:${port}`);
});
