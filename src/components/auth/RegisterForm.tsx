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
