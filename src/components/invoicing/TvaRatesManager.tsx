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
  const [showAll, setShowAll] = useState(false);

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
    <Card className="bg-white/5 border-0 shadow-none hover:shadow-none hover:translate-y-0 rounded-2xl">
      <CardContent className="p-4">
        {error && <p className="text-sm text-[#DC4B41] mb-2">{error}</p>}
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-white">Cote TVA</h3>
          <Button size="sm" variant="outline" className="rounded-full bg-white/10 text-white border-0 hover:bg-white/15 hover:border-0" onClick={() => setShowNew(!showNew)}><Plus className="w-4 h-4 mr-1" /> Adaugă cotă</Button>
        </div>

        <ul className="space-y-2">
          {(showAll ? rates : rates.slice(0, 3)).map((r) => (
            <li key={r.id} className={`flex items-center gap-3 p-4 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors ${!r.isActive ? 'opacity-50' : ''}`}>
              <span className="font-mono text-xs px-2 py-0.5 bg-white/10 rounded-full text-white tabular-nums w-14 text-center">{r.percent}%</span>
              <span className="text-[15px] text-white font-bold">{r.name}</span>
              {r.description && <span className="text-xs text-[#9FB8CC] hidden md:inline flex-1 truncate">{r.description}</span>}
              {!r.description && <span className="flex-1" />}
              {r.isDefault ? (
                <span className="text-xs px-2 py-0.5 bg-[#E8A33C]/15 text-[#E8A33C] rounded-full font-semibold flex items-center gap-1"><Star className="w-3 h-3 fill-[#E8A33C]" /> implicit</span>
              ) : (
                <button onClick={() => patch(r.id, { isDefault: true })} className="text-xs text-[#9FB8CC] hover:text-white underline">implicit</button>
              )}
              <button onClick={() => patch(r.id, { isActive: !r.isActive })} className="text-xs text-[#9FB8CC] hover:text-white underline">{r.isActive ? 'dezactivează' : 'activează'}</button>
              <button onClick={() => remove(r.id)} className="w-9 h-9 rounded-full bg-white/10 grid place-items-center text-[#9FB8CC] hover:bg-white/15 hover:text-[#DC4B41]"><Trash2 className="w-3.5 h-3.5" /></button>
            </li>
          ))}
        </ul>
        {rates.length > 3 && (
          <button type="button" onClick={() => setShowAll((s) => !s)} className="mt-3 mx-auto w-fit flex items-center px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#0A2238] text-[13.5px] font-semibold hover:bg-[#D2EA0E] active:scale-95 transition-all">
            {showAll ? 'Arată mai puțin' : `Vezi toate (${rates.length})`}
          </button>
        )}

        {showNew && (
          <div className="mt-3 p-4 bg-white/5 rounded-2xl space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <Label className="mb-1.5 block text-[13px] font-medium text-[#9FB8CC]">Nume cotă *</Label>
                <Input className="bg-white/10 border-0 text-white placeholder:text-[#7C9AB4] hover:border-0 focus:border-0 focus:ring-2 focus:ring-[#E1FB15]/40" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Normală" />
              </div>
              <div>
                <Label className="mb-1.5 block text-[13px] font-medium text-[#9FB8CC]">Procent *</Label>
                <Input className="[color-scheme:dark] bg-white/10 border-0 text-white placeholder:text-[#7C9AB4] hover:border-0 focus:border-0 focus:ring-2 focus:ring-[#E1FB15]/40" type="number" min="0" step="0.5" value={draft.percent} onChange={(e) => setDraft({ ...draft, percent: e.target.value })} />
              </div>
              <div>
                <Label className="mb-1.5 block text-[13px] font-medium text-[#9FB8CC]">Regim</Label>
                <Select className="[color-scheme:dark] bg-white/10 border-0 text-white hover:border-0 focus:border-0 focus:ring-2 focus:ring-[#E1FB15]/40" value={draft.regime} onChange={(e) => setDraft({ ...draft, regime: e.target.value })}>
                  {REGIMES.map((rg) => <option key={rg.id} value={rg.id}>{rg.label}</option>)}
                </Select>
              </div>
            </div>
            <div>
              <Label className="mb-1.5 block text-[13px] font-medium text-[#9FB8CC]">Descriere (opțional)</Label>
              <Input className="bg-white/10 border-0 text-white placeholder:text-[#7C9AB4] hover:border-0 focus:border-0 focus:ring-2 focus:ring-[#E1FB15]/40" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Taxare inversă conform Art. 331..." />
            </div>
            <label className="flex items-center gap-2 text-xs text-white">
              <input type="checkbox" checked={draft.isDefault} onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })} /> Cotă implicită
            </label>
            <div className="flex gap-2">
              <Button size="sm" className="rounded-full bg-[#E1FB15] text-[#0A2238] hover:bg-[#D2EA0E] active:scale-100" disabled={busy || !draft.name} onClick={add}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvează'}</Button>
              <Button size="sm" variant="outline" className="rounded-full bg-white/10 text-white border-0 hover:bg-white/15 hover:border-0" onClick={() => setShowNew(false)}>Renunță</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
