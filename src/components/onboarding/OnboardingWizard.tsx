import { useState } from 'react';
import { Loader2, Check } from 'lucide-react';

interface Props {
  initial: { cui: string; name: string; address: string; country: string };
  companyComplete: boolean;
  isPaid: boolean;
}

const inputCls = 'w-full rounded-xl bg-white/10 px-4 py-3 text-[15px] text-white placeholder:text-[#8FA8BE] border border-white/10 focus:outline-none focus:ring-2 focus:ring-[#E1FB15]/60';
const labelCls = 'block text-[13px] font-medium text-[#C8DAE8] mb-1.5';

export default function OnboardingWizard({ initial, companyComplete, isPaid }: Props) {
  const [step, setStep] = useState<'company' | 'payment'>(companyComplete ? 'payment' : 'company');

  // company step
  const [cui, setCui] = useState(initial.cui || '');
  const [name, setName] = useState(initial.name || '');
  const [address, setAddress] = useState(initial.address || '');
  const [regCom, setRegCom] = useState('');
  const [phone, setPhone] = useState('');
  const [isVatPayer, setIsVatPayer] = useState<boolean | null>(null);
  const [cuiHint, setCuiHint] = useState('');
  const [cuiState, setCuiState] = useState<'idle' | 'loading' | 'found' | 'notfound'>('idle');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);

  const lookupCui = async () => {
    const cleaned = cui.replace(/^RO/i, '').replace(/\D/g, '');
    if (cleaned.length < 2) return;
    setCuiState('loading'); setCuiHint('Preiau datele de la ANAF…');
    try {
      const res = await fetch(`/api/anaf/lookup?cui=${encodeURIComponent(cleaned)}`);
      const data = await res.json();
      if (!data || data.ok === false || !data.name) { setCuiState('notfound'); setCuiHint('CUI negăsit la ANAF. Verifică numărul.'); return; }
      setName(data.name || '');
      setAddress(data.address || '');
      setRegCom(data.tradeRegisterNumber || '');
      setPhone(data.phone || '');
      setIsVatPayer(typeof data.isVatPayer === 'boolean' ? data.isVatPayer : null);
      setCuiState('found');
      setCuiHint(`Găsit: ${data.name}`);
    } catch {
      setCuiState('notfound'); setCuiHint('Eroare la ANAF. Reîncearcă în câteva secunde.');
    }
  };

  const saveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!cui.trim()) { setError('Introdu CIF-ul.'); return; }
    if (!name.trim() || !address.trim()) { setError('Apasă în afara câmpului CIF ca să preluăm datele de la ANAF.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/onboarding/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cui: cui.trim(), name: name.trim(), address: address.trim(), regCom: regCom.trim(), phone: phone.trim(), isVatPayer, country: initial.country || 'Romania' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Nu am putut salva.'); return; }
      setStep('payment');
    } catch {
      setError('Eroare de rețea.');
    } finally {
      setSaving(false);
    }
  };

  const startCheckout = async () => {
    setError(''); setPaying(true);
    try {
      const res = await fetch('/api/checkout/lifetime', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json().catch(() => ({}));
      if (data.url) { window.location.href = data.url; return; }
      setError(data.error || 'Nu am putut porni plata.');
    } catch {
      setError('Eroare de rețea.');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="w-full">
      {/* progress */}
      <div className="flex items-center gap-2 mb-7">
        <div className={`flex items-center gap-2 text-[13px] font-semibold ${step === 'company' ? 'text-[#E1FB15]' : 'text-[#6EE7B7]'}`}>
          <span className={`w-6 h-6 rounded-full grid place-items-center text-[12px] ${step === 'company' ? 'bg-[#E1FB15] text-[#07090f]' : 'bg-[#2E9E6A] text-white'}`}>{step === 'company' ? '1' : <Check className="w-3.5 h-3.5" />}</span>
          Date firmă
        </div>
        <div className="flex-1 h-[2px] bg-white/15" />
        <div className={`flex items-center gap-2 text-[13px] font-semibold ${step === 'payment' ? 'text-[#E1FB15]' : 'text-[#8FA8BE]'}`}>
          <span className={`w-6 h-6 rounded-full grid place-items-center text-[12px] ${step === 'payment' ? 'bg-[#E1FB15] text-[#07090f]' : 'bg-white/10 text-[#8FA8BE]'}`}>2</span>
          Activare
        </div>
      </div>

      {error && <div className="mb-4 px-4 py-3 bg-[#DC4B41]/20 ring-1 ring-[#DC4B41]/30 rounded-xl text-[13px] text-[#FFB3AC]">{error}</div>}

      {step === 'company' ? (
        <form onSubmit={saveCompany} className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-white tracking-[-0.01em]">Completează datele firmei</h2>
            <p className="text-[13px] text-[#C8DAE8] mt-1">Introdu doar CIF-ul, restul îl preluăm automat de la ANAF.</p>
          </div>
          <div>
            <label className={labelCls}>CUI / CIF <span className="text-[#E1FB15]">*</span></label>
            <input value={cui} onChange={(e) => setCui(e.target.value)} onBlur={lookupCui} required autoFocus className={inputCls} placeholder="ex. RO12345678" />
            {cuiHint && <p className={`text-[12px] mt-1.5 ${cuiState === 'found' ? 'text-[#6EE7B7]' : cuiState === 'loading' ? 'text-[#C8DAE8]' : 'text-[#FFD27A]'}`}>{cuiHint}</p>}
          </div>

          {cuiState === 'found' && (
            <div className="rounded-2xl bg-white/[0.06] ring-1 ring-white/10 p-4 space-y-3">
              <div>
                <label className={labelCls}>Denumire firmă</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Adresă (sediu social)</label>
                <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
              </div>
              <div className="flex flex-wrap gap-2 pt-0.5">
                {regCom && <span className="px-2.5 py-1 rounded-full bg-white/10 text-[12px] text-[#C8DAE8]">Reg. com.: {regCom}</span>}
                {isVatPayer !== null && <span className={`px-2.5 py-1 rounded-full text-[12px] ${isVatPayer ? 'bg-[#2E9E6A]/25 text-[#6EE7B7]' : 'bg-white/10 text-[#C8DAE8]'}`}>{isVatPayer ? 'Plătitor de TVA' : 'Neplătitor de TVA'}</span>}
              </div>
            </div>
          )}

          <button type="submit" disabled={saving || cuiState !== 'found'} className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-full bg-[#E1FB15] text-[#07090f] hover:bg-[#D2EA0E] disabled:opacity-50 disabled:cursor-not-allowed font-bold text-[15px] transition-colors">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Continuă spre activare
          </button>
          {cuiState !== 'found' && <p className="text-[12px] text-[#8FA8BE] text-center">Introdu CIF-ul și ieși din câmp ca să preluăm datele.</p>}
        </form>
      ) : (
        <div className="space-y-5">
          <div>
            <h2 className="text-xl font-bold text-white tracking-[-0.01em]">Activează acces pe viață</h2>
            <p className="text-[13px] text-[#C8DAE8] mt-1">Datele firmei sunt salvate. Mai e un pas: activează contul printr-o singură plată.</p>
          </div>
          <div className="rounded-2xl bg-[#081B2E] ring-1 ring-white/10 p-6">
            <div className="inline-block px-3 py-1 rounded-full bg-[#E1FB15] text-[#07090f] text-[11px] font-bold uppercase tracking-wide">Licență pe viață</div>
            <div className="flex items-baseline gap-2 mt-3 mb-1">
              <span className="text-4xl font-extrabold text-white tracking-[-0.03em]">800</span>
              <span className="text-xl font-bold text-[#A8BED2]">RON</span>
            </div>
            <p className="text-[13px] text-[#A8BED2] mb-4">o singură plată, pentru totdeauna · fără abonament</p>
            <ul className="space-y-2 text-[14px] text-[#EAF2F8] mb-5">
              {['Facturi, proforme, avize, chitanțe', 'e-Factura ANAF + e-Transport', 'Gestiune, cheltuieli, rapoarte, POS', 'Web, iOS și Android'].map((f) => (
                <li key={f} className="flex items-start gap-2.5"><span className="shrink-0 w-5 h-5 rounded-full bg-[#E1FB15] text-[#07090f] grid place-items-center text-[11px] font-bold mt-0.5">✓</span> {f}</li>
              ))}
            </ul>
            {isPaid ? (
              <a href="/app" className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-full bg-[#E1FB15] text-[#07090f] hover:bg-[#D2EA0E] font-bold text-[15px] transition-colors">
                Intră în aplicație
              </a>
            ) : (
              <button onClick={startCheckout} disabled={paying} className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-full bg-[#E1FB15] text-[#07090f] hover:bg-[#D2EA0E] disabled:opacity-60 font-bold text-[15px] transition-colors">
                {paying && <Loader2 className="w-4 h-4 animate-spin" />} Cumpără acces pe viață
              </button>
            )}
          </div>
          <p className="text-[12px] text-[#8FA8BE] leading-relaxed">
            Semnătura digitală (conectarea la ANAF / SPV pentru e-Factura) se activează separat din Setări, după aprobarea ANAF. Nu este necesară pentru a începe.
          </p>
          <a href="/app" className="block text-center text-[13px] text-[#8FA8BE] hover:text-white transition-colors">
            Mergi la aplicație
          </a>
        </div>
      )}
    </div>
  );
}
