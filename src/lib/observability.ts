// Lightweight Sentry-compatible error reporting that no-ops when SENTRY_DSN
// is not configured. To switch to the real Sentry SDK later, install
// @sentry/node and replace the captureError() body with Sentry.captureException().

const dsn = (import.meta as any).env?.SENTRY_DSN || (typeof process !== 'undefined' ? process.env?.SENTRY_DSN : undefined);
const env = (import.meta as any).env?.PUBLIC_VERCEL_ENV || (typeof process !== 'undefined' ? process.env?.VERCEL_ENV : undefined) || 'development';

export const sentryEnabled = !!dsn;

interface ErrorContext {
  userId?: string | null;
  companyId?: string | null;
  route?: string;
  method?: string;
  extra?: Record<string, unknown>;
}

// Best-effort POST to Sentry HTTP envelope endpoint when DSN is set.
// Never throws — observability must not crash the request handler.
export async function captureError(err: unknown, ctx: ErrorContext = {}): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  // Structured local log (JSON in prod, pretty in dev).
  const { log } = await import('./logger');
  log.error('exception', { env, ...ctx, err: err instanceof Error ? err : new Error(message) });

  if (!dsn) return;

  try {
    // Parse DSN: https://<key>@oXXXXX.ingest.sentry.io/<project>
    const m = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(\d+)/);
    if (!m) return;
    const [, publicKey, host, projectId] = m;
    const timestamp = new Date().toISOString();
    const eventId = crypto.randomUUID().replace(/-/g, '');
    const envelopeHeader = JSON.stringify({ event_id: eventId, sent_at: timestamp, dsn });
    const itemHeader = JSON.stringify({ type: 'event' });
    const itemPayload = JSON.stringify({
      event_id: eventId,
      timestamp,
      level: 'error',
      logger: 'transport-hub',
      environment: env,
      message,
      exception: stack ? { values: [{ type: err instanceof Error ? err.name : 'Error', value: message, stacktrace: { frames: [] } }] } : undefined,
      contexts: { runtime: { name: 'node' } },
      tags: { route: ctx.route, method: ctx.method },
      user: ctx.userId ? { id: ctx.userId } : undefined,
      extra: { companyId: ctx.companyId, stack, ...ctx.extra },
    });
    const body = `${envelopeHeader}\n${itemHeader}\n${itemPayload}\n`;
    await fetch(`https://${host}/api/${projectId}/envelope/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=transport-hub/1.0`,
      },
      body,
      // Vercel functions support waitUntil-style fire-and-forget; here we
      // just await but with a short timeout so we don't block the response.
      signal: AbortSignal.timeout(2000),
    }).catch(() => undefined);
  } catch {
    // swallow — observability never blocks
  }
}

// Wrapper for API route handlers that captures uncaught errors.
export function withErrorReporting<T extends (...args: any[]) => Promise<Response>>(
  handler: T,
  routeName: string,
): T {
  return (async (...args: any[]) => {
    const ctx = args[0] ?? {};
    try {
      return await handler(...args);
    } catch (err) {
      await captureError(err, {
        userId: ctx?.locals?.user?.id ?? null,
        companyId: ctx?.locals?.user?.companyId ?? null,
        route: routeName,
        method: ctx?.request?.method,
      });
      return new Response(JSON.stringify({ error: 'Eroare internă. Echipa a fost notificată.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }) as T;
}
