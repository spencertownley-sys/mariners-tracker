import http from 'node:http';
import type { Scheduler } from './scheduler';
import { log } from './logger';

/**
 * Tiny HTTP endpoint for Railway health checks / uptime monitoring (Launch Checklist: Monitoring).
 * GET /health → 200 when every enabled poller has succeeded recently, 503 otherwise.
 */
export function startHealthServer(port: number, scheduler: Scheduler): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/healthz') {
      const status = scheduler.status();
      res.writeHead(status.ok ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('AllClear worker\n');
  });
  server.listen(port, () => log.info('health server listening', { port }));
  return server;
}
