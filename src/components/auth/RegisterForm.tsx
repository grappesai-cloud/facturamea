import { useState } from 'react';
import type { Locale } from '../../lib/i18n';

const inputCls = 'w-full px-4 py-2.5 bg-white border border-[#E2E8EF] rounded-xl text-[14px] text-[#0A2238] placeholder:text-[#7C9AB4] focus:border-[#0A2238] focus:outline-none transition-colors';
const labelCls = 'block text-[12px] font-medium text-[#0A2238] mb-1.5';

export default function RegisterForm({ locale = 'ro' }: { locale?: Locale } = {}) {
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const [companyName, setCompanyName] = useState('');
  const [cui, setCui] = useState('');
  const [cuiState, setCuiState] = useState<'idle' | 'loading' | 'found' | 'notfound'>('idle');
  const [cuiHint, setCuiHint] = useState('');
  const [country, setCountry] = useState('Romania');
  const [city, setCity] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  // ANAF public lookup on CUI blur — auto-fill firm name, city.
  const lookupCui = async () => {
    const cleaned = cui.replace(/^RO/i, '').replace(/\D/g, '');
    if (!cleaned || cleaned.length < 2 || cleaned.length > 10) return;
    setCuiState('loading');
    setCuiHint('Caut la ANAF…');
    try {
      const res = await fetch(`/api/anaf/lookup?cui=${encodeURIComponent(cleaned)}`);
      const data = await res.json();
      if (!res.ok || data.ok === false || !data.name) {
        setCuiState('notfound');
        setCuiHint('CUI negăsit la ANAF. Poți continua manual.');
        return;
      }
      if (data.name && !companyName) setCompanyName(data.name);
      setCuiState('found');
      const tags: string[] = [];
      if (data.isVatPayer) tags.push('plătitor TVA');
      if (data.isInactive) tags.push('INACTIV fiscal');
      setCuiHint(`Găsit: ${data.name}${tags.length ? ` (${tags.join(', ')})` : ''}`);
    } catch {
      setCuiState('notfound');
      setCuiHint('Eroare la verificarea CUI. Poți continua manual.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) {
      if (!companyName.trim()) { setError('Numele firmei este obligatoriu.'); return; }
      setError(''); setStep(2); return;
    }
    if (password !== confirmPassword) { setError('Parolele nu coincid.'); return; }
    if (password.length < 8) { setError('Parola trebuie să aibă minim 8 caractere.'); return; }
    if (!termsAccepted) { setError('Trebuie să accepți Termenii și Condițiile și Politica de Confidențialitate.'); return; }

    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email, password,
          userType: 'intermediar', // facturamea: every account is a business owner
          phone, companyName, cui, country, city, companyPhone,
          termsAccepted: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'A apărut o eroare. Încearcă din nou.');
      else setDone(true);
    } catch {
      setError('Eroare de rețea. Verifică conexiunea.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-[#0A2238] leading-tight">Verifică-ți emailul</h1>
          <p className="text-[13px] text-[#46627A] mt-1.5">
            Ți-am trimis un link de confirmare la <span className="font-semibold text-[#0A2238]">{email}</span>.
            Apasă pe el ca să-ți activezi contul, apoi autentifică-te.
          </p>
        </div>
        <a href="/auth/login" className="block w-full text-center py-3 bg-[#0A2238] hover:bg-[#14304b] text-white font-semibold rounded-xl text-[14px] transition-colors">
          Mergi la autentificare
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-[#0A2238] leading-tight">Creează cont</h1>
        <p className="text-[13px] text-[#46627A] mt-1.5">Pasul {step} din 2 · facturează în câteva minute</p>
      </div>

      {/* OAuth */}
      {step === 1 && (
        <div className="space-y-2">
          <a href="/api/auth/google" className="flex items-center justify-center gap-2 w-full py-2.5 bg-white border border-[#E2E8EF] hover:border-[#0A2238] rounded-xl text-[14px] font-medium text-[#0A2238] transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"/></svg>
            Continuă cu Google
          </a>
          <a href="/api/auth/apple" className="flex items-center justify-center gap-2 w-full py-2.5 bg-[#0A2238] hover:bg-[#14304b] rounded-xl text-[14px] font-medium text-white transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M16.36 12.78c.02 2.45 2.15 3.26 2.17 3.27-.02.06-.34 1.16-1.12 2.3-.67.99-1.37 1.97-2.47 1.99-1.08.02-1.43-.64-2.67-.64-1.24 0-1.62.62-2.64.66-1.06.04-1.87-1.07-2.55-2.05-1.38-2-2.44-5.66-1.02-8.13.7-1.23 1.96-2 3.33-2.03 1.04-.02 2.02.7 2.67.7.64 0 1.84-.86 3.1-.74.53.02 2.01.21 2.96 1.61-.08.05-1.77 1.04-1.75 3.1M14.3 4.6c.57-.69.96-1.65.85-2.6-.83.03-1.83.55-2.42 1.24-.53.61-1 1.59-.87 2.52.92.07 1.87-.47 2.44-1.16"/></svg>
            Continuă cu Apple
          </a>
          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-[#E2E8EF]" />
            <span className="text-[11px] text-[#7C9AB4] uppercase tracking-wider">sau cu email</span>
            <div className="flex-1 h-px bg-[#E2E8EF]" />
          </div>
        </div>
      )}

      <div className="flex gap-1.5">
        {[1, 2].map((s) => (
          <div key={s} className={`h-[3px] flex-1 rounded-full transition-all duration-300 ${s <= step ? 'bg-[#0A2238]' : 'bg-[#E2E8EF]'}`} />
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-white border border-[#DC4B41]/30 rounded-xl">
          <span className="w-1.5 h-1.5 rounded-full bg-[#DC4B41] mt-1.5 shrink-0" />
          <p className="text-[13px] text-[#DC4B41]">{error}</p>
        </div>
      )}

      {/* Step 1: Company */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-[12px] uppercase tracking-[0.16em] text-[#46627A] font-medium">Firma ta</p>
          <div>
            <label className={labelCls}>CUI / CIF <span className="text-[#46627A]">(preia datele de la ANAF)</span></label>
            <input value={cui} onChange={(e) => setCui(e.target.value)} onBlur={lookupCui} className={inputCls} placeholder="ex. RO12345678" />
            {cuiHint && (
              <p className={`text-[11px] mt-1.5 ${cuiState === 'found' ? 'text-[#2E9E6A]' : cuiState === 'loading' ? 'text-[#46627A]' : 'text-[#8A5A12]'}`}>{cuiHint}</p>
            )}
          </div>
          <div>
            <label className={labelCls}>Denumire firmă <span className="text-[#1A759F]">*</span></label>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required className={inputCls} placeholder="SC Exemplu SRL" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Țară</label>
              <input value={country} onChange={(e) => setCountry(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Oraș</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} placeholder="București" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Telefon firmă</label>
            <input type="tel" value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} className={inputCls} placeholder="07xx xxx xxx" />
          </div>
        </div>
      )}

      {/* Step 2: Account */}
      {step === 2 && (
        <div className="space-y-4">
          <p className="text-[12px] uppercase tracking-[0.16em] text-[#46627A] font-medium">Contul tău</p>
          <div>
            <label className={labelCls}>Nume complet <span className="text-[#1A759F]">*</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)} required className={inputCls} placeholder="Ion Popescu" />
          </div>
          <div>
            <label className={labelCls}>Email <span className="text-[#1A759F]">*</span></label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className={inputCls} placeholder="nume@firma.ro" />
          </div>
          <div>
            <label className={labelCls}>Telefon</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="07xx xxx xxx" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Parolă <span className="text-[#1A759F]">*</span></label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" className={inputCls} placeholder="min. 8 caractere" />
            </div>
            <div>
              <label className={labelCls}>Confirmă parola <span className="text-[#1A759F]">*</span></label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} autoComplete="new-password" className={inputCls} placeholder="repetă parola" />
            </div>
          </div>
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              required
              className="mt-0.5 w-4 h-4 shrink-0 accent-[#0A2238] cursor-pointer"
            />
            <span className="text-[12px] text-[#46627A] leading-relaxed">
              Am citit și sunt de acord cu <a href="/termeni" target="_blank" rel="noopener" className="text-[#0A2238] font-semibold underline hover:text-[#1A759F]">Termenii și Condițiile</a> și cu <a href="/confidentialitate" target="_blank" rel="noopener" className="text-[#0A2238] font-semibold underline hover:text-[#1A759F]">Politica de Confidențialitate</a>. <span className="text-[#1A759F]">*</span>
            </span>
          </label>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        {step > 1 && (
          <button type="button" onClick={() => { setError(''); setStep(step - 1); }} className="px-5 py-3 bg-white border border-[#E2E8EF] hover:border-[#0A2238] text-[#0A2238] font-medium rounded-xl text-[14px] transition-colors">
            Înapoi
          </button>
        )}
        <button type="submit" disabled={loading} className="flex-1 py-3 bg-[#0A2238] hover:bg-[#14304b] disabled:bg-[#0A2238]/60 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-[14px] transition-colors">
          {step < 2 ? 'Continuă' : (loading ? 'Se creează…' : 'Creează cont')}
        </button>
      </div>

      <p className="text-center text-[13px] text-[#46627A]">
        Ai deja cont?{' '}
        <a href="/auth/login" className="text-[#0A2238] font-semibold hover:text-[#1A759F] transition-colors">Autentifică-te</a>
      </p>
    </form>
  );
}
