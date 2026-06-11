// Structured JSON logger — dependency-free, Vercel-log friendly.
//
// All console.* in serverless gets aggregated by Vercel into log streams
// keyed by function name. To make those greppable + parseable by external
// tools (Datadog/Logtail/Better Stack), we emit single-line JSON instead
// of free-form strings.
//
// Usage:
//   import { log } from '../lib/logger';
//   log.info('order.created', { orderId, userId });
//   log.warn('anaf.fetch_slow', { ms: 4500 });
//   log.error('stripe.webhook_failed', { err: e });
//
// In dev, falls back to a pretty single-line format.

type Level = 'debug' | 'info' | 'warn' | 'error';

const isProd = (typeof process !== 'undefined' && process.env.NODE_ENV === 'production')
  || (typeof process !== 'undefined' && process.env.VERCEL_ENV === 'production');

const region = (typeof process !== 'undefined' && process.env.VERCEL_REGION) || undefined;

function emit(level: Level, event: string, fields: Record<string, unknown> | undefined): void {
  const payload: Record<string, unknown> = {
    level,
    event,
    ts: new Date().toISOString(),
    ...(region ? { region } : {}),
    ...(fields ?? {}),
  };
  // Serialize Error in `err` field with name/message/stack — JSON.stringify
  // by default would drop Error props.
  if (payload.err instanceof Error) {
    const e = payload.err;
    payload.err = { name: e.name, message: e.message, stack: e.stack };
  }
  const line = isProd
    ? JSON.stringify(payload)
    : `[${level.toUpperCase()}] ${event} ${JSON.stringify(fields ?? {})}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, fields?: Record<string, unknown>) => emit('debug', event, fields),
  info:  (event: string, fields?: Record<string, unknown>) => emit('info',  event, fields),
  warn:  (event: string, fields?: Record<string, unknown>) => emit('warn',  event, fields),
  error: (event: string, fields?: Record<string, unknown>) => emit('error', event, fields),
};
