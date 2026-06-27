import { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { DatePicker } from '../ui/DatePicker';
import { Select } from '../ui/Select';
import { Plus, Pause, Play, X, Repeat } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';

interface Item {
  id: string;
  name: string;
  frequency: string;
  nextRunAt: string;
  lastRunAt: string | null;
  startAt: string;
  endAt: string | null;
  currency: string | null;
  isActive: boolean | null;
  totalRuns: number | null;
  maxRuns: number | null;
  paymentTermDays: number | null;
  notes: string | null;
  linesJson: string;
  recipientEmail: string | null;
  clientCompanyId: string | null;
  clientExternalId: string | null;
  clientName: string;
}

interface ClientOpt { id: string; name: string; cui?: string | null; taxId?: string | null }

interface SnapshotLine { description: string; quantity: number; unit?: string; unitPriceCents: number; vatRate: number }

const FREQ_LABEL: Record<string, string> = {
  weekly: 'Săptămânal', biweekly: 'Bi-săptămânal',
  monthly: 'Lunar', quarterly: 'Trimestrial', yearly: 'Anual',
};

const newLine = (): SnapshotLine => ({ description: '', quantity: 1, unit: 'buc', unitPriceCents: 0, vatRate: 21 });

export default function RecurringManager({ initial, internalClients, externalClients }: {
  initial: Item[]; internalClients: ClientOpt[]; externalClients: ClientOpt[];
}) {
  const [items, setItems] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<'weekly'|'biweekly'|'monthly'|'quarterly'|'yearly'>('monthly');
  const [startAt, setStartAt] = useState(new Date().toISOString().slice(0, 10));
  const [clientKind, setClientKind] = useState<'internal'|'external'|'none'>('internal');
  const [clientId, setClientId] = useState('');
  const [currency, setCurrency] = useState('RON');
  const [paymentTerm, setPaymentTerm] = useState(30);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [maxRuns, setMaxRuns] = useState('');
  const [endAt, setEndAt] = useState('');
  const [lines, setLines] = useState<SnapshotLine[]>([newLine()]);
  const [notes, setNotes] = useState('');

  const reset = () => {
    setName(''); setFrequency('monthly'); setStartAt(new Date().toISOString().slice(0, 10));
    setClientKind('internal'); setClientId(''); setCurrency('RON'); setPaymentTerm(30);
    setRecipientEmail(''); setMaxRuns(''); setEndAt('');
    setLines([newLine()]); setNotes(''); setCreating(false);
  };

  const create = async () => {
    if (!name.trim()) { alert('Nume lipsă'); return; }
    if (clientKind !== 'none' && !clientId) { alert('Selectează client sau alege „Fără client legat"'); return; }
    if (lines.some(l => !l.description.trim() || l.unitPriceCents < 0)) { alert('Verifică liniile (descriere + preț)'); return; }
    setBusy(true);
    try {
      const payload: any = {
        name: name.trim(), frequency, startAt,
        currency, paymentTermDays: paymentTerm,
        recipientEmail: recipientEmail.trim() || null,
        maxRuns: maxRuns ? Number(maxRuns) : null,
        endAt: endAt || null,
        notes: notes.trim() || null,
        lines,
      };
      if (clientKind === 'internal') payload.clientCompanyId = clientId;
      if (clientKind === 'external') payload.clientExternalId = clientId;

      const res = await fetch('/api/invoicing/recurring', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || 'Eroare'); return; }
      const { id } = await res.json();
      const clientName = clientKind === 'internal'
        ? internalClients.find(c => c.id === clientId)?.name || ''
        : clientKind === 'external'
          ? externalClients.find(c => c.id === clientId)?.name || ''
          : '—';
      setItems((prev) => [{
        id, name: name.trim(), frequency, nextRunAt: startAt, lastRunAt: null,
        startAt, endAt: endAt || null, currency, isActive: true,
        totalRuns: 0, maxRuns: maxRuns ? Number(maxRuns) : null,
        paymentTermDays: paymentTerm, notes: notes.trim() || null,
        linesJson: JSON.stringify(lines),
        recipientEmail: recipientEmail.trim() || null,
        clientCompanyId: clientKind === 'internal' ? clientId : null,
        clientExternalId: clientKind === 'external' ? clientId : null,
        clientName,
      }, ...prev]);
      reset();
    } finally { setBusy(false); }
  };

  const toggle = async (id: string, current: boolean) => {
    setBusy(true);
    try {
      const res = await fetch('/api/invoicing/recurring', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isActive: !current }),
      });
      if (res.ok) setItems((prev) => prev.map(i => i.id === id ? { ...i, isActive: !current } : i));
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!confirm('Dezactivezi acest abonament? Nu se mai emit facturi automate.')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/invoicing/recurring?id=${id}`, { method: 'DELETE' });
      if (res.ok) setItems((prev) => prev.map(i => i.id === id ? { ...i, isActive: false } : i));
    } finally { setBusy(false); }
  };

  const updateLine = (idx: number, patch: Partial<SnapshotLine>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };
  const addLine = () => setLines((prev) => [...prev, newLine()]);
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

  const clientsForKind = clientKind === 'internal' ? internalClients : clientKind === 'external' ? externalClients : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        {!creating && (
          <Button onClick={() => setCreating(true)} className="rounded-full bg-[#E1FB15] text-[#07090f] hover:bg-[#D2EA0E] active:scale-100">
            <Plus className="w-4 h-4 mr-1.5" /> Abonament nou
          </Button>
        )}
      </div>

      {creating && (
        <div className="bg-white/5 rounded-2xl p-5 space-y-4">
          <h3 className="font-bold text-white">Abonament nou</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Label className="text-[13px] font-medium text-[#A8BED2]">Nume abonament *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Curse săptămânale București-Berlin" className="bg-white/10 border-0 text-white placeholder:text-[#8FA6BC] hover:border-0 focus:border-0 focus:ring-2 focus:ring-[#E1FB15]/40" />
            </div>
            <div>
              <Label className="text-[13px] font-medium text-[#A8BED2]">Frecvență</Label>
              <Select value={frequency} onChange={(e) => setFrequency(e.target.value as any)} className="w-full">
                {Object.entries(FREQ_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div>
              <Label className="text-[13px] font-medium text-[#A8BED2]">Începe pe</Label>
              <DatePicker value={startAt} onChange={(v) => setStartAt(v)} />
            </div>
            <div>
              <Label className="text-[13px] font-medium text-[#A8BED2]">Se termină pe (opțional)</Label>
              <DatePicker value={endAt} onChange={(v) => setEndAt(v)} />
            </div>
            <div>
              <Label className="text-[13px] font-medium text-[#A8BED2]">Max rulări (opțional)</Label>
              <Input type="number" value={maxRuns} onChange={(e) => setMaxRuns(e.target.value)} placeholder="6 = doar 6 facturi" className="[color-scheme:dark] bg-white/10 border-0 text-white placeholder:text-[#8FA6BC] hover:border-0 focus:border-0 focus:ring-2 focus:ring-[#E1FB15]/40" />
            </div>

            <div>
              <Label className="text-[13px] font-medium text-[#A8BED2]">Tip client</Label>
              <Select value={clientKind} onChange={(e) => { setClientKind(e.target.value as any); setClientId(''); }} className="w-full">
                <option value="internal">Companie TH</option>
                <option value="external">Client extern</option>
                <option value="none">Fără client legat</option>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label className="text-[13px] font-medium text-[#A8BED2]">Client</Label>
              {clientKind === 'none' ? (
                <p className="text-xs text-[#A8BED2] mt-2">Vei completa clientul manual la fiecare emitere.</p>
              ) : (
                <Select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full">
                  <option value="">— alege —</option>
                  {clientsForKind.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.cui || c.taxId ? ` (${c.cui || c.taxId})` : ''}
                    </option>
                  ))}
                </Select>
              )}
            </div>

            <div>
              <Label className="text-[13px] font-medium text-[#A8BED2]">Monedă</Label>
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full">
                <option>RON</option><option>EUR</option><option>USD</option><option>GBP</option>
              </Select>
            </div>
            <div>
              <Label className="text-[13px] font-medium text-[#A8BED2]">Termen plată (zile)</Label>
              <Input type="number" value={paymentTerm} onChange={(e) => setPaymentTerm(Number(e.target.value))} className="[color-scheme:dark] bg-white/10 border-0 text-white placeholder:text-[#8FA6BC] hover:border-0 focus:border-0 focus:ring-2 focus:ring-[#E1FB15]/40" />
            </div>
            <div>
              <Label className="text-[13px] font-medium text-[#A8BED2]">Email destinatar (opțional)</Label>
              <Input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="contact@client.ro" className="bg-white/10 border-0 text-white placeholder:text-[#8FA6BC] hover:border-0 focus:border-0 focus:ring-2 focus:ring-[#E1FB15]/40" />
            </div>
          </div>

          <div className="border-t border-white/10 pt-4">
            <Label className="block mb-2 text-[13px] font-medium text-[#A8BED2]">Linii factură</Label>
            <div className="space-y-2">
              {lines.map((l, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    <Input value={l.description} onChange={(e) => updateLine(idx, { description: e.target.value })} placeholder="Descriere serviciu" className="bg-white/10 border-0 text-white placeholder:text-[#8FA6BC] hover:border-0 focus:border-0 focus:ring-2 focus:ring-[#E1FB15]/40" />
                  </div>
                  <div className="col-span-1">
                    <Input type="number" step="0.01" value={l.quantity} onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })} placeholder="Cant." className="[color-scheme:dark] bg-white/10 border-0 text-white placeholder:text-[#8FA6BC] hover:border-0 focus:border-0 focus:ring-2 focus:ring-[#E1FB15]/40" />
                  </div>
                  <div className="col-span-1">
                    <Input value={l.unit || ''} onChange={(e) => updateLine(idx, { unit: e.target.value })} placeholder="UM" className="bg-white/10 border-0 text-white placeholder:text-[#8FA6BC] hover:border-0 focus:border-0 focus:ring-2 focus:ring-[#E1FB15]/40" />
                  </div>
                  <div className="col-span-2">
                    <Input type="number" step="0.01" value={(l.unitPriceCents / 100).toString()} onChange={(e) => updateLine(idx, { unitPriceCents: Math.round(Number(e.target.value) * 100) })} placeholder="Preț unit." className="[color-scheme:dark] bg-white/10 border-0 text-white placeholder:text-[#8FA6BC] hover:border-0 focus:border-0 focus:ring-2 focus:ring-[#E1FB15]/40" />
                  </div>
                  <div className="col-span-1">
                    <Select value={l.vatRate} onChange={(e) => updateLine(idx, { vatRate: Number(e.target.value) })} className="w-full">
                      <option value={21}>21%</option><option value={11}>11%</option><option value={9}>9%</option><option value={5}>5%</option><option value={0}>0%</option>
                    </Select>
                  </div>
                  <div className="col-span-2 text-right tabular-nums text-sm pr-2 text-white">
                    {((l.quantity * l.unitPriceCents) / 100 * (1 + l.vatRate / 100)).toLocaleString('ro-RO', { minimumFractionDigits: 2 })}
                  </div>
                  {lines.length > 1 && (
                    <button onClick={() => removeLine(idx)} className="w-7 h-7 rounded-full bg-white/10 grid place-items-center text-[#A8BED2] hover:bg-[#DC4B41]/15 hover:text-[#DC4B41] transition-colors" title="Șterge rândul">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={addLine} className="mt-3 rounded-full bg-white/10 text-white border-0 hover:bg-white/15 hover:border-0">+ Adaugă linie</Button>
          </div>

          <div>
            <Label className="text-[13px] font-medium text-[#A8BED2]">Note (opțional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Apar pe factură ca mențiuni" className="bg-white/10 border-0 text-white placeholder:text-[#8FA6BC] hover:border-0 focus:border-0 focus:ring-2 focus:ring-[#E1FB15]/40" />
          </div>

          <div className="flex gap-2">
            <Button onClick={create} disabled={busy} className="rounded-full bg-[#E1FB15] text-[#07090f] hover:bg-[#D2EA0E] active:scale-100">Salvează abonament</Button>
            <Button variant="outline" onClick={reset} className="rounded-full bg-white/10 text-white border-0 hover:bg-white/15 hover:border-0">Anulează</Button>
          </div>
        </div>
      )}

      <div className="bg-white/5 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-[#8FA6BC]">
              <th className="py-3 px-4">Nume</th>
              <th className="py-3 px-4">Client</th>
              <th className="py-3 px-4">Frecvență</th>
              <th className="py-3 px-4">Următoarea</th>
              <th className="py-3 px-4 text-right">Rulări</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 w-28"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={7}>
                <EmptyState
                  icon={<Repeat />}
                  title="Nicio facturare recurentă"
                  description="Configurează un abonament și emitem automat facturile."
                />
              </td></tr>
            )}
            {(showAll ? items : items.slice(0, 3)).map((i) => (
              <tr key={i.id} className="group hover:bg-white/5">
                <td className="py-3 px-4 font-medium text-white">{i.name}</td>
                <td className="py-3 px-4 text-[#A8BED2]">{i.clientName}</td>
                <td className="py-3 px-4 text-white">{FREQ_LABEL[i.frequency] || i.frequency}</td>
                <td className="py-3 px-4 tabular-nums text-white">{i.nextRunAt}</td>
                <td className="py-3 px-4 text-right tabular-nums text-white">{i.totalRuns || 0}{i.maxRuns ? ` / ${i.maxRuns}` : ''}</td>
                <td className="py-3 px-4">
                  {i.isActive
                    ? <span className="text-xs px-2 py-0.5 rounded-full bg-[#2E9E6A]/15 text-[#2E9E6A]">activ</span>
                    : <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-[#A8BED2]">pauzat</span>}
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="flex justify-end gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                    <button onClick={() => toggle(i.id, !!i.isActive)} className="w-9 h-9 rounded-full bg-white/10 grid place-items-center text-white hover:bg-white/15 transition-colors" title={i.isActive ? 'Pune pe pauză' : 'Repornește'}>
                      {i.isActive ? <Pause className="w-3.5 h-3.5 text-[#A8BED2]" /> : <Play className="w-3.5 h-3.5 text-[#2E9E6A]" />}
                    </button>
                    <button onClick={() => remove(i.id)} className="w-9 h-9 rounded-full bg-white/10 grid place-items-center text-[#A8BED2] hover:bg-[#DC4B41]/15 hover:text-[#DC4B41] transition-colors" title="Dezactivează permanent"><X className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length > 3 && (
              <tr>
                <td colSpan={7} className="py-3 px-4">
                  <button type="button" onClick={() => setShowAll((s) => !s)} className="mx-auto w-fit flex items-center px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#07090f] text-[13.5px] font-semibold hover:bg-[#D2EA0E] active:scale-95 transition-all">
                    {showAll ? 'Arată mai puțin' : `Vezi toate (${items.length})`}
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
