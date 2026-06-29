import { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Select } from '../ui/Select';
import { Plus, Loader2, Users, Trash2, Pencil } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';

interface Employee {
  id: string;
  fullName: string;
  cnp: string | null;
  position: string | null;
  baseSalaryCents: number;
  deductionCents: number;
  nrDependents: number;
  employmentType: string;
  iban: string | null;
  hiredAt: string | null;
  active: boolean;
}

// Form keeps money as LEI strings; converted to cents on save.
interface FormState {
  id?: string;
  fullName: string;
  cnp: string;
  position: string;
  baseSalaryLei: string;
  deductionLei: string;
  nrDependents: string;
  employmentType: string;
  iban: string;
  hiredAt: string;
}

const empty: FormState = {
  fullName: '', cnp: '', position: '', baseSalaryLei: '', deductionLei: '', nrDependents: '0',
  employmentType: 'full_time', iban: '', hiredAt: '',
};

const TYPE_LABELS: Record<string, string> = {
  full_time: 'Normă întreagă', part_time: 'Timp parțial',
};

const ron = (cents: number) =>
  new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format((cents || 0) / 100);

// LEI string -> integer cents (handles comma decimals).
const toCents = (lei: string): number => {
  const n = Number(String(lei || '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};
const toLei = (cents: number): string => (cents ? (cents / 100).toString() : '');

export default function EmployeesManager() {
  const [items, setItems] = useState<Employee[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refresh = async () => {
    try {
      const r = await fetch('/api/salarii/employees');
      const d = await r.json();
      const results: Employee[] = d.results || [];
      setItems(results);
      if (!loaded && results.length === 0) setForm((f) => f ?? { ...empty });
      setLoaded(true);
    } catch { setLoaded(true); }
  };
  useEffect(() => { refresh(); }, []);

  const editEmp = (e: Employee) => {
    setError('');
    setForm({
      id: e.id,
      fullName: e.fullName || '',
      cnp: e.cnp || '',
      position: e.position || '',
      baseSalaryLei: toLei(e.baseSalaryCents),
      deductionLei: toLei(e.deductionCents),
      nrDependents: String(e.nrDependents ?? 0),
      employmentType: e.employmentType || 'full_time',
      iban: e.iban || '',
      hiredAt: e.hiredAt || '',
    });
  };

  const save = async () => {
    if (!form) return;
    if (!form.fullName.trim()) { setError('Numele angajatului e obligatoriu'); return; }
    setBusy(true); setError('');
    const payload = {
      id: form.id,
      fullName: form.fullName.trim(),
      cnp: form.cnp.trim(),
      position: form.position.trim(),
      baseSalaryCents: toCents(form.baseSalaryLei),
      deductionCents: toCents(form.deductionLei),
      nrDependents: Math.max(0, Math.trunc(Number(form.nrDependents) || 0)),
      employmentType: form.employmentType,
      iban: form.iban.trim(),
      hiredAt: form.hiredAt.trim() || null,
    };
    try {
      const res = await fetch('/api/salarii/employees', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Eroare'); return; }
      setForm(null); await refresh();
    } catch { setError('Eroare conexiune'); } finally { setBusy(false); }
  };

  const del = async (id: string) => {
    if (!confirm('Ștergi acest angajat? Nu mai apare în calculele viitoare; statele de plată existente rămân.')) return;
    setError('');
    try {
      const res = await fetch(`/api/salarii/employees?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Eroare'); return; }
      await refresh();
    } catch { setError('Eroare conexiune'); }
  };

  const inputCls = 'rounded-xl bg-white/10 text-white placeholder:text-[#8FA6BC] border border-white/[0.12] focus:ring-2 focus:ring-[#E1FB15]/40';
  const selectCls = `${inputCls} [color-scheme:dark]`;
  const btnPrimary = 'rounded-full bg-[#E1FB15] text-[#07090f] font-bold hover:bg-[#D2EA0E] shadow-none';
  const btnSecondary = 'rounded-full bg-white/10 text-white font-semibold hover:bg-white/15 border-0';

  const isEmpty = items.length === 0;

  const listCard = (
    <Card className="bg-white/5 border-0 rounded-2xl shadow-none hover:shadow-none hover:translate-y-0">
      <CardContent className="p-2">
        {isEmpty ? (
          <EmptyState
            icon={<Users />}
            title="Niciun angajat"
            description="Adaugă primul angajat pentru a calcula statele de plată lunare."
          />
        ) : (
          <>
            <ul className="space-y-2">
              {(showAll ? items : items.slice(0, 3)).map((e) => (
                <li key={e.id} className="flex items-center gap-3 bg-white/[0.06] rounded-xl p-3 hover:bg-white/[0.1] transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {e.fullName}
                      {e.position && <span className="text-xs text-[#A8BED2] ml-2">{e.position}</span>}
                    </p>
                    <p className="text-xs text-[#A8BED2] truncate">
                      {TYPE_LABELS[e.employmentType] || e.employmentType}
                      <span> · brut {ron(e.baseSalaryCents)}</span>
                      {e.deductionCents > 0 && <span> · deducere {ron(e.deductionCents)}</span>}
                      {e.cnp && <span> · {e.cnp}</span>}
                    </p>
                  </div>
                  <button type="button" onClick={() => editEmp(e)} aria-label="Editează angajatul" title="Editează" className="shrink-0 p-1.5 rounded-lg text-[#8FA6BC] hover:text-[#E1FB15] hover:bg-white/10 transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => del(e.id)} aria-label="Șterge angajatul" title="Șterge" className="shrink-0 p-1.5 rounded-lg text-[#8FA6BC] hover:text-[#DC4B41] hover:bg-[#DC4B41]/10 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
            {items.length > 3 && (
              <button type="button" onClick={() => setShowAll((s) => !s)} className="mt-3 mx-auto w-fit flex items-center px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#07090f] text-[13.5px] font-semibold hover:bg-[#D2EA0E] active:scale-95 transition-all">
                {showAll ? 'Arată mai puțin' : `Vezi toți (${items.length})`}
              </button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-[#DC4B41]">{error}</p>}

      <div className="flex justify-start">
        <Button className={btnPrimary} onClick={() => { setError(''); setForm({ ...empty }); }}><Plus className="w-4 h-4 mr-1" /> Angajat nou</Button>
      </div>

      {!isEmpty && listCard}

      {form && (
        <Card className="bg-white/5 border-0 rounded-2xl shadow-none hover:shadow-none hover:translate-y-0">
          <CardContent className="p-4 sm:p-5 space-y-4">
            <h3 className="font-semibold text-white">{form.id ? 'Editează angajatul' : 'Angajat nou'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2"><Label className="mb-1.5 block text-[13px] font-medium text-[#A8BED2]">Nume complet *</Label><Input className={inputCls} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Popescu Ion" /></div>
              <div><Label className="mb-1.5 block text-[13px] font-medium text-[#A8BED2]">CNP</Label><Input className={inputCls} value={form.cnp} onChange={(e) => setForm({ ...form, cnp: e.target.value })} placeholder="1900101..." /></div>
              <div><Label className="mb-1.5 block text-[13px] font-medium text-[#A8BED2]">Funcție</Label><Input className={inputCls} value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="Programator" /></div>
              <div><Label className="mb-1.5 block text-[13px] font-medium text-[#A8BED2]">Salariu brut lunar (lei)</Label><Input className={inputCls} type="number" min="0" step="0.01" value={form.baseSalaryLei} onChange={(e) => setForm({ ...form, baseSalaryLei: e.target.value })} placeholder="4000" /></div>
              <div><Label className="mb-1.5 block text-[13px] font-medium text-[#A8BED2]">Persoane în întreținere</Label><Input className={inputCls} type="number" min="0" step="1" value={form.nrDependents} onChange={(e) => setForm({ ...form, nrDependents: e.target.value })} placeholder="0" /></div>
              <div>
                <Label className="mb-1.5 block text-[13px] font-medium text-[#A8BED2]">Deducere manuală (lei) — opțional</Label>
                <Input className={inputCls} type="number" min="0" step="0.01" value={form.deductionLei} onChange={(e) => setForm({ ...form, deductionLei: e.target.value })} placeholder="0" />
                <p className="mt-1 text-[12px] text-[#8FA6BC]">Lasă 0 pentru calcul automat din nr. persoane în întreținere.</p>
              </div>
              <div>
                <Label className="mb-1.5 block text-[13px] font-medium text-[#A8BED2]">Tip contract</Label>
                <Select className={selectCls} value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })}>
                  <option value="full_time">Normă întreagă</option>
                  <option value="part_time">Timp parțial</option>
                </Select>
              </div>
              <div><Label className="mb-1.5 block text-[13px] font-medium text-[#A8BED2]">IBAN</Label><Input className={inputCls} value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} placeholder="RO..." /></div>
            </div>
            <div className="flex gap-2">
              <Button className={btnPrimary} size="sm" disabled={busy || !form.fullName.trim()} onClick={save}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvează'}</Button>
              {!isEmpty && <Button className={btnSecondary} size="sm" variant="outline" onClick={() => setForm(null)}>Renunță</Button>}
            </div>
          </CardContent>
        </Card>
      )}

      {isEmpty && listCard}
    </div>
  );
}
