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
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('ro-RO');
};

function statusPill(status: string) {
  switch (status) {
    case 'importat': return { label: 'Importată', cls: 'bg-[#E7F7EC] text-[#15803D]' };
    case 'ignorat': return { label: 'Ignorată', cls: 'bg-[#F0F0EC] text-[#9A9A95]' };
    default: return { label: 'Nouă', cls: 'bg-[#EAF2FF] text-[#1D4ED8]' };
  }
}

export default function InboxManager({ initialRows, connected }: Props) {
  const [rows, setRows] = useState<InboxRow[]>(initialRows || []);
  const [syncing, setSyncing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

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

  useEffect(() => { /* initialRows already hydrated */ }, []);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-[#6B6B68]">
          {rows.length === 0 ? 'Nicio factură primită încă.' : `${rows.length} facturi primite din SPV.`}
        </p>
        <button
          onClick={sync}
          disabled={syncing || !connected}
          className="inline-flex items-center gap-2 px-5 h-12 rounded-xl bg-[#FF5C00] text-white text-[15px] font-semibold hover:bg-[#e65300] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {syncing ? 'Se sincronizează...' : 'Sincronizează din SPV'}
        </button>
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-[14px] ${msg.kind === 'ok' ? 'bg-[#E7F7EC] text-[#15803D]' : 'bg-[#FDECEC] text-[#B91C1C]'}`}>
          {msg.text}
        </div>
      )}

      <div className="bg-white border border-[#E8E8E4] rounded-2xl overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-5 py-14 text-center text-[15px] text-[#6B6B68]">
            {connected
              ? 'Apasă „Sincronizează din SPV” pentru a aduce facturile primite de la ANAF.'
              : 'Conectează firma la ANAF pentru a vedea facturile primite.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[15px]">
              <thead>
                <tr className="text-left text-[12px] uppercase tracking-wider text-[#8A8A85] border-b border-[#F0F0EC]">
                  <th className="px-5 py-3 font-medium">Furnizor</th>
                  <th className="px-5 py-3 font-medium">Nr. mesaj</th>
                  <th className="px-5 py-3 font-medium">Data</th>
                  <th className="px-5 py-3 font-medium text-right">Total</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Acțiuni</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const pill = statusPill(row.status);
                  const imported = row.status === 'importat';
                  return (
                    <tr key={row.id} className="border-b border-[#F6F6F2] hover:bg-[#FAFAF8] transition-colors">
                      <td className="px-5 py-4 text-[#0A0A0A] font-medium">
                        {row.supplierName || row.fromCif || 'Furnizor necunoscut'}
                        {row.fromCif && row.supplierName && (
                          <span className="block text-[13px] text-[#8A8A85]">CIF {row.fromCif}</span>
                        )}
                      </td>
                      <td className="px-5 py-4 font-mono text-[14px] text-[#3D3D3A]">{row.detail || row.anafMsgId}</td>
                      <td className="px-5 py-4 text-[#3D3D3A]">{fmtDate(row.issueDate || row.receivedAt)}</td>
                      <td className="px-5 py-4 text-right font-semibold text-[#0A0A0A]">
                        {row.totalCents != null ? ron(row.totalCents, row.currency || 'RON') : '-'}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-block px-2.5 py-1 rounded-lg text-[13px] font-medium ${pill.cls}`}>{pill.label}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={`/api/anaf/inbox/${row.id}/download`}
                            className="px-3.5 h-11 inline-flex items-center rounded-xl bg-white border border-[#E0E0DA] hover:border-[#0A0A0A] text-[14px] font-semibold whitespace-nowrap"
                          >
                            Descarcă XML
                          </a>
                          {imported ? (
                            <a
                              href="/app/cheltuieli"
                              className="px-3.5 h-11 inline-flex items-center rounded-xl bg-[#E7F7EC] text-[#15803D] text-[14px] font-semibold whitespace-nowrap"
                            >
                              Vezi cheltuiala
                            </a>
                          ) : (
                            <button
                              onClick={() => importExpense(row)}
                              disabled={busyId === row.id}
                              className="px-3.5 h-11 rounded-xl bg-[#0A0A0A] text-white text-[14px] font-semibold hover:bg-[#1a1a1a] disabled:opacity-50 whitespace-nowrap"
                            >
                              {busyId === row.id ? 'Se importă...' : 'Importă ca cheltuială'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
