// GET /api/auth/native-exchange?token=... — runs INSIDE the app's WKWebView.
// The native app, after catching the com.facturamea.app://auth?token=... deep
// link from the OAuth flow, navigates here. We verify the short-lived signed
// token and set the real session cookie in the webview context, then land /app.
import type { APIRoute } from 'astro';
import { verifyNativeAuth } from '../../../lib/native-auth';
import { createSession, setSessionCookie } from '../../../lib/auth';

export const GET: APIRoute = async ({ request }) => {
  const token = new URL(request.url).searchParams.get('token') || '';
  const userId = verifyNativeAuth(token);
  if (!userId) {
    return new Response(null, { status: 302, headers: { Location: '/auth/login?error=oauth_failed' } });
  }
  const sessionId = await createSession(userId);
  const headers = new Headers({ Location: '/app' });
  headers.append('Set-Cookie', setSessionCookie(sessionId));
  return new Response(null, { status: 302, headers });
};
