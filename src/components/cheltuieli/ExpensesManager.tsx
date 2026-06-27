import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Select } from '../ui/Select';
import { DatePicker } from '../ui/DatePicker';
import { EmptyState } from '../ui/EmptyState';
import { Plus, X, Loader2, Check, ChevronDown, ArrowLeft, Receipt, Wallet } from 'lucide-react';

function PillSelect({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 h-10 pl-4 pr-3 rounded-full text-[13px] font-semibold transition-colors ${value ? 'bg-[#E1FB15]/15 text-[#E1FB15]' : 'bg-white/10 text-white hover:bg-white/15'}`}
      >
        <span className="whitespace-nowrap">{selected?.label ?? placeholder}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 bg-[#07090f] rounded-2xl ring-1 ring-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.5)] py-1.5 z-50 min-w-[160px]">
          <button
            type="button"
            className={`w-full text-left px-4 py-2 text-[13px] rounded-xl transition-colors ${!value ? 'text-[#E1FB15] font-semibold' : 'text-[#A8BED2] hover:text-white hover:bg-white/5'}`}
            onClick={() => { onChange(''); setOpen(false); }}
          >
            {placeholder}
          </button>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`w-full text-left px-4 py-2 text-[13px] rounded-xl transition-colors ${value === o.value ? 'text-[#E1FB15] font-semibold' : 'text-[#A8BED2] hover:text-white hover:bg-white/5'}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Expense {
  id: string; supplierNameSnap: string | null; supplierName: string | null;
  category: string | null; documentType: string; documentNumber: string | null;
  issueDate: string | null; dueDate: string | null; currency: string | null;
  netCents: number; vatCents: number; totalCents: number; paidCents: number;
  status: string; deductible: boolean; vatScheme: string | null; notes: string | null;
}
interface Supplier {
  id: string; name: string;
  defaultCategory?: string | null;
  defaultDeductible?: boolean | null;
  defaultDeductiblePct?: number | null;
  defaultVatScheme?: string | null;
}

const CURRENCIES = ['RON', 'EUR', 'USD', 'GBP', 'CHF'];

const CATEGORIES = ['utilitati', 'chirie', 'combustibil', 'servicii', 'marfa', 'salarii', 'taxe', 'altele'];
const CAT_LABELS: Record<string, string> = {
  utilitati: 'Utilități', chirie: 'Chirie', combustibil: 'Combustibil', servicii: 'Servicii',
  marfa: 'Marfă', salarii: 'Salarii', taxe: 'Taxe', altele: 'Altele',
};
const DOC_LABELS: Record<string, string> = {
  factura: 'Factură', bon: 'Bon', chitanta: 'Chitanță', extras: 'Extras',
};
const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  unpaid: { label: 'Neplătit', cls: 'bg-[#DC4B41]/15 text-[#DC4B41]' },
  partial: { label: 'Parțial', cls: 'bg-[#E8A33C]/15 text-[#E8A33C]' },
  paid: { label: 'Plătit', cls: 'bg-[#2E9E6A]/15 text-[#2E9E6A]' },
};

const money = (cents: number, currency?: string | null) =>
  new Intl.NumberFormat('ro-RO', { style: 'currency', currency: currency || 'RON' }).format((cents || 0) / 100);

const emptyForm = {
  supplierId: '', supplierNameSnap: '', category: 'servicii', documentType: 'factura',
  documentNumber: '', issueDate: new Date().toISOString().slice(0, 10), dueDate: '',
  net: '', vat: '', deductible: true, deductiblePct: 100, currency: 'RON', vatScheme: 'normal',
};

export default function ExpensesManager() {
  const [items, setItems] = useState<Expense[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [fStatus, setFStatus] = useState('');
  const [fCategory, setFCategory] = useState('');
  const [form, setForm] = useState<typeof emptyForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);

  const refresh = async (status = fStatus, category = fCategory) => {
    try {
      const p = new URLSearchParams();
      if (status) p.set('status', status);
      if (category) p.set('category', category);
      const r = await fetch(`/api/cheltuieli/expenses${p.toString() ? `?${p}` : ''}`);
      const d = await r.json();
      setItems(d.results || []);
    } catch { /* leave empty */ }
  };
  useEffect(() => {
    refresh();
    fetch('/api/cheltuieli/suppliers').then((r) => r.json()).then((d) => setSuppliers(d.results || [])).catch(() => {});
  }, []);

  const save = async () => {
    if (!form) return;
    setBusy(true); setError('');
    try {
      const supplier = suppliers.find((s) => s.id === form.supplierId);
      const payload = {
        supplierId: form.supplierId || null,
        supplierNameSnap: supplier?.name || form.supplierNameSnap || null,
        category: form.category,
        documentType: form.documentType,
        documentNumber: form.documentNumber || null,
        issueDate: form.issueDate || null,
        dueDate: form.dueDate || null,
        netCents: Math.round((Number(form.net) || 0) * 100),
        vatCents: Math.round((Number(form.vat) || 0) * 100),
        deductible: form.deductiblePct > 0,
        deductiblePct: form.deductiblePct,
        currency: form.currency,
        vatScheme: form.vatScheme,
      };
      const res = await fetch('/api/cheltuieli/expenses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare'); return; }
      setForm(null); await refresh();
    } catch { setError('Eroare conexiune'); } finally { setBusy(false); }
  };

  const markPaid = async (id: string) => {
    if (!confirm('Confirmi că această cheltuială a fost plătită?')) return;
    try {
      const res = await fetch(`/api/cheltuieli/expenses/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markPaid: true }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Eroare'); return; }
      await refresh();
    } catch { setError('Eroare conexiune'); }
  };

  const remove = async (id: string) => {
    if (!confirm('Sigur ștergi cheltuiala?')) return;
    try {
      const res = await fetch(`/api/cheltuieli/expenses/${id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Eroare'); return; }
      await refresh();
    } catch { setError('Eroare conexiune'); }
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-[#DC4B41]">{error}</p>}

      {!form && (
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
          <PillSelect
            value={fStatus}
            onChange={(v) => { setFStatus(v); refresh(v, fCategory); }}
            placeholder="Toate statusurile"
            options={[
              { value: 'unpaid', label: 'Neplătit' },
              { value: 'partial', label: 'Parțial' },
              { value: 'paid', label: 'Plătit' },
            ]}
          />
          <PillSelect
            value={fCategory}
            onChange={(v) => { setFCategory(v); refresh(fStatus, v); }}
            placeholder="Toate categoriile"
            options={CATEGORIES.map((c) => ({ value: c, label: CAT_LABELS[c] }))}
          />
        </div>
        <Button className="bg-[#E1FB15] text-[#07090f] hover:bg-[#D2EA0E] rounded-full font-bold shadow-none w-full sm:w-auto justify-center shrink-0" onClick={() => setForm({ ...emptyForm })}><Plus className="w-4 h-4 mr-1" /> Cheltuială nouă</Button>
      </div>
      )}

      {!form && (items.length === 0 ? (
        <EmptyState
          icon={<Receipt className="w-6 h-6" />}
          title="Nicio cheltuială"
          description="Adaugă prima cheltuială pentru a-ți urmări costurile și TVA-ul deductibil."
          action={
            <button type="button" onClick={() => setForm({ ...emptyForm })} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#07090f] text-[13.5px] font-semibold hover:bg-[#D2EA0E] active:scale-95 transition-all">
              <Plus className="w-4 h-4" /> Cheltuială nouă
            </button>
          }
        />
      ) : (
        <>
        <ul className="grid gap-2.5 lg:grid-cols-2">
          {(showAll ? items : items.slice(0, 4)).map((e) => {
            const st = STATUS_BADGE[e.status] || STATUS_BADGE.unpaid;
            return (
              <li key={e.id} className="group flex items-center gap-3 p-4 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                    <span className="text-[12px] text-[#8FA6BC] truncate">{DOC_LABELS[e.documentType] || e.documentType}{e.documentNumber ? ` · ${e.documentNumber}` : ''}</span>
                  </div>
                  <p className="text-[15px] text-white font-semibold truncate mt-1.5">{e.supplierName || e.supplierNameSnap || '—'}</p>
                  <p className="text-[12px] text-[#8FA6BC] mt-0.5 truncate">{e.category ? (CAT_LABELS[e.category] || e.category) : '—'}{e.issueDate ? ` · ${new Date(e.issueDate).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest' })}` : ''}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[15px] font-bold tabular-nums text-white">{money(e.totalCents, e.currency)}</p>
                  {e.vatScheme === 'reverse_charge' && <p className="text-[10.5px] text-[#8FA6BC] mt-0.5">taxare inversă</p>}
                  <div className="flex items-center justify-end gap-1 mt-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                    {e.status !== 'paid' && (
                      <button onClick={() => markPaid(e.id)} title="Marchează plătit" className="w-8 h-8 grid place-items-center rounded-full bg-white/10 text-[#A8BED2] hover:text-[#2E9E6A] hover:bg-white/15 transition-colors"><Check className="w-4 h-4" /></button>
                    )}
                    <button onClick={() => remove(e.id)} title="Șterge" className="w-8 h-8 grid place-items-center rounded-full bg-white/10 text-[#A8BED2] hover:text-[#DC4B41] hover:bg-white/15 transition-colors"><X className="w-4 h-4" /></button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {items.length > 4 && (
          <button type="button" onClick={() => setShowAll((s) => !s)} className="mt-3 mx-auto w-fit flex items-center px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#07090f] text-[13.5px] font-semibold hover:bg-[#D2EA0E] active:scale-95 transition-all">
            {showAll ? 'Arată mai puțin' : `Vezi toate (${items.length})`}
          </button>
        )}
        </>
      ))}

      {form && (() => {
        const total = (Number(form.net) || 0) + (Number(form.vat) || 0);
        return (
        <div className="max-w-2xl mx-auto fm-rise">
          {/* Header: back + title + live total */}
          <div className="flex items-center gap-3 mb-6">
            <button type="button" onClick={() => setForm(null)} aria-label="Înapoi" className="w-10 h-10 grid place-items-center rounded-full bg-white/10 text-[#C8DAE8] hover:bg-white/15 hover:text-white active:scale-95 transition-all shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h2 className="text-[22px] sm:text-[26px] font-bold tracking-[-0.02em] text-white leading-tight">Cheltuială nouă</h2>
              <p className="text-[13px] text-[#8FA6BC] mt-0.5">Înregistrează un document și sumele lui</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[11px] uppercase tracking-wider text-[#8FA6BC] font-semibold">Total</p>
              <p className="text-[20px] sm:text-[22px] font-bold tabular-nums text-[#E1FB15] leading-tight">{money(Math.round(total * 100), form.currency)}</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Section 1 — Document & furnizor */}
            <section className="rounded-3xl bg-white/5 p-5 sm:p-6">
              <div className="flex items-center gap-2.5 mb-5">
                <span className="w-8 h-8 rounded-full bg-[#E1FB15]/15 text-[#E1FB15] grid place-items-center"><Receipt className="w-4 h-4" /></span>
                <h3 className="text-[15px] font-bold text-white">Document & furnizor</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="mb-1.5 block text-xs text-[#A8BED2]">Furnizor</Label>
                  <Select
                    value={form.supplierId}
                    onChange={(e) => {
                      const sup = suppliers.find((s) => s.id === e.target.value);
                      // Pre-fill from this supplier's learned defaults (per-supplier memory).
                      const next = { ...form, supplierId: e.target.value };
                      if (sup?.defaultCategory) {
                        next.category = sup.defaultCategory;
                        next.deductiblePct = sup.defaultDeductiblePct != null ? sup.defaultDeductiblePct : (sup.defaultDeductible === false ? 0 : 100);
                        next.vatScheme = sup.defaultVatScheme === 'reverse_charge' ? 'reverse_charge' : 'normal';
                      }
                      setForm(next);
                    }}
                    onAddNew={() => setForm({ ...form, supplierId: '', supplierNameSnap: '' })}
                    addNewLabel="Furnizor nou (scrie manual)"
                  >
                    <option value="">Fără furnizor / manual</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                </div>
                {!form.supplierId && (
                  <div><Label className="mb-1.5 block text-xs text-[#A8BED2]">Nume furnizor</Label><Input className="bg-white/5 text-white placeholder:text-[#8FA6BC] focus:ring-2 focus:ring-[#E1FB15]/40" value={form.supplierNameSnap} onChange={(e) => setForm({ ...form, supplierNameSnap: e.target.value })} placeholder="ex. Enel Energie SA" /></div>
                )}
                <div>
                  <Label className="mb-1.5 block text-xs text-[#A8BED2]">Categorie</Label>
                  <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
                  </Select>
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs text-[#A8BED2]">Tip document</Label>
                  <Select value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })}>
                    <option value="factura">Factură</option>
                    <option value="bon">Bon</option>
                    <option value="chitanta">Chitanță</option>
                    <option value="extras">Extras</option>
                  </Select>
                </div>
                <div><Label className="mb-1.5 block text-xs text-[#A8BED2]">Număr document</Label><Input className="bg-white/5 text-white placeholder:text-[#8FA6BC] focus:ring-2 focus:ring-[#E1FB15]/40" value={form.documentNumber} onChange={(e) => setForm({ ...form, documentNumber: e.target.value })} placeholder="ex. 12345" /></div>
                <div><Label className="mb-1.5 block text-xs text-[#A8BED2]">Data emiterii</Label><DatePicker value={form.issueDate} onChange={(v) => setForm({ ...form, issueDate: v })} /></div>
                <div><Label className="mb-1.5 block text-xs text-[#A8BED2]">Scadență</Label><DatePicker value={form.dueDate} onChange={(v) => setForm({ ...form, dueDate: v })} placeholder="Fără scadență" /></div>
              </div>
            </section>

            {/* Section 2 — Sume */}
            <section className="rounded-3xl bg-white/5 p-5 sm:p-6">
              <div className="flex items-center gap-2.5 mb-5">
                <span className="w-8 h-8 rounded-full bg-[#E1FB15]/15 text-[#E1FB15] grid place-items-center"><Wallet className="w-4 h-4" /></span>
                <h3 className="text-[15px] font-bold text-white">Sume</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 sm:max-w-[12rem]">
                  <Label className="mb-1.5 block text-xs text-[#A8BED2]">Monedă</Label>
                  <Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </div>
                <div><Label className="mb-1.5 block text-xs text-[#A8BED2]">Net ({form.currency})</Label><Input className="bg-white/5 text-white placeholder:text-[#8FA6BC] focus:ring-2 focus:ring-[#E1FB15]/40" type="number" step="any" value={form.net} onChange={(e) => setForm({ ...form, net: e.target.value })} placeholder="0.00" /></div>
                <div><Label className="mb-1.5 block text-xs text-[#A8BED2]">TVA ({form.currency})</Label><Input className="bg-white/5 text-white placeholder:text-[#8FA6BC] focus:ring-2 focus:ring-[#E1FB15]/40" type="number" step="any" value={form.vat} onChange={(e) => setForm({ ...form, vat: e.target.value })} placeholder="0.00" /></div>
              </div>
              {form.currency !== 'RON' && (
                <p className="mt-3 text-[11px] text-[#8FA6BC]">Cursul BNR de la data emiterii e preluat automat la salvare (pentru declarații în RON).</p>
              )}

              {/* Taxare inversă */}
              <button type="button" onClick={() => {
                const on = form.vatScheme !== 'reverse_charge';
                // Auto-sugerează TVA la cota standard 21% dacă e gol (taxare inversă: TVA auto-lichidat).
                const autoVat = on && !form.vat && Number(form.net) > 0
                  ? (Math.round(Number(form.net) * 0.21 * 100) / 100).toString()
                  : form.vat;
                setForm({ ...form, vatScheme: on ? 'reverse_charge' : 'normal', vat: autoVat });
              }} className="mt-4 w-full flex items-center gap-3 text-left p-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors">
                <span className={`relative shrink-0 w-10 h-6 rounded-full transition-colors ${form.vatScheme === 'reverse_charge' ? 'bg-[#E1FB15]' : 'bg-[#5E6B7C]'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform ${form.vatScheme === 'reverse_charge' ? 'translate-x-4 bg-[#07090f]' : 'translate-x-0 bg-white'}`} />
                </span>
                <span className="text-[13.5px] font-medium text-white leading-snug">Taxare inversă (achiziție intra-UE / servicii non-UE)</span>
              </button>
              {form.vatScheme === 'reverse_charge' && (
                <p className="mt-2 text-[11px] text-[#8FA6BC]">TVA-ul se auto-lichidează (4426 + 4427, efect zero) și nu se adaugă la suma de plată. Introdu TVA calculat la cota aplicabilă.</p>
              )}

              {/* Deductibilitate */}
              <button type="button" onClick={() => setForm({ ...form, deductiblePct: form.deductiblePct > 0 ? 0 : 100 })} className="mt-4 w-full flex items-center gap-3 text-left p-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors">
                <span className={`relative shrink-0 w-10 h-6 rounded-full transition-colors ${form.deductiblePct > 0 ? 'bg-[#E1FB15]' : 'bg-[#5E6B7C]'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform ${form.deductiblePct > 0 ? 'translate-x-4 bg-[#07090f]' : 'translate-x-0 bg-white'}`} />
                </span>
                <span className="text-[13.5px] font-medium text-white leading-snug">Cheltuială deductibilă fiscal</span>
              </button>
              {form.deductiblePct > 0 && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-[#A8BED2]">Cât e deductibil:</span>
                  {[
                    { v: 100, label: '100%' },
                    { v: 50, label: '50% (auto)' },
                  ].map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setForm({ ...form, deductiblePct: o.v })}
                      className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors ${form.deductiblePct === o.v ? 'bg-[#E1FB15] text-[#07090f]' : 'bg-white/10 text-white hover:bg-white/15'}`}
                    >{o.label}</button>
                  ))}
                  {form.deductiblePct === 50 && <span className="text-[11px] text-[#8FA6BC]">Autoturism nefolosit exclusiv business: 50% cheltuială + 50% TVA.</span>}
                </div>
              )}
            </section>

            <div className="flex gap-2 pt-1">
              <Button className="bg-[#E1FB15] text-[#07090f] hover:bg-[#D2EA0E] rounded-full font-bold shadow-none active:scale-95 transition-transform" disabled={busy} onClick={save}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvează cheltuiala'}</Button>
              <Button className="bg-white/10 border-0 text-white hover:bg-white/15 rounded-full active:scale-95 transition-transform" variant="outline" onClick={() => setForm(null)}>Renunță</Button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
