import { useEffect, useState } from 'react';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Select } from '../ui/Select';
import { Plus, Star, X, Loader2, Hash, Pencil } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';

const INVOICE_KINDS = [
  { id: 'factura', label: 'Facturi' },
  { id: 'proforma', label: 'Proforme' },
  { id: 'storno', label: 'Storno' },
  { id: 'chitanta', label: 'Chitanțe' },
];

interface Series { id: string; name: string; prefix: string; kind: string; nextNumber: number; isDefault: boolean; scope: string | null }

const SCOPE_LABEL = (scope: string | null) => {
  if (scope === 'platform') return 'Comenzi TH';
  if (scope === 'external') return 'Clienți externi';
  return 'Oricare';
};

// Display-only: build the next document number the way it will appear, e.g.
// `TH 0001`. The number is zero-padded to a sensible width for the preview only;
// nothing here is persisted (DB stores just the raw nextNumber).
const PREVIEW = (prefix: string, nextNumber: number | string) => {
  const p = (prefix || '').toString().trim();
  const n = parseInt((nextNumber ?? '').toString(), 10);
  const num = Number.isFinite(n) && n > 0 ? n : 1;
  const padded = String(num).padStart(4, '0');
  return p ? `${p} ${padded}` : padded;
};

const emptyDraft = { name: '', prefix: '', nextNumber: '1', scope: '', isDefault: true };

// `kinds` lets the same manager drive invoice series (default) or the transport
// order series (kind 'comanda', rendered on Setări comenzi).
export default function SeriesManager({ kinds = INVOICE_KINDS }: { kinds?: { id: string; label: string }[] } = {}) {
  const [series, setSeries] = useState<Series[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(emptyDraft);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

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
      setShowNew(null); setDraft(emptyDraft);
      await refresh();
    } catch { setError('Eroare conexiune'); } finally { setBusy(false); }
  };

  const saveEdit = async (id: string) => {
    setError(''); setBusy(true);
    try {
      const res = await fetch('/api/invoicing/series', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          name: editDraft.name,
          prefix: editDraft.prefix,
          nextNumber: parseInt(editDraft.nextNumber || '1', 10) || 1,
          scope: editDraft.scope || null,
          isDefault: editDraft.isDefault,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare'); return; }
      setEditId(null);
      await refresh();
    } catch { setError('Eroare conexiune'); } finally { setBusy(false); }
  };

  const setDefault = async (id: string) => {
    setBusy(true);
    await fetch('/api/invoicing/series', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, isDefault: true }) });
    await refresh(); setBusy(false);
  };

  const removeSeries = async (id: string) => {
    setConfirmDelete(null);
    const r = await fetch(`/api/invoicing/series?id=${id}`, { method: 'DELETE' });
    if (!r.ok) { const d = await r.json(); setError(d.error || 'Eroare'); return; }
    await refresh();
  };

  const startEdit = (s: Series) => {
    setConfirmDelete(null);
    setShowNew(null);
    setEditId(s.id);
    setEditDraft({
      name: s.name,
      prefix: s.prefix,
      nextNumber: String(s.nextNumber),
      scope: s.scope || '',
      isDefault: s.isDefault,
    });
  };

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-[13px] text-[#DC4B41] rounded-xl bg-[#DC4B41]/10 ring-1 ring-[#DC4B41]/20 px-3 py-2">{error}</p>
      )}
      {kinds.map((k) => {
        const list = series.filter((s) => s.kind === k.id);
        const shown = expanded[k.id] ? list : list.slice(0, 3);
        return (
          <section key={k.id} className="space-y-3">
            {/* Per-kind sub-heading */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="text-[15px] font-bold text-white">{k.label}</h3>
                {list.length > 0 && (
                  <span className="text-[12px] font-semibold text-[#8FA6BC] tabular-nums bg-white/5 rounded-full px-2 py-0.5">{list.length}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setEditId(null); setShowNew(showNew === k.id ? null : k.id); }}
                className="inline-flex items-center gap-1.5 shrink-0 rounded-full bg-white/10 hover:bg-white/15 text-white text-[13px] font-semibold px-3.5 py-2 transition-colors"
              >
                <Plus className="w-4 h-4" /> Adaugă serie
              </button>
            </div>

            {list.length === 0 && showNew !== k.id ? (
              <EmptyState
                icon={<Hash />}
                title="Fără serii de documente"
                description="Prima serie se creează automat la emiterea documentului."
              />
            ) : list.length > 0 ? (
              <ul className="space-y-3">
                {shown.map((s) => {
                  const confirming = confirmDelete === s.id;
                  const editing = editId === s.id;

                  if (editing) {
                    return (
                      <li key={s.id} className="rounded-2xl bg-white/[0.03] ring-1 ring-[#E1FB15]/25 p-5 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[13px] font-bold text-white">Editezi seria</p>
                          <SeriesPreviewPill prefix={editDraft.prefix} nextNumber={editDraft.nextNumber} />
                        </div>
                        <SeriesFields
                          draft={editDraft}
                          setDraft={setEditDraft}
                          kindLabel={k.label}
                        />
                        <label className="flex items-center gap-2 text-[13px] text-white cursor-pointer w-fit">
                          <input type="checkbox" className="accent-[#E1FB15] w-4 h-4" checked={editDraft.isDefault} onChange={(e) => setEditDraft({ ...editDraft, isDefault: e.target.checked })} />
                          Setează ca serie implicită
                        </label>
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            disabled={busy || !editDraft.name || !editDraft.prefix}
                            onClick={() => saveEdit(s.id)}
                            className="inline-flex items-center justify-center gap-2 bg-[#E1FB15] text-[#07090f] rounded-full font-bold px-5 py-2.5 text-[13.5px] hover:bg-[#D2EA0E] active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all"
                          >
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvează'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditId(null)}
                            className="inline-flex items-center justify-center rounded-full text-[13.5px] font-semibold text-[#A8BED2] hover:text-white hover:bg-white/5 px-4 py-2.5 transition-colors"
                          >
                            Renunță
                          </button>
                        </div>
                      </li>
                    );
                  }

                  return (
                    <li key={s.id} className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4 sm:p-5">
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Prefix pill */}
                        <span className="shrink-0 mt-0.5 inline-flex items-center justify-center min-w-[3.25rem] font-mono text-[12px] font-semibold px-2.5 py-1 bg-white/10 rounded-lg text-white">
                          {s.prefix}
                        </span>

                        {/* Name + meta */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[15px] text-white font-bold leading-tight break-words">{s.name}</span>
                            {s.isDefault && (
                              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 bg-[#E1FB15]/15 text-[#E1FB15] rounded-full font-bold whitespace-nowrap">
                                <Star className="w-3 h-3 fill-[#E1FB15]" /> Implicit
                              </span>
                            )}
                          </div>
                          <p className="text-[12px] text-[#8FA6BC] mt-1 break-words">
                            <span className="text-[#A8BED2]">Următorul: </span>
                            <span className="font-mono font-semibold text-white tabular-nums">{PREVIEW(s.prefix, s.nextNumber)}</span>
                            <span className="text-white/20"> · </span>
                            {SCOPE_LABEL(s.scope)}
                          </p>
                        </div>

                        {/* Actions: edit + delete (always visible, explicit targets) */}
                        <div className="shrink-0 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); startEdit(s); }}
                            className="w-9 h-9 grid place-items-center rounded-full bg-white/10 text-[#A8BED2] hover:bg-white/15 hover:text-white transition-colors"
                            title="Editează seria"
                            aria-label="Editează seria"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setConfirmDelete(confirming ? null : s.id); }}
                            className={`w-9 h-9 grid place-items-center rounded-full transition-colors ${confirming ? 'bg-[#DC4B41]/15 text-[#DC4B41]' : 'bg-white/10 text-[#A8BED2] hover:bg-[#DC4B41]/15 hover:text-[#DC4B41]'}`}
                            title="Șterge seria"
                            aria-label="Șterge seria"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {confirming ? (
                        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-[#DC4B41]/10 ring-1 ring-[#DC4B41]/20 px-3 py-2">
                          <span className="text-[12.5px] text-[#DC4B41] font-medium min-w-0">Ștergi seria „{s.name}”?</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <button type="button" onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }} className="text-[12.5px] font-semibold text-[#A8BED2] hover:text-white px-2.5 py-1">Anulează</button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); removeSeries(s.id); }} className="text-[12.5px] font-bold text-white bg-[#DC4B41] hover:bg-[#C23E35] rounded-full px-3 py-1.5">Șterge</button>
                          </div>
                        </div>
                      ) : !s.isDefault ? (
                        <div className="mt-3 pt-3 border-t border-white/[0.07]">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setDefault(s.id); }}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold rounded-full px-3 py-1.5 bg-white/5 text-[#A8BED2] hover:bg-white/10 hover:text-white transition-colors"
                          >
                            <Star className="w-3.5 h-3.5" /> Setează implicit
                          </button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
                {list.length > 3 && (
                  <li className="flex justify-center">
                    <button type="button" onClick={() => setExpanded((e) => ({ ...e, [k.id]: !e[k.id] }))} className="inline-flex items-center px-5 py-2.5 rounded-full bg-white/10 text-white text-[13px] font-semibold hover:bg-white/15 active:scale-95 transition-all">
                      {expanded[k.id] ? 'Arată mai puțin' : `Vezi toate (${list.length})`}
                    </button>
                  </li>
                )}
              </ul>
            ) : null}

            {showNew === k.id && (
              <div className="p-5 rounded-2xl bg-white/[0.03] ring-1 ring-white/10 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-bold text-white">Serie nouă · {k.label}</p>
                  <SeriesPreviewPill prefix={draft.prefix} nextNumber={draft.nextNumber} />
                </div>
                <SeriesFields draft={draft} setDraft={setDraft} kindLabel={k.label} />
                <label className="flex items-center gap-2 text-[13px] text-white cursor-pointer w-fit">
                  <input type="checkbox" className="accent-[#E1FB15] w-4 h-4" checked={draft.isDefault} onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })} />
                  Setează ca serie implicită
                </label>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busy || !draft.name || !draft.prefix}
                    onClick={() => addNew(k.id)}
                    className="inline-flex items-center justify-center gap-2 bg-[#E1FB15] text-[#07090f] rounded-full font-bold px-5 py-2.5 text-[13.5px] hover:bg-[#D2EA0E] active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Adaugă serie'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowNew(null); setDraft(emptyDraft); }}
                    className="inline-flex items-center justify-center rounded-full text-[13.5px] font-semibold text-[#A8BED2] hover:text-white hover:bg-white/5 px-4 py-2.5 transition-colors"
                  >
                    Renunță
                  </button>
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

// Live format preview pill, shown in the add/edit form header.
function SeriesPreviewPill({ prefix, nextNumber }: { prefix: string; nextNumber: string }) {
  return (
    <span className="inline-flex items-center gap-2 shrink-0 rounded-full bg-[#E1FB15]/10 ring-1 ring-[#E1FB15]/20 px-3 py-1.5">
      <span className="text-[11px] font-semibold text-[#A8BED2] uppercase tracking-wide">Următorul</span>
      <span className="font-mono text-[13px] font-bold text-[#E1FB15] tabular-nums">{PREVIEW(prefix, nextNumber)}</span>
    </span>
  );
}

// Shared field grid for both add and edit forms (helper text included).
function SeriesFields({
  draft,
  setDraft,
  kindLabel,
}: {
  draft: typeof emptyDraft;
  setDraft: (d: typeof emptyDraft) => void;
  kindLabel: string;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
      <div className="min-w-0">
        <Label className="mb-1.5 block text-[12.5px] font-medium text-[#A8BED2]">Nume *</Label>
        <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={`Serie ${kindLabel.toLowerCase()} TH`} />
        <p className="text-[11.5px] text-[#8FA6BC] mt-1.5">cum recunoști seria în liste</p>
      </div>
      <div className="min-w-0">
        <Label className="mb-1.5 block text-[12.5px] font-medium text-[#A8BED2]">Prefix *</Label>
        <Input value={draft.prefix} onChange={(e) => setDraft({ ...draft, prefix: e.target.value.toUpperCase() })} placeholder="TH" maxLength={16} />
        <p className="text-[11.5px] text-[#8FA6BC] mt-1.5">apare înaintea numărului</p>
      </div>
      <div className="min-w-0">
        <Label className="mb-1.5 block text-[12.5px] font-medium text-[#A8BED2]">Următor #</Label>
        <Input type="number" min="1" value={draft.nextNumber} onChange={(e) => setDraft({ ...draft, nextNumber: e.target.value })} />
        <p className="text-[11.5px] text-[#8FA6BC] mt-1.5">de la ce număr continuă</p>
      </div>
      <div className="min-w-0">
        <Label className="mb-1.5 block text-[12.5px] font-medium text-[#A8BED2]">Se aplică pe</Label>
        <Select value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value })}>
          <option value="">Oricare</option>
          <option value="platform">Comenzi TH</option>
          <option value="external">Clienți externi</option>
        </Select>
        <p className="text-[11.5px] text-[#8FA6BC] mt-1.5">pe ce facturi se aplică</p>
      </div>
    </div>
  );
}
