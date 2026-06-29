import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Select } from '../ui/Select';
import { DatePicker } from '../ui/DatePicker';
import { EmptyState } from '../ui/EmptyState';
import { Plus, X, Loader2, Check, ArrowLeft, Receipt, Wallet } from 'lucide-react';

const ron = (cents: number) =>
  new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format((cents || 0) / 100);


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
  // English category keys that may already exist on records (legacy/imported).
  utilities: 'Utilități', rent: 'Chirie', fuel: 'Combustibil', services: 'Servicii',
  goods: 'Marfă', salaries: 'Salarii', taxes: 'Taxe', telecom: 'Telecom',
  software: 'Software', office: 'Birotică', travel: 'Deplasări', other: 'Altele',
};
const DOC_LABELS: Record<string, string> = {
  factura: 'Factură', bon: 'Bon', chitanta: 'Chitanță', extras: 'Extras',
  // English document-type keys that may already exist on records.
  invoice: 'Factură', receipt: 'Bon', voucher: 'Chitanță', statement: 'Extras',
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

// Maps a "tip" filter value to all documentType keys it should match
// (records may carry Romanian or legacy English keys).
const DOC_TYPE_ALIASES: Record<string, string[]> = {
  factura: ['factura', 'invoice'],
  bon: ['bon', 'receipt'],
  chitanta: ['chitanta', 'voucher'],
  extras: ['extras', 'statement'],
};

export default function ExpensesManager({ inboxNew = [], efacturaIds = [], anafConnected = false, initialDocType = '', initialStatus = '', initialCategory = '' }: { inboxNew?: any[]; efacturaIds?: string[]; anafConnected?: boolean; initialDocType?: string; initialStatus?: string; initialCategory?: string }) {
  const [items, setItems] = useState<Expense[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState<typeof emptyForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  // SPV e-Factura invoices not yet recorded — shown at the top of the same list,
  // tagged "e-Factura", with a one-tap Confirmă that imports them as an expense.
  const [inbox, setInbox] = useState<any[]>(inboxNew);
  const [importingId, setImportingId] = useState<string | null>(null);
  const efacturaSet = new Set(efacturaIds);
  // Status / Categorie filters live in the page-level filterbar now (URL-based,
  // ?status=…&category=…) — the list reflects those via the props below.

  const refresh = async (status = initialStatus, category = initialCategory) => {
    try {
      const p = new URLSearchParams();
      if (status) p.set('status', status);
      if (category) p.set('category', category);
      const r = await fetch(`/api/cheltuieli/expenses${p.toString() ? `?${p}` : ''}`);
      const d = await r.json();
      setItems(d.results || []);
    } catch { /* leave empty */ }
  };

  const importInbox = async (id: string) => {
    setImportingId(id);
    try {
      const r = await fetch(`/api/anaf/inbox/${id}/import`, { method: 'POST' });
      const d = await r.json();
      if (d.ok) { setInbox((prev) => prev.filter((x) => x.id !== id)); refresh(); }
    } catch { /* ignore */ } finally { setImportingId(null); }
  };

  // Pull new invoices from ANAF SPV, then keep only the not-yet-recorded ones.
  const [syncing, setSyncing] = useState(false);
  const syncSpv = async () => {
    setSyncing(true);
    try {
      await fetch('/api/anaf/inbox/sync', { method: 'POST' });
      const r = await fetch('/api/anaf/inbox');
      const d = await r.json();
      if (d.ok && Array.isArray(d.rows)) setInbox(d.rows.filter((x: any) => x.status === 'nou'));
    } catch { /* keep current */ } finally { setSyncing(false); }
  };
  // Auto-sync once per session when ANAF is connected — "totul automat".
  useEffect(() => {
    if (!anafConnected) return;
    try { if (sessionStorage.getItem('chelt-spv-synced')) return; sessionStorage.setItem('chelt-spv-synced', '1'); } catch {}
    syncSpv();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    refresh();
    fetch('/api/cheltuieli/suppliers').then((r) => r.json()).then((d) => setSuppliers(d.results || [])).catch(() => {});
  }, []);

  // The "+ Cheltuială nouă" button lives in the page header (outside this island);
  // open the form when it's pressed.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest?.('[data-new-expense]')) {
        setForm({ ...emptyForm });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
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

  // Apply the page-level "Tip" filter (from ?tip=…) to the rendered list.
  const docAliases = initialDocType ? (DOC_TYPE_ALIASES[initialDocType] || [initialDocType]) : null;
  const visibleItems = docAliases ? items.filter((e) => docAliases.includes(e.documentType)) : items;
  // SPV inbox rows are received e-Facturi — only show them when the filter
  // includes facturi (or no filter is active).
  const visibleInbox = !initialDocType || initialDocType === 'factura' ? inbox : [];

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

      {!form && anafConnected && (
        <div className="flex">
          <button type="button" onClick={syncSpv} disabled={syncing} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-white/10 text-white text-[13.5px] font-semibold hover:bg-white/15 disabled:opacity-50 shrink-0">
            <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M3.984 14.652H-.008M16.023 9.348a8.25 8.25 0 00-13.803-3.7L3.18 9.349m12.843 0h.001M3.984 14.652a8.25 8.25 0 0013.803 3.7l2.79-2.79m-16.594-.91H8.98" /></svg>
            {syncing ? 'Se sincronizează…' : 'Sincronizează din SPV'}
          </button>
        </div>
      )}

      {!form && (visibleItems.length === 0 && visibleInbox.length === 0 ? (
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
        <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {visibleInbox.map((row) => (
            <li key={`inb-${row.id}`} onClick={() => { window.location.href = `/app/cheltuieli/spv/${row.id}`; }} className="p-4 rounded-2xl bg-white/5 ring-1 ring-[#34A0A4]/25 cursor-pointer hover:bg-white/[0.08] transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#34A0A4]/15 text-[#34A0A4] whitespace-nowrap">e-Factura</span>
                    <span className="text-[12px] text-[#8FA6BC]">din SPV</span>
                  </div>
                  <p className="text-[15px] text-white font-semibold truncate mt-1.5">{row.supplierName || row.fromCif || 'Furnizor'}</p>
                  <p className="text-[12px] text-[#8FA6BC] mt-0.5 truncate">{row.detail ? `${row.detail} · ` : ''}{row.issueDate ? new Date(row.issueDate).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest' }) : ''}</p>
                </div>
                <p className="text-[15px] font-bold tabular-nums text-white shrink-0 whitespace-nowrap leading-none">{row.totalCents != null ? ron(row.totalCents) : '—'}</p>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button onClick={(e) => { e.stopPropagation(); importInbox(row.id); }} disabled={importingId === row.id} className="flex-1 px-4 py-2.5 rounded-full bg-[#E1FB15] text-[#07090f] text-[13.5px] font-bold hover:bg-[#D2EA0E] disabled:opacity-50">{importingId === row.id ? 'Se importă…' : 'Confirmă'}</button>
                <span className="inline-flex items-center gap-1 px-4 py-2.5 rounded-full bg-white/10 text-white text-[13px] font-semibold whitespace-nowrap">Vezi factura →</span>
              </div>
            </li>
          ))}
          {(showAll ? visibleItems : visibleItems.slice(0, 4)).map((e) => {
            const st = STATUS_BADGE[e.status] || STATUS_BADGE.unpaid;
            return (
              <li key={e.id} onClick={() => { window.location.href = `/app/cheltuieli/${e.id}`; }} className="group flex items-center gap-3 p-4 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors cursor-pointer">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                    {efacturaSet.has(e.id) && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#34A0A4]/15 text-[#34A0A4] whitespace-nowrap">e-Factura</span>
                    )}
                    <span className="text-[12px] text-[#8FA6BC] truncate">{DOC_LABELS[e.documentType] || e.documentType}{e.documentNumber ? ` · ${e.documentNumber}` : ''}</span>
                  </div>
                  <p className="text-[15px] text-white font-semibold truncate mt-1.5">{e.supplierName || e.supplierNameSnap || '—'}</p>
                  <p className="text-[12px] text-[#8FA6BC] mt-0.5 truncate">{e.category ? (CAT_LABELS[e.category] || e.category) : '—'}{e.issueDate ? ` · ${new Date(e.issueDate).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest' })}` : ''}</p>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                  <p className="text-[15px] font-bold tabular-nums text-white leading-none">{ron(e.totalCents)}</p>
                  <div className="flex items-center justify-end gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                    {e.status !== 'paid' && (
                      <button onClick={(ev) => { ev.stopPropagation(); markPaid(e.id); }} title="Marchează plătit" className="w-8 h-8 grid place-items-center rounded-full bg-white/10 text-[#A8BED2] hover:text-[#2E9E6A] hover:bg-white/15 transition-colors"><Check className="w-4 h-4" /></button>
                    )}
                    <button onClick={(ev) => { ev.stopPropagation(); remove(e.id); }} title="Șterge" className="w-8 h-8 grid place-items-center rounded-full bg-white/10 text-[#A8BED2] hover:text-[#DC4B41] hover:bg-white/15 transition-colors"><X className="w-4 h-4" /></button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {visibleItems.length > 4 && (
          <button type="button" onClick={() => setShowAll((s) => !s)} className="mt-3 mx-auto w-fit flex items-center px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#07090f] text-[13.5px] font-semibold hover:bg-[#D2EA0E] active:scale-95 transition-all">
            {showAll ? 'Arată mai puțin' : `Vezi toate (${visibleItems.length})`}
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
              <p className="text-[20px] sm:text-[22px] font-bold tabular-nums text-[#E1FB15] leading-tight">{ron(Math.round(total * 100))}</p>
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
                    onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
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
                <div><Label className="mb-1.5 block text-xs text-[#A8BED2]">Net (RON)</Label><Input className="bg-white/5 text-white placeholder:text-[#8FA6BC] focus:ring-2 focus:ring-[#E1FB15]/40" type="number" step="any" value={form.net} onChange={(e) => setForm({ ...form, net: e.target.value })} placeholder="0.00" /></div>
                <div><Label className="mb-1.5 block text-xs text-[#A8BED2]">TVA (RON)</Label><Input className="bg-white/5 text-white placeholder:text-[#8FA6BC] focus:ring-2 focus:ring-[#E1FB15]/40" type="number" step="any" value={form.vat} onChange={(e) => setForm({ ...form, vat: e.target.value })} placeholder="0.00" /></div>
              </div>
              <button type="button" onClick={() => setForm({ ...form, deductible: !form.deductible })} className="mt-4 w-full flex items-center gap-3 text-left p-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors">
                <span className={`relative shrink-0 w-10 h-6 rounded-full transition-colors ${form.deductible ? 'bg-[#E1FB15]' : 'bg-[#5E6B7C]'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform ${form.deductible ? 'translate-x-4 bg-[#07090f]' : 'translate-x-0 bg-white'}`} />
                </span>
                <span className="text-[13.5px] font-medium text-white leading-snug">Cheltuială deductibilă fiscal</span>
              </button>
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
