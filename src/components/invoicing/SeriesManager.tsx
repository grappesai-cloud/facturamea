import { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Select } from '../ui/Select';
import { Plus, Star, Trash2, Loader2 } from 'lucide-react';

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
      {error && <p className="text-sm text-red-600">{error}</p>}
      {kinds.map((k) => {
        const list = series.filter((s) => s.kind === k.id);
        return (
          <Card key={k.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-[#0A0A0A]">{k.label}</h3>
                <Button size="sm" variant="outline" onClick={() => setShowNew(showNew === k.id ? null : k.id)}>
                  <Plus className="w-4 h-4 mr-1" /> Adaugă serie
                </Button>
              </div>

              {list.length === 0 ? (
                <p className="text-xs text-[#6B6B68]">Nicio serie. Cea implicită va fi creată automat la prima emitere.</p>
              ) : (
                <ul className="bg-white rounded-xl border border-[#E8E8E4] shadow-sm overflow-hidden divide-y divide-[#E8E8E4]">
                  {list.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#FAFAF8] transition-colors">
                      <span className="font-mono text-xs px-2 py-0.5 bg-[#FAFAF8] rounded-full text-[#0A0A0A]">{s.prefix}</span>
                      <span className="text-sm text-[#0A0A0A] font-medium flex-1 truncate">{s.name}</span>
                      <span className="text-xs text-[#6B6B68] hidden md:inline">scope: {s.scope ?? 'oricare'}</span>
                      <span className="text-xs text-[#6B6B68] tabular-nums">următor: {s.nextNumber}</span>
                      {s.isDefault ? (
                        <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-semibold flex items-center gap-1"><Star className="w-3 h-3 fill-amber-500" /> implicit</span>
                      ) : (
                        <button onClick={() => setDefault(s.id)} className="text-xs text-[#6B6B68] hover:text-[#0A0A0A] underline">setează implicit</button>
                      )}
                      <button onClick={() => removeSeries(s.id)} className="p-1 text-[#A8A8A4] hover:text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {showNew === k.id && (
                <div className="mt-3 p-3 bg-[#FAFAF8]/40 border border-[#E8E8E4] rounded-xl space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div>
                      <Label className="mb-1 block text-xs">Nume *</Label>
                      <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={`Serie ${k.label.toLowerCase()} TH`} />
                    </div>
                    <div>
                      <Label className="mb-1 block text-xs">Prefix *</Label>
                      <Input value={draft.prefix} onChange={(e) => setDraft({ ...draft, prefix: e.target.value.toUpperCase() })} placeholder="TH" maxLength={16} />
                    </div>
                    <div>
                      <Label className="mb-1 block text-xs">Următor #</Label>
                      <Input type="number" min="1" value={draft.nextNumber} onChange={(e) => setDraft({ ...draft, nextNumber: e.target.value })} />
                    </div>
                    <div>
                      <Label className="mb-1 block text-xs">Scope</Label>
                      <Select value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value })}>
                        <option value="">Oricare</option>
                        <option value="platform">Comenzi TH</option>
                        <option value="external">Clienți externi</option>
                      </Select>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-[#0A0A0A]">
                    <input type="checkbox" checked={draft.isDefault} onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })} />
                    Setează ca serie implicită
                  </label>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy || !draft.name || !draft.prefix} onClick={() => addNew(k.id)}>
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvează'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowNew(null)}>Renunță</Button>
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
