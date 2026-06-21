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
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-[#0A2238] leading-tight">{t('pages.auth.totp_title')}</h1>
          <p className="text-[13px] text-[#46627A] mt-1.5">
            {useRecovery ? t('pages.auth.totp_desc_recovery') : t('pages.auth.totp_desc_app')}
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 px-4 py-3 bg-white border border-[#DC4B41]/30 rounded-xl">
            <span className="w-1.5 h-1.5 rounded-full bg-[#DC4B41] mt-1.5 shrink-0" />
            <p className="text-[13px] text-[#DC4B41]">{error}</p>
          </div>
        )}

        <div>
          <label htmlFor="totp" className="block text-[12px] font-medium text-[#0A2238] mb-1.5">
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
            className="w-full px-4 py-2.5 bg-white border border-[#E2E8EF] rounded-xl text-[16px] tabular-nums tracking-widest text-[#0A2238] placeholder:text-[#7C9AB4] focus:border-[#0A2238] focus:outline-none transition-colors text-center"
            autoFocus
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-[#0A2238] hover:bg-[#14304b] disabled:bg-[#0A2238]/60 disabled:cursor-not-allowed text-white font-semibold rounded-full text-[14px] transition-colors"
        >
          {loading ? t('pages.auth.totp_submitting') : t('pages.auth.totp_submit')}
        </button>

        <div className="flex items-center justify-between text-[12px]">
          <button
            type="button"
            onClick={() => { setUseRecovery((v) => !v); setTotpCode(''); setError(''); }}
            className="text-[#46627A] hover:text-[#1A759F] transition-colors"
          >
            {useRecovery ? t('pages.auth.totp_use_code') : t('pages.auth.totp_use_recovery')}
          </button>
          <button
            type="button"
            onClick={() => { setStage('credentials'); setTotpCode(''); setError(''); setTotpHandle(''); }}
            className="text-[#46627A] hover:text-[#0A2238] transition-colors"
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
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-[#0A2238] leading-tight">{t('pages.auth.login_welcome_title')}</h1>
        <p className="text-[13px] text-[#46627A] mt-1.5">{t('pages.auth.login_welcome_desc')}</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-white border border-[#DC4B41]/30 rounded-xl">
          <span className="w-1.5 h-1.5 rounded-full bg-[#DC4B41] mt-1.5 shrink-0" />
          <p className="text-[13px] text-[#DC4B41]">{error}</p>
        </div>
      )}

      <div className="space-y-2">
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-[12px] font-medium text-[#0A2238] mb-1.5">{t('pages.auth.login_email_label')}</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder={t('pages.auth.login_email_placeholder')}
            className="w-full px-4 py-2.5 bg-white border border-[#E2E8EF] rounded-xl text-[14px] text-[#0A2238] placeholder:text-[#7C9AB4] focus:border-[#0A2238] focus:outline-none transition-colors"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="password" className="block text-[12px] font-medium text-[#0A2238]">{t('pages.auth.login_password_label')}</label>
            <a href="/auth/forgot-password" className="text-[12px] text-[#46627A] hover:text-[#1A759F] transition-colors">{t('pages.auth.login_forgot_link')}</a>
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
            className="w-full px-4 py-2.5 bg-white border border-[#E2E8EF] rounded-xl text-[14px] text-[#0A2238] placeholder:text-[#7C9AB4] focus:border-[#0A2238] focus:outline-none transition-colors"
          />
        </div>
      </div>

      {TURNSTILE_KEY && (
        <div className="cf-turnstile" data-sitekey={TURNSTILE_KEY} />
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-[#0A2238] hover:bg-[#14304b] disabled:bg-[#0A2238]/60 disabled:cursor-not-allowed text-white font-semibold rounded-full text-[14px] transition-colors"
      >
        {loading ? t('pages.auth.login_submitting') : t('pages.auth.login_submit')}
      </button>

      <p className="text-center text-[13px] text-[#46627A]">
        {t('pages.auth.login_no_account')}{' '}
        <a href="/auth/register" className="text-[#0A2238] font-semibold hover:text-[#1A759F] transition-colors">{t('pages.auth.login_create')}</a>
      </p>
    </form>
  );
}
