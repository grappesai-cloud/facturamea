import { useEffect, useState } from 'react';

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
    case 'ignorat': return { label: 'Ignorată', cls: 'bg-white/10 text-[#9FB8CC]' };
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

  // Bulk import every not-yet-imported invoice. Kept SEPARATE from sync on
  // purpose — syncing only fetches from SPV; importing creates accounting rows.
  const importAll = async () => {
    const pending = rows.filter((r) => r.status !== 'importat' && r.status !== 'ignorat');
    if (pending.length === 0) return;
    setImportingAll(true); setMsg(null);
    let ok = 0, fail = 0;
    for (const row of pending) {
      try {
        const r = await fetch(`/api/anaf/inbox/${row.id}/import`, { method: 'POST' });
        const d = await r.json();
        if (d.ok) {
          ok++;
          setRows((prev) => prev.map((x) => x.id === row.id ? { ...x, status: 'importat', importedExpenseId: d.expenseId } : x));
        } else { fail++; }
      } catch { fail++; }
    }
    setImportingAll(false);
    setMsg({ kind: fail ? 'err' : 'ok', text: fail ? `${ok} importate, ${fail} eșuate.` : `${ok} facturi importate în Cheltuieli.` });
  };

  const pendingCount = rows.filter((r) => r.status !== 'importat' && r.status !== 'ignorat').length;

  useEffect(() => { /* initialRows already hydrated */ }, []);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-[#9FB8CC]">
          {rows.length === 0 ? 'Nicio factură primită încă.' : `${rows.length} facturi primite din SPV.`}
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          {pendingCount > 0 && (
            <button
              onClick={importAll}
              disabled={importingAll || syncing || !!busyId}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-white/10 text-white font-semibold text-[14px] hover:bg-white/15 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importingAll ? 'Se importă...' : `Importă toate (${pendingCount})`}
            </button>
          )}
          <button
            onClick={sync}
            disabled={syncing || importingAll || !connected}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#0A2238] font-bold text-[14px] hover:bg-[#D2EA0E] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncing ? 'Se sincronizează...' : 'Sincronizează din SPV'}
          </button>
        </div>
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-[14px] ${msg.kind === 'ok' ? 'bg-[#2E9E6A]/15 text-[#2E9E6A]' : 'bg-[#DC4B41]/15 text-[#DC4B41]'}`}>
          {msg.text}
        </div>
      )}

      <div className="bg-white/5 rounded-2xl overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-5 py-14 text-center text-[15px] text-[#9FB8CC]">
            {connected
              ? 'Apasă „Sincronizează din SPV” pentru a aduce facturile primite de la ANAF.'
              : 'Conectează firma la ANAF pentru a vedea facturile primite.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[15px]">
              <thead>
                <tr className="text-left text-[12px] uppercase tracking-wider text-[#7C9AB4] border-b border-white/10">
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
                    <tr key={row.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="px-5 py-4">
                        <button type="button" onClick={() => setSelected(row)} className="text-left text-white font-medium hover:text-[#E1FB15] transition-colors">
                          {row.supplierName || row.fromCif || 'Furnizor necunoscut'}
                        </button>
                        {row.fromCif && row.supplierName && (
                          <span className="block text-[13px] text-[#7C9AB4]">CIF {row.fromCif}</span>
                        )}
                      </td>
                      <td className="px-5 py-4 font-mono text-[14px] text-[#9FB8CC]">{row.detail || row.anafMsgId}</td>
                      <td className="px-5 py-4 text-[#9FB8CC]">{fmtDate(row.issueDate || row.receivedAt)}</td>
                      <td className="px-5 py-4 text-right font-semibold text-white tabular-nums">
                        {row.totalCents != null ? ron(row.totalCents, row.currency || 'RON') : '-'}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[13px] font-medium ${pill.cls}`}>{pill.label}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSelected(row)}
                            className="px-4 py-2.5 inline-flex items-center rounded-full bg-white/10 text-white hover:bg-white/15 text-[14px] font-semibold whitespace-nowrap"
                          >
                            Detalii
                          </button>
                          <a
                            href={`/api/anaf/inbox/${row.id}/download`}
                            className="px-4 py-2.5 inline-flex items-center rounded-full bg-white/10 text-white hover:bg-white/15 text-[14px] font-semibold whitespace-nowrap"
                          >
                            Descarcă XML
                          </a>
                          {imported ? (
                            <a
                              href="/app/cheltuieli"
                              className="px-4 py-2.5 inline-flex items-center rounded-full bg-[#2E9E6A]/15 text-[#2E9E6A] text-[14px] font-semibold whitespace-nowrap"
                            >
                              Vezi cheltuiala
                            </a>
                          ) : (
                            <button
                              onClick={() => importExpense(row)}
                              disabled={busyId === row.id}
                              className="px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#0A2238] text-[14px] font-bold hover:bg-[#D2EA0E] disabled:opacity-50 whitespace-nowrap"
                            >
                              {busyId === row.id ? 'Se importă...' : 'Importă ca cheltuială'}
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
                      <button type="button" onClick={() => setShowAll((s) => !s)} className="mx-auto w-fit flex items-center px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#0A2238] text-[13.5px] font-semibold hover:bg-[#D2EA0E] active:scale-95 transition-all">
                        {showAll ? 'Arată mai puțin' : `Vezi toate (${rows.length})`}
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-[90] bg-[#0A2238]/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={() => setSelected(null)}>
          <div className="bg-[#0E2A45] w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl ring-1 ring-white/10 shadow-2xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12px] uppercase tracking-wider text-[#7C9AB4]">Factură primită</p>
                <h3 className="text-[18px] font-bold text-white mt-0.5 truncate">{selected.supplierName || selected.fromCif || 'Furnizor necunoscut'}</h3>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Închide" className="shrink-0 w-9 h-9 grid place-items-center rounded-full text-[#9FB8CC] hover:bg-white/10 hover:text-[#DC4B41] transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="px-6 py-5 space-y-3">
              {([
                ['Furnizor', selected.supplierName || '—'],
                ['CIF furnizor', selected.fromCif || '—'],
                ['Nr. mesaj SPV', selected.detail || selected.anafMsgId],
                ['Tip mesaj', selected.msgType || '—'],
                ['Data emiterii', fmtDate(selected.issueDate)],
                ['Data primirii', fmtDate(selected.receivedAt)],
                ['Total', selected.totalCents != null ? ron(selected.totalCents, selected.currency || 'RON') : '—'],
                ['Status', statusPill(selected.status).label],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-4 text-[14px]">
                  <span className="text-[#7C9AB4] shrink-0">{k}</span>
                  <span className="text-white font-medium text-right break-words">{v}</span>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-white/10 flex flex-wrap gap-2.5 justify-end">
              <a href={`/api/anaf/inbox/${selected.id}/download`} className="px-5 py-2.5 rounded-full bg-white/10 text-white text-[14px] font-semibold hover:bg-white/15">Descarcă XML</a>
              {selected.status === 'importat' ? (
                <a href="/app/cheltuieli" className="px-5 py-2.5 rounded-full bg-[#2E9E6A]/15 text-[#2E9E6A] text-[14px] font-semibold">Vezi cheltuiala</a>
              ) : (
                <button type="button" onClick={() => { importExpense(selected); setSelected(null); }} className="px-5 py-2.5 rounded-full bg-[#E1FB15] text-[#0A2238] text-[14px] font-bold hover:bg-[#D2EA0E]">Importă ca cheltuială</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
