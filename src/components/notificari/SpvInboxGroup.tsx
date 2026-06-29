import { useEffect, useState } from 'react';

// Standalone SPV-received-invoices group for the Notificări page.
// Mirrors InboxDashboardCard's confirm/import + dismiss behaviour (and shares the
// SAME 'inbox-dismissed' localStorage key so a dismissal made anywhere stays
// dismissed everywhere), but is laid out to sit inside the notifications list and
// stays out of the dashboard. Renders nothing when there are no new invoices.

const DISMISS_KEY = 'inbox-dismissed';
const dismissedSet = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]')); } catch { return new Set(); }
};

interface Row {
  id: string;
  supplierName: string | null;
  fromCif: string | null;
  totalCents: number | null;
  currency: string | null;
  issueDate: string | null;
}

const ron = (c: number | null, cur = 'RON') =>
  new Intl.NumberFormat('ro-RO', { style: 'currency', currency: cur || 'RON' }).format((c || 0) / 100);
const fmtDate = (s: string | null) => {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest' });
};

function InvoiceRow({ row, busy, onConfirm, onDismiss }: {
  row: Row; busy: boolean; onConfirm: (r: Row) => void; onDismiss: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-3">
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-semibold text-white truncate">{row.supplierName || row.fromCif || 'Furnizor necunoscut'}</p>
        <p className="text-[12.5px] text-[#8FA6BC] truncate">{row.fromCif ? `CIF ${row.fromCif}` : ''}{row.issueDate ? `${row.fromCif ? ' · ' : ''}${fmtDate(row.issueDate)}` : ''}</p>
      </div>
      <p className="text-[15px] font-bold text-white tabular-nums shrink-0">{row.totalCents != null ? ron(row.totalCents, row.currency || 'RON') : '-'}</p>
      <button
        type="button"
        onClick={() => onConfirm(row)}
        disabled={busy}
        className="shrink-0 px-3.5 py-2 rounded-full bg-[#E1FB15] text-[#07090f] text-[13px] font-bold hover:bg-[#D2EA0E] disabled:opacity-50 whitespace-nowrap"
      >
        {busy ? 'Se importă…' : 'Confirmă'}
      </button>
      <button
        type="button"
        onClick={() => onDismiss(row.id)}
        aria-label="Ignoră"
        title="Ignoră (nu importa)"
        className="shrink-0 w-8 h-8 grid place-items-center rounded-full bg-white/10 text-[#A8BED2] hover:bg-white/15 hover:text-white transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
  );
}

export default function SpvInboxGroup({ initialRows }: { initialRows: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initialRows || []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Avoid an SSR/CSR mismatch: render full server list first, prune dismissed after mount.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    const set = dismissedSet();
    if (set.size) setRows((prev) => prev.filter((x) => !set.has(x.id)));
  }, []);

  const dismiss = (id: string) => {
    setRows((prev) => prev.filter((x) => x.id !== id));
    try { const s = dismissedSet(); s.add(id); localStorage.setItem(DISMISS_KEY, JSON.stringify([...s])); } catch {}
  };

  const confirmImport = async (row: Row) => {
    setBusyId(row.id);
    try {
      const r = await fetch(`/api/anaf/inbox/${row.id}/import`, { method: 'POST' });
      const d = await r.json();
      if (d.ok) {
        setRows((prev) => prev.filter((x) => x.id !== row.id));
        setToast(`${row.supplierName || 'Factura'} a fost importată în Cheltuieli.`);
        window.setTimeout(() => setToast(null), 3000);
      } else {
        setToast(d.error || 'Nu s-a putut importa.');
      }
    } catch {
      setToast('Eroare de rețea.');
    } finally {
      setBusyId(null);
    }
  };

  // The wrapping group <section> carries data-type="efactura" so the page's pill
  // filter can show/hide it; it also has data-spv-empty so the script can collapse
  // it once the list empties (otherwise an empty heading would linger).
  const empty = hydrated && rows.length === 0;

  return (
    <section
      data-type="efactura"
      data-spv-empty={empty ? 'true' : 'false'}
      className={`mb-6 rounded-2xl bg-white/5 p-4 sm:p-5 ${empty ? 'hidden' : ''}`}
    >
      <div className="flex items-center gap-2.5 mb-3.5 min-w-0">
        <span className="grid place-items-center w-9 h-9 rounded-full bg-[#34A0A4]/15 shrink-0">
          <svg className="w-5 h-5 text-[#34A0A4]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z" /></svg>
        </span>
        <div className="min-w-0">
          <h2 className="text-[16px] font-bold text-white leading-tight">Facturi noi de la furnizori (SPV)</h2>
          <p className="text-[12.5px] text-[#8FA6BC]">{rows.length} {rows.length === 1 ? 'primită' : 'primite'} din SPV · confirmă pentru a le adăuga în Cheltuieli</p>
        </div>
      </div>

      {toast && (
        <div className="mb-3 px-4 py-2.5 rounded-xl text-[13.5px] bg-[#2E9E6A]/15 text-[#2E9E6A]">{toast}</div>
      )}

      <div className="space-y-2.5">
        {rows.slice(0, 3).map((row) => (
          <InvoiceRow key={row.id} row={row} busy={busyId === row.id} onConfirm={confirmImport} onDismiss={dismiss} />
        ))}
      </div>

      {rows.length > 3 && (
        <details className="mt-2.5 group">
          <summary className="cursor-pointer list-none mx-auto w-fit flex items-center px-5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-white text-[13.5px] font-semibold transition-colors">
            <span className="group-open:hidden">Vezi toate ({rows.length})</span>
            <span className="hidden group-open:inline">Ascunde</span>
          </summary>
          <div className="space-y-2.5 mt-2.5">
            {rows.slice(3).map((row) => (
              <InvoiceRow key={row.id} row={row} busy={busyId === row.id} onConfirm={confirmImport} onDismiss={dismiss} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
