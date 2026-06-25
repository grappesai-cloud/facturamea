import { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Select } from '../ui/Select';
import { Plus, Star, X, Loader2 } from 'lucide-react';

const INVOICE_KINDS = [
  { id: 'factura', label: 'Facturi' },
  { id: 'proforma', label: 'Proforme' },
  { id: 'storno', label: 'Storno' },
  { id: 'chitanta', label: 'Chitanțe' },
];

interface Series { id: string; name: string; prefix: string; kind: string; nextNumber: number; isDefault: boolean; scope: string | null }

// `kinds` lets the same manager drive invoice series (default) or the transport
// order series (kind 'comanda', rendered on Setări comenzi).
export default function SeriesManager({ kinds = INVOICE_KINDS }: { kinds?: { id: string; label: string }[] } = {}) {
  const [series, setSeries] = useState<Series[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', prefix: '', nextNumber: '1', scope: '', isDefault: true });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const refresh = async () => {
    const r = await fetch('/api/invoicing/series');
    const d = await r.json();
    setSeries(d.results || []);
  };
  useEffect(() => { refresh(); }, []);

  const addNew = async (kind: string) => {
    setError(''); setBusy(true);
    try {
      const res = await fetch('/api/invoicing/series', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, kind, nextNumber: parseInt(draft.nextNumber || '1', 10) || 1, scope: draft.scope || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare'); return; }
      setShowNew(null); setDraft({ name: '', prefix: '', nextNumber: '1', scope: '', isDefault: true });
      await refresh();
    } catch { setError('Eroare conexiune'); } finally { setBusy(false); }
  };

  const setDefault = async (id: string) => {
    setBusy(true);
    await fetch('/api/invoicing/series', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, isDefault: true }) });
    await refresh(); setBusy(false);
  };

  const removeSeries = async (id: string) => {
    if (!confirm('Sigur ștergi seria?')) return;
    const r = await fetch(`/api/invoicing/series?id=${id}`, { method: 'DELETE' });
    if (!r.ok) { const d = await r.json(); setError(d.error || 'Eroare'); return; }
    await refresh();
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-[#DC4B41]">{error}</p>}
      {kinds.map((k) => {
        const list = series.filter((s) => s.kind === k.id);
        return (
          <Card key={k.id} className="bg-white/5 border-0 shadow-none hover:shadow-none hover:translate-y-0 rounded-2xl">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-white">{k.label}</h3>
                <Button size="sm" variant="outline" className="rounded-full bg-white/10 text-white border-0 hover:bg-white/15 hover:border-0" onClick={() => setShowNew(showNew === k.id ? null : k.id)}>
                  <Plus className="w-4 h-4 mr-1" /> Adaugă serie
                </Button>
              </div>

              {list.length === 0 ? (
                <p className="text-xs text-[#9FB8CC]">Nicio serie. Cea implicită va fi creată automat la prima emitere.</p>
              ) : (
                <ul className="space-y-2">
                  {(expanded[k.id] ? list : list.slice(0, 3)).map((s) => (
                    <li key={s.id} className="group flex items-center gap-3 p-4 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors">
                      <span className="font-mono text-xs px-2 py-0.5 bg-white/10 rounded-full text-white">{s.prefix}</span>
                      <span className="text-[15px] text-white font-bold flex-1 truncate">{s.name}</span>
                      <span className="text-xs text-[#9FB8CC] hidden md:inline">scope: {s.scope ?? 'oricare'}</span>
                      <span className="text-xs text-[#9FB8CC] tabular-nums">următor: {s.nextNumber}</span>
                      {s.isDefault ? (
                        <span className="text-xs px-2 py-0.5 bg-[#E8A33C]/15 text-[#E8A33C] rounded-full font-semibold flex items-center gap-1"><Star className="w-3 h-3 fill-[#E8A33C]" /> implicit</span>
                      ) : (
                        <button onClick={() => setDefault(s.id)} className="text-xs text-[#9FB8CC] hover:text-white underline opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">setează implicit</button>
                      )}
                      <button onClick={() => removeSeries(s.id)} className="w-9 h-9 rounded-full bg-white/10 grid place-items-center text-[#9FB8CC] hover:bg-[#DC4B41]/15 hover:text-[#DC4B41] opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity" title="Șterge">
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                  {list.length > 3 && (
                    <li>
                      <button type="button" onClick={() => setExpanded((e) => ({ ...e, [k.id]: !e[k.id] }))} className="mt-1 mx-auto w-fit flex items-center px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#0A2238] text-[13.5px] font-semibold hover:bg-[#D2EA0E] active:scale-95 transition-all">
                        {expanded[k.id] ? 'Arată mai puțin' : `Vezi toate (${list.length})`}
                      </button>
                    </li>
                  )}
                </ul>
              )}

              {showNew === k.id && (
                <div className="mt-3 p-4 bg-white/5 rounded-2xl space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div>
                      <Label className="mb-1.5 block text-[13px] font-medium text-[#9FB8CC]">Nume *</Label>
                      <Input className="bg-white/10 border-0 text-white placeholder:text-[#7C9AB4] hover:border-0 focus:border-0 focus:ring-2 focus:ring-[#E1FB15]/40" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={`Serie ${k.label.toLowerCase()} TH`} />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-[13px] font-medium text-[#9FB8CC]">Prefix *</Label>
                      <Input className="bg-white/10 border-0 text-white placeholder:text-[#7C9AB4] hover:border-0 focus:border-0 focus:ring-2 focus:ring-[#E1FB15]/40" value={draft.prefix} onChange={(e) => setDraft({ ...draft, prefix: e.target.value.toUpperCase() })} placeholder="TH" maxLength={16} />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-[13px] font-medium text-[#9FB8CC]">Următor #</Label>
                      <Input className="[color-scheme:dark] bg-white/10 border-0 text-white placeholder:text-[#7C9AB4] hover:border-0 focus:border-0 focus:ring-2 focus:ring-[#E1FB15]/40" type="number" min="1" value={draft.nextNumber} onChange={(e) => setDraft({ ...draft, nextNumber: e.target.value })} />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-[13px] font-medium text-[#9FB8CC]">Scope</Label>
                      <Select className="[color-scheme:dark] bg-white/10 border-0 text-white hover:border-0 focus:border-0 focus:ring-2 focus:ring-[#E1FB15]/40" value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value })}>
                        <option value="">Oricare</option>
                        <option value="platform">Comenzi TH</option>
                        <option value="external">Clienți externi</option>
                      </Select>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-white">
                    <input type="checkbox" checked={draft.isDefault} onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })} />
                    Setează ca serie implicită
                  </label>
                  <div className="flex gap-2">
                    <Button size="sm" className="rounded-full bg-[#E1FB15] text-[#0A2238] hover:bg-[#D2EA0E] active:scale-100" disabled={busy || !draft.name || !draft.prefix} onClick={() => addNew(k.id)}>
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvează'}
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-full bg-white/10 text-white border-0 hover:bg-white/15 hover:border-0" onClick={() => setShowNew(null)}>Renunță</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
