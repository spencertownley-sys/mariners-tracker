import 'dotenv/config';
import * as Sentry from '@sentry/node';
import { loadConfig } from './config';
import { db } from './db';
import { startHealthServer } from './health';
import { log } from './logger';
import { Scheduler } from './scheduler';

const config = loadConfig();

if (config.SENTRY_DSN) {
  Sentry.init({ dsn: config.SENTRY_DSN, environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.NODE_ENV, tracesSampleRate: 0.05 });
}

const scheduler = new Scheduler(db(config), config);
const server = startHealthServer(config.PORT, scheduler);
scheduler.start();
log.info('worker started', { appUrl: config.APP_URL });

function shutdown(signal: string) {
  log.info('shutting down', { signal });
  scheduler.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  log.error('unhandled rejection', { reason: String(reason) });
  Sentry.captureException(reason);
});
