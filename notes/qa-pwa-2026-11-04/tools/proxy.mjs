import http from 'node:http';
import { readFileSync, appendFileSync } from 'node:fs';
const control = new URL('./upstream-port.txt', import.meta.url);
const fault = new URL('./fault-prefix.txt', import.meta.url);
const server = http.createServer((req, res) => {
  const port = Number(readFileSync(control, 'utf8').trim());
  const prefix = readFileSync(fault, 'utf8').trim();
  if (req.url === '/sw.js' || req.url === '/offline') process.stdout.write(`${port} ${req.url} ${req.headers['service-worker'] ?? ''}\n`);
  if (prefix && req.url.startsWith(prefix)) { appendFileSync(new URL('./fault-hits.txt', import.meta.url), req.url + '\n'); res.writeHead(503, { 'Cache-Control': 'no-store' }); res.end('Intentional QA asset failure'); return; }
  if (![3012, 3013, 3014].includes(port)) { res.writeHead(503); res.end(); return; }
  const upstream = http.request({ hostname: '127.0.0.1', port, path: req.url, method: req.method, headers: req.headers }, response => {
    res.writeHead(response.statusCode, { ...response.headers, 'x-qa-backend-port': String(port) });
    response.pipe(res);
  });
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(503); res.end('QA backend unavailable'); });
  req.on('aborted', () => upstream.destroy());
  res.on('close', () => upstream.destroy());
  req.pipe(upstream);
});
server.listen(3011, '127.0.0.1', () => process.stdout.write('QA proxy listening on 3011\n'));
