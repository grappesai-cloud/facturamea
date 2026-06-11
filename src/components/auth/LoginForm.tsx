import { useState, useEffect } from 'react';
import { tFn, type Locale } from '../../lib/i18n';

type Stage = 'credentials' | 'totp';

// Cloudflare Turnstile site key (public). When unset, no widget renders and the
// server-side check fails open — so login behaves exactly as before.
const TURNSTILE_KEY = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY as string | undefined;

export default function LoginForm({ locale = 'ro' }: { locale?: Locale } = {}) {
  const t = tFn(locale);
  const [stage, setStage] = useState<Stage>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpHandle, setTotpHandle] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Load the Turnstile script once, only when a site key is configured.
  useEffect(() => {
    if (!TURNSTILE_KEY) return;
    if (document.querySelector('script[data-turnstile]')) return;
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true; s.defer = true; s.setAttribute('data-turnstile', '');
    document.head.appendChild(s);
  }, []);

  const submitCredentials = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    // Turnstile injects a hidden <input name="cf-turnstile-response"> into the
    // form once solved; read it (empty when the widget isn't configured).
    const turnstileToken = (e.currentTarget.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null)?.value || '';
    // If the widget is configured but hasn't produced a token yet (still
    // solving its challenge), don't send an empty token — it would fail the
    // server-side anti-bot check. Ask the user to wait a moment instead.
    if (TURNSTILE_KEY && !turnstileToken) {
      setError(t('pages.auth.login_antibot_wait'));
      setLoading(false);
      (window as any).turnstile?.reset?.();
      return;
    }
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, turnstileToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t('pages.auth.login_generic_error'));
      } else if (data.requireTotp) {
        setTotpHandle(data.handle);
        setStage('totp');
      } else {
        window.location.href = '/app';
      }
    } catch {
      setError(t('pages.auth.login_network_error'));
    } finally {
      setLoading(false);
      // Turnstile tokens are single-use: siteverify consumes the token on every
      // attempt and rejects a reused one as a duplicate. Reset the widget after
      // each submit so a retry (e.g. after a mistyped password) gets a fresh
      // token instead of failing the anti-bot check.
      if (TURNSTILE_KEY) (window as any).turnstile?.reset?.();
    }
  };

  const submitTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/totp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handle: totpHandle,
          ...(useRecovery ? { recoveryCode: totpCode } : { code: totpCode }),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t('pages.auth.totp_invalid_code'));
      } else {
        window.location.href = '/app';
      }
    } catch {
      setError(t('pages.auth.login_network_error'));
    } finally {
      setLoading(false);
    }
  };

  if (stage === 'totp') {
    return (
      <form onSubmit={submitTotp} className="space-y-6">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-[#0A0A0A] leading-tight">{t('pages.auth.totp_title')}</h1>
          <p className="text-[13px] text-[#6B6B68] mt-1.5">
            {useRecovery ? t('pages.auth.totp_desc_recovery') : t('pages.auth.totp_desc_app')}
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 px-4 py-3 bg-white border border-[#B91C1C]/30 rounded-xl">
            <span className="w-1.5 h-1.5 rounded-full bg-[#B91C1C] mt-1.5 shrink-0" />
            <p className="text-[13px] text-[#B91C1C]">{error}</p>
          </div>
        )}

        <div>
          <label htmlFor="totp" className="block text-[12px] font-medium text-[#0A0A0A] mb-1.5">
            {useRecovery ? t('pages.auth.totp_label_recovery') : t('pages.auth.totp_label_code')}
          </label>
          <input
            id="totp"
            type="text"
            inputMode={useRecovery ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value)}
            required
            maxLength={useRecovery ? 12 : 6}
            placeholder={useRecovery ? t('pages.auth.totp_placeholder_recovery') : t('pages.auth.totp_placeholder_code')}
            className="w-full px-4 py-2.5 bg-white border border-[#E8E8E4] rounded-xl text-[16px] tabular-nums tracking-widest text-[#0A0A0A] placeholder:text-[#A8A8A4] focus:border-[#0A0A0A] focus:outline-none transition-colors text-center"
            autoFocus
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-[#FF5C00] hover:bg-[#E04E00] disabled:bg-[#FF5C00]/60 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-[14px] transition-colors"
        >
          {loading ? t('pages.auth.totp_submitting') : t('pages.auth.totp_submit')}
        </button>

        <div className="flex items-center justify-between text-[12px]">
          <button
            type="button"
            onClick={() => { setUseRecovery((v) => !v); setTotpCode(''); setError(''); }}
            className="text-[#6B6B68] hover:text-[#FF5C00] transition-colors"
          >
            {useRecovery ? t('pages.auth.totp_use_code') : t('pages.auth.totp_use_recovery')}
          </button>
          <button
            type="button"
            onClick={() => { setStage('credentials'); setTotpCode(''); setError(''); setTotpHandle(''); }}
            className="text-[#6B6B68] hover:text-[#0A0A0A] transition-colors"
          >
            {t('pages.auth.totp_cancel')}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submitCredentials} className="space-y-6">
      <div>
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-[#0A0A0A] leading-tight">{t('pages.auth.login_welcome_title')}</h1>
        <p className="text-[13px] text-[#6B6B68] mt-1.5">{t('pages.auth.login_welcome_desc')}</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-white border border-[#B91C1C]/30 rounded-xl">
          <span className="w-1.5 h-1.5 rounded-full bg-[#B91C1C] mt-1.5 shrink-0" />
          <p className="text-[13px] text-[#B91C1C]">{error}</p>
        </div>
      )}

      <div className="space-y-2">
        <a href="/api/auth/google" className="flex items-center justify-center gap-2 w-full py-2.5 bg-white border border-[#E8E8E4] hover:border-[#0A0A0A] rounded-xl text-[14px] font-medium text-[#0A0A0A] transition-colors">
          <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"/></svg>
          Continuă cu Google
        </a>
        <a href="/api/auth/apple" className="flex items-center justify-center gap-2 w-full py-2.5 bg-[#0A0A0A] hover:bg-[#1f1f1f] rounded-xl text-[14px] font-medium text-white transition-colors">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M16.36 12.78c.02 2.45 2.15 3.26 2.17 3.27-.02.06-.34 1.16-1.12 2.3-.67.99-1.37 1.97-2.47 1.99-1.08.02-1.43-.64-2.67-.64-1.24 0-1.62.62-2.64.66-1.06.04-1.87-1.07-2.55-2.05-1.38-2-2.44-5.66-1.02-8.13.7-1.23 1.96-2 3.33-2.03 1.04-.02 2.02.7 2.67.7.64 0 1.84-.86 3.1-.74.53.02 2.01.21 2.96 1.61-.08.05-1.77 1.04-1.75 3.1M14.3 4.6c.57-.69.96-1.65.85-2.6-.83.03-1.83.55-2.42 1.24-.53.61-1 1.59-.87 2.52.92.07 1.87-.47 2.44-1.16"/></svg>
          Continuă cu Apple
        </a>
        <div className="flex items-center gap-3 py-1">
          <div className="flex-1 h-px bg-[#E8E8E4]" />
          <span className="text-[11px] text-[#A8A8A4] uppercase tracking-wider">sau cu email</span>
          <div className="flex-1 h-px bg-[#E8E8E4]" />
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-[12px] font-medium text-[#0A0A0A] mb-1.5">{t('pages.auth.login_email_label')}</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder={t('pages.auth.login_email_placeholder')}
            className="w-full px-4 py-2.5 bg-white border border-[#E8E8E4] rounded-xl text-[14px] text-[#0A0A0A] placeholder:text-[#A8A8A4] focus:border-[#0A0A0A] focus:outline-none transition-colors"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="password" className="block text-[12px] font-medium text-[#0A0A0A]">{t('pages.auth.login_password_label')}</label>
            <a href="/auth/forgot-password" className="text-[12px] text-[#6B6B68] hover:text-[#FF5C00] transition-colors">{t('pages.auth.login_forgot_link')}</a>
          </div>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="current-password"
            placeholder={t('pages.auth.login_password_placeholder')}
            className="w-full px-4 py-2.5 bg-white border border-[#E8E8E4] rounded-xl text-[14px] text-[#0A0A0A] placeholder:text-[#A8A8A4] focus:border-[#0A0A0A] focus:outline-none transition-colors"
          />
        </div>
      </div>

      {TURNSTILE_KEY && (
        <div className="cf-turnstile" data-sitekey={TURNSTILE_KEY} />
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-[#FF5C00] hover:bg-[#E04E00] disabled:bg-[#FF5C00]/60 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-[14px] transition-colors"
      >
        {loading ? t('pages.auth.login_submitting') : t('pages.auth.login_submit')}
      </button>

      <p className="text-center text-[13px] text-[#6B6B68]">
        {t('pages.auth.login_no_account')}{' '}
        <a href="/auth/register" className="text-[#0A0A0A] font-semibold hover:text-[#FF5C00] transition-colors">{t('pages.auth.login_create')}</a>
      </p>
    </form>
  );
}
