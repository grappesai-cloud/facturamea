import { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Select } from '../ui/Select';
import { Plus, Star, Trash2, Loader2 } from 'lucide-react';

interface Rate { id: string; name: string; percent: number; regime: string; description: string | null; isDefault: boolean; isActive: boolean; position: number }

const REGIMES = [
  { id: 'standard', label: 'Standard' },
  { id: 'reverse_charge', label: 'Taxare inversă' },
  { id: 'exempt', label: 'Scutit' },
  { id: 'tva_la_incasare', label: 'TVA la încasare' },
  { id: 'export_extra_eu', label: 'Export extra-UE' },
  { id: 'intra_eu', label: 'Livrare intra-UE' },
];

const empty = { name: '', percent: '0', regime: 'standard', description: '', isDefault: false };

export default function TvaRatesManager() {
  const [rates, setRates] = useState<Rate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState(empty);

  const refresh = async () => {
    const r = await fetch('/api/invoicing/tva');
    const d = await r.json();
    setRates(d.results || []);
  };
  useEffect(() => { refresh(); }, []);

  const add = async () => {
    setError(''); setBusy(true);
    try {
      const res = await fetch('/api/invoicing/tva', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, percent: parseFloat(draft.percent) || 0 }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare'); return; }
      setShowNew(false); setDraft(empty); await refresh();
    } catch { setError('Eroare conexiune'); } finally { setBusy(false); }
  };

  const patch = async (id: string, body: any) => {
    setBusy(true);
    await fetch('/api/invoicing/tva', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) });
    await refresh(); setBusy(false);
  };

  const remove = async (id: string) => {
    if (!confirm('Sigur ștergi cota?')) return;
    const r = await fetch(`/api/invoicing/tva?id=${id}`, { method: 'DELETE' });
    if (!r.ok) { const d = await r.json(); setError(d.error || 'Eroare'); return; }
    await refresh();
  };

  return (
    <Card>
      <CardContent className="p-4">
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-[#0A0A0A]">Cote TVA</h3>
          <Button size="sm" variant="outline" onClick={() => setShowNew(!showNew)}><Plus className="w-4 h-4 mr-1" /> Adaugă cotă</Button>
        </div>

        <ul className="bg-white rounded-xl border border-[#E8E8E4] shadow-sm overflow-hidden divide-y divide-[#E8E8E4]">
          {rates.map((r) => (
            <li key={r.id} className={`flex items-center gap-3 px-3 py-2.5 hover:bg-[#FAFAF8] transition-colors ${!r.isActive ? 'opacity-50' : ''}`}>
              <span className="font-mono text-xs px-2 py-0.5 bg-[#FAFAF8] rounded-full text-[#0A0A0A] tabular-nums w-14 text-center">{r.percent}%</span>
              <span className="text-sm text-[#0A0A0A] font-medium">{r.name}</span>
              {r.description && <span className="text-xs text-[#8A8A85] hidden md:inline flex-1 truncate">{r.description}</span>}
              {!r.description && <span className="flex-1" />}
              {r.isDefault ? (
                <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-semibold flex items-center gap-1"><Star className="w-3 h-3 fill-amber-500" /> implicit</span>
              ) : (
                <button onClick={() => patch(r.id, { isDefault: true })} className="text-xs text-[#6B6B68] hover:text-[#0A0A0A] underline">implicit</button>
              )}
              <button onClick={() => patch(r.id, { isActive: !r.isActive })} className="text-xs text-[#6B6B68] hover:text-[#0A0A0A] underline">{r.isActive ? 'dezactivează' : 'activează'}</button>
              <button onClick={() => remove(r.id)} className="p-1 text-[#A8A8A4] hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
            </li>
          ))}
        </ul>

        {showNew && (
          <div className="mt-3 p-3 bg-[#FAFAF8]/40 border border-[#E8E8E4] rounded-xl space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <Label className="mb-1 block text-xs">Nume cotă *</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Normală" />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Procent *</Label>
                <Input type="number" min="0" step="0.5" value={draft.percent} onChange={(e) => setDraft({ ...draft, percent: e.target.value })} />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Regim</Label>
                <Select value={draft.regime} onChange={(e) => setDraft({ ...draft, regime: e.target.value })}>
                  {REGIMES.map((rg) => <option key={rg.id} value={rg.id}>{rg.label}</option>)}
                </Select>
              </div>
            </div>
            <div>
              <Label className="mb-1 block text-xs">Descriere (opțional)</Label>
              <Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Taxare inversă conform Art. 331..." />
            </div>
            <label className="flex items-center gap-2 text-xs text-[#0A0A0A]">
              <input type="checkbox" checked={draft.isDefault} onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })} /> Cotă implicită
            </label>
            <div className="flex gap-2">
              <Button size="sm" disabled={busy || !draft.name} onClick={add}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvează'}</Button>
              <Button size="sm" variant="outline" onClick={() => setShowNew(false)}>Renunță</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
