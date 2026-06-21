import { useState } from 'react';
import { Loader2, Check } from 'lucide-react';

interface Props {
  initial: { cui: string; name: string; address: string; city: string; country: string; phone: string };
  companyComplete: boolean;
  isPaid: boolean;
}

const inputCls = 'w-full rounded-xl bg-white/5 px-4 py-3 text-[15px] text-white placeholder:text-[#7C9AB4] border-0 focus:outline-none focus:ring-2 focus:ring-[#E1FB15]/40';
const labelCls = 'block text-[13px] font-medium text-[#9FB8CC] mb-1.5';

export default function OnboardingWizard({ initial, companyComplete, isPaid }: Props) {
  const [step, setStep] = useState<'company' | 'payment'>(companyComplete ? 'payment' : 'company');

  // company step
  const [cui, setCui] = useState(initial.cui || '');
  const [name, setName] = useState(initial.name || '');
  const [address, setAddress] = useState(initial.address || '');
  const [city, setCity] = useState(initial.city || '');
  const [country, setCountry] = useState(initial.country || 'Romania');
  const [phone, setPhone] = useState(initial.phone || '');
  const [cuiHint, setCuiHint] = useState('');
  const [cuiState, setCuiState] = useState<'idle' | 'loading' | 'found' | 'notfound'>('idle');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // payment step
  const [paying, setPaying] = useState(false);

  const lookupCui = async () => {
    const cleaned = cui.replace(/^RO/i, '').replace(/\D/g, '');
    if (cleaned.length < 2) return;
    setCuiState('loading'); setCuiHint('Caut la ANAF…');
    try {
      const res = await fetch(`/api/anaf/lookup?cui=${encodeURIComponent(cleaned)}`);
      const data = await res.json();
      if (!data || !data.name) { setCuiState('notfound'); setCuiHint('CUI negăsit la ANAF. Poți completa manual.'); return; }
      if (data.name && !name) setName(data.name);
      if (data.address && !address) setAddress(data.address);
      if (data.city && !city) setCity(data.city);
      setCuiState('found');
      setCuiHint(`Găsit: ${data.name}`);
    } catch {
      setCuiState('notfound'); setCuiHint('Eroare la verificarea CUI. Poți completa manual.');
    }
  };

  const saveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!cui.trim()) { setError('CIF-ul este obligatoriu.'); return; }
    if (!name.trim()) { setError('Denumirea firmei este obligatorie.'); return; }
    if (!address.trim()) { setError('Adresa este obligatorie.'); return; }
    if (!city.trim()) { setError('Orașul este obligatoriu.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/onboarding/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cui: cui.trim(), name: name.trim(), address: address.trim(), city: city.trim(), country: country.trim(), phone: phone.trim() }),
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
    <div className="w-full max-w-lg">
      {/* progress */}
      <div className="flex items-center gap-2 mb-7">
        <div className={`flex items-center gap-2 text-[13px] font-semibold ${step === 'company' ? 'text-[#E1FB15]' : 'text-[#2E9E6A]'}`}>
          <span className={`w-6 h-6 rounded-full grid place-items-center text-[12px] ${step === 'company' ? 'bg-[#E1FB15] text-[#0A2238]' : 'bg-[#2E9E6A] text-white'}`}>{step === 'company' ? '1' : <Check className="w-3.5 h-3.5" />}</span>
          Date firmă
        </div>
        <div className="flex-1 h-[2px] bg-white/10" />
        <div className={`flex items-center gap-2 text-[13px] font-semibold ${step === 'payment' ? 'text-[#E1FB15]' : 'text-[#7C9AB4]'}`}>
          <span className={`w-6 h-6 rounded-full grid place-items-center text-[12px] ${step === 'payment' ? 'bg-[#E1FB15] text-[#0A2238]' : 'bg-white/10 text-[#7C9AB4]'}`}>2</span>
          Activare
        </div>
      </div>

      {error && <div className="mb-4 px-4 py-3 bg-[#DC4B41]/15 rounded-xl text-[13px] text-[#FF8A80]">{error}</div>}

      {step === 'company' ? (
        <form onSubmit={saveCompany} className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-white tracking-[-0.01em]">Completează datele firmei</h2>
            <p className="text-[13px] text-[#9FB8CC] mt-1">Avem nevoie de datele fiscale ca să poți emite facturi corecte. Introdu CIF-ul, restul îl preluăm de la ANAF.</p>
          </div>
          <div>
            <label className={labelCls}>CUI / CIF <span className="text-[#E1FB15]">*</span> <span className="text-[#7C9AB4] font-normal">(preia datele de la ANAF)</span></label>
            <input value={cui} onChange={(e) => setCui(e.target.value)} onBlur={lookupCui} required className={inputCls} placeholder="ex. RO12345678" />
            {cuiHint && <p className={`text-[12px] mt-1.5 ${cuiState === 'found' ? 'text-[#2E9E6A]' : cuiState === 'loading' ? 'text-[#9FB8CC]' : 'text-[#E8A33C]'}`}>{cuiHint}</p>}
          </div>
          <div>
            <label className={labelCls}>Denumire firmă <span className="text-[#E1FB15]">*</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)} required className={inputCls} placeholder="SC Exemplu SRL" />
          </div>
          <div>
            <label className={labelCls}>Adresă <span className="text-[#E1FB15]">*</span></label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} required className={inputCls} placeholder="Str. Exemplu nr. 1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Oraș <span className="text-[#E1FB15]">*</span></label>
              <input value={city} onChange={(e) => setCity(e.target.value)} required className={inputCls} placeholder="București" />
            </div>
            <div>
              <label className={labelCls}>Țară</label>
              <input value={country} onChange={(e) => setCountry(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Telefon firmă</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="07xx xxx xxx" />
          </div>
          <button type="submit" disabled={saving} className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-full bg-[#E1FB15] text-[#0A2238] hover:bg-[#D2EA0E] disabled:opacity-60 font-bold text-[15px] transition-colors">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Continuă spre activare
          </button>
        </form>
      ) : (
        <div className="space-y-5">
          <div>
            <h2 className="text-xl font-bold text-white tracking-[-0.01em]">Activează acces pe viață</h2>
            <p className="text-[13px] text-[#9FB8CC] mt-1">Datele firmei sunt salvate. Mai e un pas: activează contul printr-o singură plată.</p>
          </div>
          <div className="rounded-2xl bg-[#0A2238] ring-1 ring-white/10 p-6">
            <div className="inline-block px-3 py-1 rounded-full bg-[#E1FB15] text-[#0A2238] text-[11px] font-bold uppercase tracking-wide">Licență pe viață</div>
            <div className="flex items-baseline gap-2 mt-3 mb-1">
              <span className="text-4xl font-extrabold text-white tracking-[-0.03em]">700</span>
              <span className="text-xl font-bold text-[#9FB8CC]">RON</span>
            </div>
            <p className="text-[13px] text-[#9FB8CC] mb-4">o singură plată, pentru totdeauna · fără abonament</p>
            <ul className="space-y-2 text-[14px] text-[#EAF2F8] mb-5">
              {['Facturi, proforme, avize, chitanțe', 'e-Factura ANAF + e-Transport', 'Gestiune, cheltuieli, rapoarte, POS', 'Web, iOS și Android'].map((f) => (
                <li key={f} className="flex items-start gap-2.5"><span className="shrink-0 w-5 h-5 rounded-full bg-[#E1FB15] text-[#0A2238] grid place-items-center text-[11px] font-bold mt-0.5">✓</span> {f}</li>
              ))}
            </ul>
            <button onClick={startCheckout} disabled={paying} className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-full bg-[#E1FB15] text-[#0A2238] hover:bg-[#D2EA0E] disabled:opacity-60 font-bold text-[15px] transition-colors">
              {paying && <Loader2 className="w-4 h-4 animate-spin" />} Cumpără acces pe viață
            </button>
          </div>
          <p className="text-[12px] text-[#7C9AB4] leading-relaxed">
            Semnătura digitală (conectarea la ANAF / SPV pentru e-Factura) se activează separat din Setări, după aprobarea ANAF. Nu este necesară pentru a începe.
          </p>
          {!companyComplete && (
            <button onClick={() => setStep('company')} className="text-[13px] text-[#9FB8CC] hover:text-white transition-colors">← Înapoi la datele firmei</button>
          )}
        </div>
      )}
    </div>
  );
}
