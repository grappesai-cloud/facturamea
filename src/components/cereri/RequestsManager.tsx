import { useEffect, useRef, useState } from 'react';

interface Req {
  id: string;
  title: string;
  note: string | null;
  status: string;
  responseNote: string | null;
  responseAttachmentUrl: string | null;
  responseAttachmentName: string | null;
  respondedAt: string | null;
  resolvedAt: string | null;
  createdAt: string | null;
  createdByName: string | null;
}

const fmt = (s: string | null) => {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', timeZone: 'Europe/Bucharest' });
};

export default function RequestsManager() {
  const [items, setItems] = useState<Req[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    try {
      const r = await fetch('/api/cereri');
      const d = await r.json();
      setItems(d.results || []);
    } catch { /* keep */ }
  };
  useEffect(() => { refresh(); }, []);

  const create = async () => {
    if (!title.trim()) { setError('Scrie ce ai nevoie.'); return; }
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/cereri', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, note }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Eroare'); return; }
      setTitle(''); setNote(''); setShowNew(false); await refresh();
    } catch { setError('Eroare de rețea.'); } finally { setBusy(false); }
  };

  const open = items.filter((r) => r.status !== 'resolved');
  const resolved = items.filter((r) => r.status === 'resolved');

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-[#DC4B41]">{error}</p>}

      <div className="flex justify-between items-center gap-3">
        <p className="text-[15px] text-[#A8BED2]">{open.length} {open.length === 1 ? 'cerere deschisă' : 'cereri deschise'}</p>
        <button onClick={() => setShowNew((v) => !v)} className="px-5 h-11 rounded-full bg-[#E1FB15] text-[#07090f] text-[14px] font-bold hover:bg-[#D2EA0E]">
          {showNew ? 'Renunță' : '+ Cerere nouă'}
        </button>
      </div>

      {showNew && (
        <div className="rounded-2xl bg-white/5 p-4 space-y-3">
          <div>
            <label className="block text-xs text-[#A8BED2] mb-1">Ce ai nevoie?</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex: Trimite bonul de combustibil de la OMV din 12.06"
              className="w-full rounded-xl bg-white/5 px-4 py-2.5 text-[14px] text-white border border-white/[0.12] focus:outline-none focus:border-[#E1FB15]/50 focus:ring-2 focus:ring-[#E1FB15]/30 hover:border-white/25 transition placeholder:text-[#8FA6BC]" />
          </div>
          <div>
            <label className="block text-xs text-[#A8BED2] mb-1">Detalii (opțional)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              className="w-full rounded-xl bg-white/5 px-4 py-2.5 text-[14px] text-white border border-white/[0.12] focus:outline-none focus:border-[#E1FB15]/50 focus:ring-2 focus:ring-[#E1FB15]/30 hover:border-white/25 transition placeholder:text-[#8FA6BC]" />
          </div>
          <button onClick={create} disabled={busy} className="px-5 h-11 rounded-full bg-[#E1FB15] text-[#07090f] text-[14px] font-bold hover:bg-[#D2EA0E] disabled:opacity-50">
            {busy ? 'Se trimite...' : 'Trimite cererea'}
          </button>
        </div>
      )}

      {open.length === 0 && resolved.length === 0 ? (
        <div className="rounded-2xl bg-white/5 p-8 text-center text-sm text-[#8FA6BC]">Nicio cerere încă. Cere clientului un document cu „Cerere nouă".</div>
      ) : (
        <ul className="space-y-2.5">
          {[...open, ...resolved].map((r) => <RequestRow key={r.id} r={r} onChanged={refresh} />)}
        </ul>
      )}
    </div>
  );
}

function RequestRow({ r, onChanged }: { r: Req; onChanged: () => void }) {
  const [respondOpen, setRespondOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const resolved = r.status === 'resolved';

  const submitResponse = async () => {
    const file = fileRef.current?.files?.[0] || null;
    if (!msg.trim() && !file) { setErr('Adaugă un mesaj sau un fișier.'); return; }
    setBusy(true); setErr('');
    try {
      let attUrl: string | null = null, attName: string | null = null;
      if (file) {
        const fd = new FormData();
        fd.append('file', file); fd.append('purpose', 'document');
        const up = await fetch('/api/upload/document', { method: 'POST', body: fd });
        const ud = await up.json();
        if (!up.ok) { setErr(ud.error || 'Încărcarea fișierului a eșuat.'); return; }
        attUrl = ud.url; attName = file.name;
      }
      const r2 = await fetch(`/api/cereri/${r.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responseNote: msg, responseAttachmentUrl: attUrl, responseAttachmentName: attName }),
      });
      const d2 = await r2.json();
      if (!r2.ok) { setErr(d2.error || 'Eroare'); return; }
      setRespondOpen(false); setMsg(''); onChanged();
    } catch { setErr('Eroare de rețea.'); } finally { setBusy(false); }
  };

  const resolve = async () => {
    setBusy(true);
    try {
      await fetch(`/api/cereri/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolve: true }) });
      onChanged();
    } catch { /* ignore */ } finally { setBusy(false); }
  };

  return (
    <li className={`rounded-2xl p-4 ${resolved ? 'bg-white/[0.03]' : 'bg-white/5'}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 shrink-0 w-2.5 h-2.5 rounded-full ${resolved ? 'bg-[#2E9E6A]' : 'bg-[#E8A33C]'}`}></span>
        <div className="min-w-0 flex-1">
          <p className={`text-[15.5px] font-semibold ${resolved ? 'text-[#A8BED2] line-through' : 'text-white'}`}>{r.title}</p>
          {r.note && <p className="text-[13.5px] text-[#A8BED2] mt-0.5">{r.note}</p>}
          <p className="text-[12px] text-[#8FA6BC] mt-1">{r.createdByName || 'Contabil'}{r.createdAt ? ` · ${fmt(r.createdAt)}` : ''}</p>

          {(r.responseNote || r.responseAttachmentUrl) && (
            <div className="mt-2.5 rounded-xl bg-[#34A0A4]/10 p-3">
              <p className="text-[12px] text-[#34A0A4] font-semibold mb-1">Răspuns{r.respondedAt ? ` · ${fmt(r.respondedAt)}` : ''}</p>
              {r.responseNote && <p className="text-[13.5px] text-white">{r.responseNote}</p>}
              {r.responseAttachmentUrl && (
                <a href={r.responseAttachmentUrl} target="_blank" rel="noreferrer" className="inline-block mt-1.5 text-[13px] text-[#D9ED92] hover:underline">
                  📎 {r.responseAttachmentName || 'fișier atașat'}
                </a>
              )}
            </div>
          )}

          {!resolved && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button onClick={() => setRespondOpen((v) => !v)} className="text-[13px] px-3 py-1.5 rounded-full bg-white/10 text-white hover:bg-white/15 font-semibold">
                {respondOpen ? 'Închide' : (r.responseNote ? 'Adaugă răspuns' : 'Răspunde')}
              </button>
              <button onClick={resolve} disabled={busy} className="text-[13px] px-3 py-1.5 rounded-full bg-[#2E9E6A]/15 text-[#2E9E6A] hover:bg-[#2E9E6A]/25 font-semibold disabled:opacity-50">
                Marchează rezolvat
              </button>
            </div>
          )}

          {respondOpen && !resolved && (
            <div className="mt-2.5 space-y-2">
              {err && <p className="text-[13px] text-[#DC4B41]">{err}</p>}
              <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={2} placeholder="Scrie un mesaj..."
                className="w-full rounded-xl bg-white/5 px-3 py-2 text-[14px] text-white border border-white/[0.12] focus:outline-none focus:border-[#E1FB15]/50 focus:ring-2 focus:ring-[#E1FB15]/30 hover:border-white/25 transition placeholder:text-[#8FA6BC]" />
              <input ref={fileRef} type="file" className="block w-full text-[13px] text-[#A8BED2] file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-white file:text-[13px]" />
              <button onClick={submitResponse} disabled={busy} className="px-4 h-10 rounded-full bg-[#E1FB15] text-[#07090f] text-[13.5px] font-bold hover:bg-[#D2EA0E] disabled:opacity-50">
                {busy ? 'Se trimite...' : 'Trimite răspunsul'}
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
