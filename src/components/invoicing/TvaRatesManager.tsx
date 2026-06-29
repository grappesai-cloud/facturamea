import { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Select } from '../ui/Select';
import { Plus, Star, X, Loader2, Percent, Power, Check } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';

interface Rate { id: string; name: string; percent: number; regime: string; description: string | null; isDefault: boolean; isActive: boolean; position: number }

const REGIMES = [
  { id: 'standard', label: 'Standard' },
  { id: 'reverse_charge', label: 'Taxare inversă' },
  { id: 'exempt', label: 'Scutit' },
  { id: 'tva_la_incasare', label: 'TVA la încasare' },
  { id: 'export_extra_eu', label: 'Export extra-UE' },
  { id: 'intra_eu', label: 'Livrare intra-UE' },
];

const REGIME_LABEL = (id: string) => REGIMES.find((r) => r.id === id)?.label ?? id;

const empty = { name: '', percent: '0', regime: 'standard', description: '', isDefault: false };

export default function TvaRatesManager() {
  const [rates, setRates] = useState<Rate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState(empty);
  const [showAll, setShowAll] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

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
    setConfirmDelete(null);
    const r = await fetch(`/api/invoicing/tva?id=${id}`, { method: 'DELETE' });
    if (!r.ok) { const d = await r.json(); setError(d.error || 'Eroare'); return; }
    await refresh();
  };

  const shown = showAll ? rates : rates.slice(0, 3);

  return (
    <Card className="bg-transparent border-0 shadow-none hover:shadow-none hover:translate-y-0 rounded-2xl">
      <CardContent className="p-0">
        {error && (
          <p className="text-[13px] text-[#DC4B41] mb-3 rounded-xl bg-[#DC4B41]/10 ring-1 ring-[#DC4B41]/20 px-3 py-2">{error}</p>
        )}

        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-[15px] font-bold text-white">Cote TVA</h3>
          <button
            type="button"
            onClick={() => setShowNew((s) => !s)}
            className="inline-flex items-center gap-1.5 shrink-0 rounded-full bg-white/10 hover:bg-white/15 text-white text-[13px] font-semibold px-3.5 py-2 transition-colors"
          >
            <Plus className="w-4 h-4" /> Adaugă cotă
          </button>
        </div>

        {rates.length === 0 && !showNew && (
          <EmptyState
            icon={<Percent />}
            title="Nicio cotă TVA definită"
            description="Adaugă o cotă; cele standard se aplică implicit."
          />
        )}

        {rates.length > 0 && (
          <ul className="space-y-3">
            {shown.map((r) => {
              const confirming = confirmDelete === r.id;
              return (
                <li
                  key={r.id}
                  className={`rounded-2xl bg-white/5 ring-1 ring-white/10 p-4 transition-colors ${!r.isActive ? 'opacity-55' : ''}`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Percent pill */}
                    <span className="shrink-0 mt-0.5 inline-flex items-center justify-center min-w-[3.25rem] font-mono text-[12px] font-semibold px-2.5 py-1 bg-white/10 rounded-lg text-white tabular-nums">
                      {r.percent}%
                    </span>

                    {/* Name + meta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[15px] text-white font-bold leading-tight break-words">{r.name}</span>
                        {r.isDefault && (
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 bg-[#E1FB15]/15 text-[#E1FB15] rounded-full font-bold whitespace-nowrap">
                            <Star className="w-3 h-3 fill-[#E1FB15]" /> Implicit
                          </span>
                        )}
                        {!r.isActive && (
                          <span className="text-[11px] px-2 py-0.5 bg-white/10 text-[#8FA6BC] rounded-full font-semibold whitespace-nowrap">Inactivă</span>
                        )}
                      </div>
                      <p className="text-[12px] text-[#8FA6BC] mt-0.5 break-words">
                        {REGIME_LABEL(r.regime)}{r.description ? ` · ${r.description}` : ''}
                      </p>
                    </div>

                    {/* Delete (always visible, explicit target) */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(confirming ? null : r.id); }}
                      className={`shrink-0 w-9 h-9 grid place-items-center rounded-full transition-colors ${confirming ? 'bg-[#DC4B41]/15 text-[#DC4B41]' : 'bg-white/10 text-[#A8BED2] hover:bg-[#DC4B41]/15 hover:text-[#DC4B41]'}`}
                      title="Șterge cota"
                      aria-label="Șterge cota"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Inline confirm OR action row */}
                  {confirming ? (
                    <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-[#DC4B41]/10 ring-1 ring-[#DC4B41]/20 px-3 py-2">
                      <span className="text-[12.5px] text-[#DC4B41] font-medium min-w-0">Ștergi cota „{r.name}”?</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button type="button" onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }} className="text-[12.5px] font-semibold text-[#A8BED2] hover:text-white px-2.5 py-1">Anulează</button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); remove(r.id); }} className="text-[12.5px] font-bold text-white bg-[#DC4B41] hover:bg-[#C23E35] rounded-full px-3 py-1.5">Șterge</button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center gap-2 pt-3 border-t border-white/[0.07]">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); if (!r.isDefault) patch(r.id, { isDefault: true }); }}
                        disabled={r.isDefault || busy}
                        className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold rounded-full px-3 py-1.5 transition-colors ${r.isDefault ? 'bg-[#E1FB15]/10 text-[#E1FB15] cursor-default' : 'bg-white/5 text-[#A8BED2] hover:bg-white/10 hover:text-white'}`}
                      >
                        <Star className={`w-3.5 h-3.5 ${r.isDefault ? 'fill-[#E1FB15]' : ''}`} />
                        {r.isDefault ? 'Implicit' : 'Setează implicit'}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); patch(r.id, { isActive: !r.isActive }); }}
                        disabled={busy}
                        className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold rounded-full px-3 py-1.5 transition-colors ${r.isActive ? 'bg-white/5 text-[#A8BED2] hover:bg-white/10 hover:text-white' : 'bg-[#2E9E6A]/15 text-[#2E9E6A] hover:bg-[#2E9E6A]/25'}`}
                      >
                        {r.isActive ? <Power className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                        {r.isActive ? 'Dezactivează' : 'Activează'}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {rates.length > 3 && (
          <div className="mt-3 flex justify-center">
            <button type="button" onClick={() => setShowAll((s) => !s)} className="inline-flex items-center px-5 py-2.5 rounded-full bg-white/10 text-white text-[13px] font-semibold hover:bg-white/15 active:scale-95 transition-all">
              {showAll ? 'Arată mai puțin' : `Vezi toate (${rates.length})`}
            </button>
          </div>
        )}

        {showNew && (
          <div className="mt-3 p-4 rounded-2xl bg-white/[0.03] ring-1 ring-white/10 space-y-3">
            <p className="text-[13px] font-bold text-white">Cotă nouă</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="min-w-0">
                <Label className="mb-1.5 block text-[12.5px] font-medium text-[#A8BED2]">Nume cotă *</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Normală" />
              </div>
              <div className="min-w-0">
                <Label className="mb-1.5 block text-[12.5px] font-medium text-[#A8BED2]">Procent *</Label>
                <Input type="number" min="0" step="0.5" value={draft.percent} onChange={(e) => setDraft({ ...draft, percent: e.target.value })} />
              </div>
              <div className="min-w-0">
                <Label className="mb-1.5 block text-[12.5px] font-medium text-[#A8BED2]">Regim</Label>
                <Select value={draft.regime} onChange={(e) => setDraft({ ...draft, regime: e.target.value })}>
                  {REGIMES.map((rg) => <option key={rg.id} value={rg.id}>{rg.label}</option>)}
                </Select>
              </div>
            </div>
            <div className="min-w-0">
              <Label className="mb-1.5 block text-[12.5px] font-medium text-[#A8BED2]">Descriere (opțional)</Label>
              <Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Taxare inversă conform Art. 331..." />
            </div>
            <label className="flex items-center gap-2 text-[13px] text-white cursor-pointer w-fit">
              <input type="checkbox" className="accent-[#E1FB15] w-4 h-4" checked={draft.isDefault} onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })} /> Cotă implicită
            </label>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={busy || !draft.name}
                onClick={add}
                className="inline-flex items-center justify-center gap-2 bg-[#E1FB15] text-[#07090f] rounded-full font-bold px-5 py-2.5 text-[13.5px] hover:bg-[#D2EA0E] active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Adaugă'}
              </button>
              <button
                type="button"
                onClick={() => { setShowNew(false); setDraft(empty); }}
                className="inline-flex items-center justify-center rounded-full text-[13.5px] font-semibold text-[#A8BED2] hover:text-white hover:bg-white/5 px-4 py-2.5 transition-colors"
              >
                Renunță
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
