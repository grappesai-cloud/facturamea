import { useEffect, useState } from 'react';
import { parseEfacturaXml, type EfacturaParsed } from './efacturaXml';

interface InboxRow {
  id: string;
  anafMsgId: string;
  msgType: string | null;
  fromCif: string | null;
  supplierName: string | null;
  detail: string | null;
  totalCents: number | null;
  currency: string | null;
  issueDate: string | null;
  status: string;
  importedExpenseId: string | null;
  receivedAt: string | null;
}

interface Props {
  initialRows: InboxRow[];
  connected: boolean;
}

const ron = (cents: number | null, currency = 'RON') =>
  new Intl.NumberFormat('ro-RO', { style: 'currency', currency: currency || 'RON' }).format((cents || 0) / 100);

const fmtDate = (s: string | null) => {
  if (!s) return '-';
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest' });
};

function statusPill(status: string) {
  switch (status) {
    case 'importat': return { label: 'Importată', cls: 'bg-[#2E9E6A]/15 text-[#2E9E6A]' };
    case 'ignorat': return { label: 'Ignorată', cls: 'bg-white/10 text-[#A8BED2]' };
    default: return { label: 'Nouă', cls: 'bg-[#34A0A4]/15 text-[#34A0A4]' };
  }
}

export default function InboxManager({ initialRows, connected }: Props) {
  const [rows, setRows] = useState<InboxRow[]>(initialRows || []);
  const [syncing, setSyncing] = useState(false);
  const [importingAll, setImportingAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<InboxRow | null>(null);

  const refresh = async () => {
    try {
      const r = await fetch('/api/anaf/inbox');
      const d = await r.json();
      if (d.ok && Array.isArray(d.rows)) setRows(d.rows);
    } catch { /* keep current */ }
  };

  const sync = async () => {
    setSyncing(true); setMsg(null);
    try {
      const r = await fetch('/api/anaf/inbox/sync', { method: 'POST' });
      const d = await r.json();
      if (d.ok) {
        setMsg({ kind: 'ok', text: `Sincronizare reușită: ${d.synced} facturi din SPV.` });
        await refresh();
      } else {
        setMsg({ kind: 'err', text: d.error || 'Nu s-a putut sincroniza.' });
      }
    } catch {
      setMsg({ kind: 'err', text: 'Eroare de rețea.' });
    } finally {
      setSyncing(false);
    }
  };

  const importExpense = async (row: InboxRow) => {
    setBusyId(row.id); setMsg(null);
    try {
      const r = await fetch(`/api/anaf/inbox/${row.id}/import`, { method: 'POST' });
      const d = await r.json();
      if (d.ok) {
        setMsg({ kind: 'ok', text: 'Factura a fost importată în Cheltuieli.' });
        setRows((prev) => prev.map((x) => x.id === row.id ? { ...x, status: 'importat', importedExpenseId: d.expenseId } : x));
      } else {
        setMsg({ kind: 'err', text: d.error || 'Nu s-a putut importa.' });
      }
    } catch {
      setMsg({ kind: 'err', text: 'Eroare de rețea.' });
    } finally {
      setBusyId(null);
    }
  };

  // Auto-fetch from SPV on open (once per browser session, only when connected) so
  // new supplier invoices appear without pressing "Sincronizează".
  useEffect(() => {
    if (!connected) return;
    try {
      if (sessionStorage.getItem('anaf-autosynced')) return;
      sessionStorage.setItem('anaf-autosynced', '1');
    } catch { /* sessionStorage unavailable — still sync once */ }
    sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const newCount = rows.filter((r) => r.status === 'nou').length;

  // When a row is opened, fetch its raw e-Factura XML and parse it IN THE BROWSER
  // into a full readable invoice (supplier, lines, VAT, totals). No backend endpoint
  // needed beyond the existing /download. Falls back to the summary if no XML.
  const [parsed, setParsed] = useState<EfacturaParsed | null>(null);
  const [loadingXml, setLoadingXml] = useState(false);
  useEffect(() => {
    setParsed(null);
    if (!selected) return;
    let cancelled = false;
    setLoadingXml(true);
    fetch(`/api/anaf/inbox/${selected.id}/download`)
      .then((r) => (r.ok ? r.text() : ''))
      .then((xml) => { if (!cancelled && xml && xml.includes('<')) setParsed(parseEfacturaXml(xml)); })
      .catch(() => { /* keep summary */ })
      .finally(() => { if (!cancelled) setLoadingXml(false); });
    return () => { cancelled = true; };
  }, [selected]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-[#A8BED2]">
          {rows.length === 0 ? 'Nicio factură primită încă.' : `${rows.length} facturi primite din SPV.`}
        </p>
        <button
          onClick={sync}
          disabled={syncing || !connected}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#07090f] font-bold text-[14px] hover:bg-[#D2EA0E] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {syncing ? 'Se sincronizează...' : 'Sincronizează din SPV'}
        </button>
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-[14px] ${msg.kind === 'ok' ? 'bg-[#2E9E6A]/15 text-[#2E9E6A]' : 'bg-[#DC4B41]/15 text-[#DC4B41]'}`}>
          {msg.text}
        </div>
      )}

      <div className="bg-white/5 rounded-2xl overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-5 py-14 text-center text-[15px] text-[#A8BED2]">
            {connected
              ? 'Apasă „Sincronizează din SPV” pentru a aduce facturile primite de la ANAF.'
              : 'Conectează firma la ANAF pentru a vedea facturile primite.'}
          </div>
        ) : (
          <>
          {/* Mobile: stacked cards (nice on phones, no horizontal scroll) */}
          <div className="sm:hidden divide-y divide-white/5">
            {(showAll ? rows : rows.slice(0, 3)).map((row) => {
              const pill = statusPill(row.status);
              const imported = row.status === 'importat';
              return (
                <div key={row.id} onClick={() => setSelected(row)} role="button" tabIndex={0} className="p-4 cursor-pointer hover:bg-white/[0.03] transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-left min-w-0">
                      <span className="block text-[15px] font-semibold text-white truncate">{row.supplierName || row.fromCif || 'Furnizor necunoscut'}</span>
                      <span className="block text-[12.5px] text-[#8FA6BC]">{row.fromCif ? `CIF ${row.fromCif} · ` : ''}{fmtDate(row.issueDate || row.receivedAt)}</span>
                    </div>
                    <span className={`shrink-0 px-2.5 py-1 rounded-full text-[12px] font-medium ${pill.cls}`}>{pill.label}</span>
                  </div>
                  <div className="flex items-end justify-between gap-3 mt-2">
                    <p className="text-[20px] font-bold text-white tabular-nums">{row.totalCents != null ? ron(row.totalCents, row.currency || 'RON') : '-'}</p>
                    {imported ? (
                      <a href="/app/cheltuieli" onClick={(e) => e.stopPropagation()} className="shrink-0 px-4 py-2.5 rounded-full bg-[#2E9E6A]/15 text-[#2E9E6A] text-[14px] font-semibold">Vezi cheltuiala</a>
                    ) : (
                      <button onClick={(e) => { e.stopPropagation(); importExpense(row); }} disabled={busyId === row.id} className="shrink-0 px-4 py-2.5 rounded-full bg-[#E1FB15] text-[#07090f] text-[14px] font-bold hover:bg-[#D2EA0E] disabled:opacity-50">{busyId === row.id ? 'Se importă…' : 'Confirmă și importă'}</button>
                    )}
                  </div>
                </div>
              );
            })}
            {rows.length > 3 && (
              <div className="p-4">
                <button type="button" onClick={() => setShowAll((s) => !s)} className="w-full px-5 py-2.5 rounded-full bg-white/10 text-white text-[14px] font-semibold">{showAll ? 'Arată mai puțin' : `Vezi toate (${rows.length})`}</button>
              </div>
            )}
          </div>
          {/* Desktop: table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-[15px]">
              <thead>
                <tr className="text-left text-[12px] uppercase tracking-wider text-[#8FA6BC] border-b border-white/10">
                  <th className="px-5 py-3 font-medium">Furnizor</th>
                  <th className="px-5 py-3 font-medium">Nr. mesaj</th>
                  <th className="px-5 py-3 font-medium">Data</th>
                  <th className="px-5 py-3 font-medium text-right">Total</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Acțiuni</th>
                </tr>
              </thead>
              <tbody>
                {(showAll ? rows : rows.slice(0, 3)).map((row) => {
                  const pill = statusPill(row.status);
                  const imported = row.status === 'importat';
                  return (
                    <tr key={row.id} onClick={() => setSelected(row)} className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer">
                      <td className="px-5 py-4">
                        <span className="text-white font-medium">{row.supplierName || row.fromCif || 'Furnizor necunoscut'}</span>
                        {row.fromCif && row.supplierName && (
                          <span className="block text-[13px] text-[#8FA6BC]">CIF {row.fromCif}</span>
                        )}
                      </td>
                      <td className="px-5 py-4 font-mono text-[14px] text-[#A8BED2]">{row.detail || row.anafMsgId}</td>
                      <td className="px-5 py-4 text-[#A8BED2]">{fmtDate(row.issueDate || row.receivedAt)}</td>
                      <td className="px-5 py-4 text-right font-semibold text-white tabular-nums">
                        {row.totalCents != null ? ron(row.totalCents, row.currency || 'RON') : '-'}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[13px] font-medium ${pill.cls}`}>{pill.label}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {imported ? (
                            <a
                              href="/app/cheltuieli"
                              onClick={(e) => e.stopPropagation()}
                              className="px-4 py-2.5 inline-flex items-center rounded-full bg-[#2E9E6A]/15 text-[#2E9E6A] text-[14px] font-semibold whitespace-nowrap"
                            >
                              Vezi cheltuiala
                            </a>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); importExpense(row); }}
                              disabled={busyId === row.id}
                              className="px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#07090f] text-[14px] font-bold hover:bg-[#D2EA0E] disabled:opacity-50 whitespace-nowrap"
                            >
                              {busyId === row.id ? 'Se importă...' : 'Confirmă și importă'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rows.length > 3 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-4">
                      <button type="button" onClick={() => setShowAll((s) => !s)} className="mx-auto w-fit flex items-center px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#07090f] text-[13.5px] font-semibold hover:bg-[#D2EA0E] active:scale-95 transition-all">
                        {showAll ? 'Arată mai puțin' : `Vezi toate (${rows.length})`}
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={() => setSelected(null)}>
          <div className="bg-[#07090f] w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl ring-1 ring-white/10 shadow-2xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12px] uppercase tracking-wider text-[#8FA6BC]">Factură primită</p>
                <h3 className="text-[18px] font-bold text-white mt-0.5 truncate">{selected.supplierName || selected.fromCif || 'Furnizor necunoscut'}</h3>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Închide" className="shrink-0 fm-close-btn"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="px-6 py-5">
              {loadingXml && !parsed && (
                <p className="text-[14px] text-[#8FA6BC] py-2">Se încarcă factura…</p>
              )}

              {parsed ? (
                <div className="space-y-5">
                  {/* Parties */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl bg-white/5 p-3.5">
                      <p className="text-[11px] uppercase tracking-wider text-[#8FA6BC] mb-1">Furnizor</p>
                      <p className="text-[15px] font-semibold text-white">{parsed.supplier.name || selected.supplierName || '—'}</p>
                      {parsed.supplier.cui && <p className="text-[13px] text-[#A8BED2]">CIF {parsed.supplier.cui}</p>}
                      {parsed.supplier.address && <p className="text-[13px] text-[#8FA6BC] mt-0.5">{parsed.supplier.address}</p>}
                    </div>
                    <div className="rounded-xl bg-white/5 p-3.5">
                      <p className="text-[11px] uppercase tracking-wider text-[#8FA6BC] mb-1">Cumpărător</p>
                      <p className="text-[15px] font-semibold text-white">{parsed.buyer.name || '—'}</p>
                      {parsed.buyer.cui && <p className="text-[13px] text-[#A8BED2]">CIF {parsed.buyer.cui}</p>}
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13.5px]">
                    {parsed.number && <span className="text-[#A8BED2]">Nr. <span className="text-white font-semibold">{parsed.number}</span></span>}
                    {parsed.issueDate && <span className="text-[#A8BED2]">Emisă <span className="text-white font-medium">{fmtDate(parsed.issueDate)}</span></span>}
                    {parsed.dueDate && <span className="text-[#A8BED2]">Scadență <span className="text-white font-medium">{fmtDate(parsed.dueDate)}</span></span>}
                  </div>

                  {/* Lines */}
                  {parsed.lines.length > 0 && (
                    <div className="rounded-xl bg-white/5 overflow-hidden divide-y divide-white/5">
                      {parsed.lines.map((l, i) => (
                        <div key={i} className="p-3.5 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[14.5px] text-white">{l.name || `Linia ${i + 1}`}</p>
                            <p className="text-[12.5px] text-[#8FA6BC]">{l.qty} {l.unit ? '' : 'buc'} × {ron(Math.round(l.unitPrice * 100), parsed.currency)}{l.vatPct != null ? ` · TVA ${l.vatPct}%` : ''}</p>
                          </div>
                          <p className="text-[14.5px] font-semibold text-white tabular-nums shrink-0">{ron(Math.round(l.lineTotal * 100), parsed.currency)}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Totals */}
                  <div className="rounded-xl bg-white/5 p-3.5 space-y-1.5 text-[14px]">
                    <div className="flex justify-between"><span className="text-[#A8BED2]">Subtotal</span><span className="text-white tabular-nums">{ron(Math.round(parsed.subtotal * 100), parsed.currency)}</span></div>
                    <div className="flex justify-between"><span className="text-[#A8BED2]">TVA</span><span className="text-white tabular-nums">{ron(Math.round(parsed.vatTotal * 100), parsed.currency)}</span></div>
                    <div className="flex justify-between pt-1.5 border-t border-white/10"><span className="font-semibold text-white">Total</span><span className="text-[17px] font-bold text-white tabular-nums">{ron(Math.round(parsed.total * 100), parsed.currency)}</span></div>
                  </div>
                  {parsed.note && <p className="text-[13px] text-[#8FA6BC]">{parsed.note}</p>}
                </div>
              ) : !loadingXml && (
                /* Fallback: no XML available — show the summary fields. */
                <div className="space-y-3">
                  {([
                    ['Furnizor', selected.supplierName || '—'],
                    ['CIF furnizor', selected.fromCif || '—'],
                    ['Nr. mesaj SPV', selected.detail || selected.anafMsgId],
                    ['Data emiterii', fmtDate(selected.issueDate)],
                    ['Data primirii', fmtDate(selected.receivedAt)],
                    ['Total', selected.totalCents != null ? ron(selected.totalCents, selected.currency || 'RON') : '—'],
                    ['Status', statusPill(selected.status).label],
                  ] as [string, string][]).map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-4 text-[14px]">
                      <span className="text-[#8FA6BC] shrink-0">{k}</span>
                      <span className="text-white font-medium text-right break-words">{v}</span>
                    </div>
                  ))}
                  <p className="text-[12.5px] text-[#8FA6BC] pt-1">Detaliile complete (linii, TVA) apar după ce factura e descărcată din SPV.</p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-white/10 flex flex-wrap gap-2.5 justify-end">
              <a href={`/api/anaf/inbox/${selected.id}/download`} className="px-5 py-2.5 rounded-full bg-white/10 text-white text-[14px] font-semibold hover:bg-white/15">Descarcă XML</a>
              {selected.status === 'importat' ? (
                <a href="/app/cheltuieli" className="px-5 py-2.5 rounded-full bg-[#2E9E6A]/15 text-[#2E9E6A] text-[14px] font-semibold">Vezi cheltuiala</a>
              ) : (
                <button type="button" onClick={() => { importExpense(selected); setSelected(null); }} className="px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#07090f] text-[14px] font-bold hover:bg-[#D2EA0E]">Confirmă și importă</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
