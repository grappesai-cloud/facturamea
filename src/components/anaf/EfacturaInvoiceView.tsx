import { useEffect, useState } from 'react';
import { parseEfacturaXml, type EfacturaParsed } from './efacturaXml';

// Reads the stored ANAF e-Factura XML for an inbox row and renders it the same way an
// invoice is shown elsewhere in Facturare — a dark card (De la / Către / lines /
// totals) that fits the app's dark theme — plus an XML download button.
export default function EfacturaInvoiceView({ inboxId }: { inboxId: string }) {
  const [parsed, setParsed] = useState<EfacturaParsed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/anaf/inbox/${inboxId}/download`);
        if (!r.ok) throw new Error('download failed');
        const xml = await r.text();
        const p = parseEfacturaXml(xml);
        if (alive) { setParsed(p); if (!p) setError(true); }
      } catch { if (alive) setError(true); } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [inboxId]);

  const download = () => window.open(`/api/anaf/inbox/${inboxId}/download`, '_blank');

  const ron = (n: number) =>
    new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0) +
    ' ' + (parsed?.currency || 'RON');

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-[16px] font-bold text-white">Factura primită</h2>
        <button
          type="button"
          onClick={download}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/10 text-white text-[13px] font-semibold hover:bg-white/15 transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
          XML
        </button>
      </div>

      {loading && <div className="rounded-2xl bg-white/5 p-6 text-center text-[#8FA6BC] text-[14px]">Se încarcă factura…</div>}

      {!loading && (error || !parsed) && (
        <div className="rounded-2xl bg-white/5 p-5 text-[14px] text-[#A8BED2]">
          Nu am putut citi XML-ul facturii. <button type="button" onClick={download} className="font-semibold text-[#E1FB15] hover:underline">Descarcă XML-ul →</button>
        </div>
      )}

      {!loading && parsed && (
        <div className="rounded-2xl p-5 sm:p-8 bg-white/5">
          {/* Supplier + number */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5 pb-6 border-b border-white/10">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-[#8FA6BC]">De la</p>
              <p className="text-[16px] font-bold text-white mt-1.5">{parsed.supplier.name || '—'}</p>
              {parsed.supplier.cui && <p className="text-[13px] text-[#A8BED2] mt-0.5">CUI: {parsed.supplier.cui}</p>}
              {parsed.supplier.address && <p className="text-[13px] text-[#A8BED2] mt-0.5">{parsed.supplier.address}</p>}
            </div>
            <div className="sm:text-right shrink-0">
              <p className="text-[13px] font-medium text-[#8FA6BC]">Factură</p>
              <p className="text-[22px] sm:text-[26px] font-bold tracking-[-0.02em] text-white mt-1.5 font-mono tabular-nums break-all">{parsed.number || '—'}</p>
              {parsed.issueDate && <p className="text-[13px] text-[#A8BED2] mt-1.5">Emis: {parsed.issueDate}</p>}
              {parsed.dueDate && <p className="text-[13px] text-[#A8BED2] mt-0.5">Scadență: {parsed.dueDate}</p>}
            </div>
          </div>

          {/* Buyer */}
          <div className="py-6 border-b border-white/10">
            <p className="text-[13px] font-medium text-[#8FA6BC]">Către</p>
            <p className="text-[16px] font-bold text-white mt-1.5">{parsed.buyer.name || '—'}</p>
            {parsed.buyer.cui && <p className="text-[13px] text-[#A8BED2] mt-0.5">CUI: {parsed.buyer.cui}</p>}
          </div>

          {/* Lines — stacked on mobile, table on desktop */}
          <div className="py-6">
            <ul className="sm:hidden">
              {parsed.lines.map((l, i) => (
                <li key={i} className="py-3.5 border-t border-white/10 first:border-t-0">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[14px] font-bold text-white leading-snug">{l.name || '—'}</p>
                    <p className="text-[14px] font-bold tabular-nums text-white shrink-0 whitespace-nowrap">{ron(l.lineTotal)}</p>
                  </div>
                  <p className="text-[13px] text-[#8FA6BC] mt-1.5 tabular-nums">{l.qty}{l.unit ? ` ${l.unit}` : ''} × {ron(l.unitPrice)}{l.vatPct != null ? ` · TVA ${l.vatPct}%` : ''}</p>
                </li>
              ))}
            </ul>
            <table className="w-full text-[14px] hidden sm:table">
              <thead>
                <tr className="text-left text-[12px] text-[#8FA6BC] font-semibold border-b border-white/10">
                  <th className="py-2.5 pr-3">Descriere</th>
                  <th className="py-2.5 px-2 text-right w-16">Cant.</th>
                  <th className="py-2.5 px-2 text-right w-28">Preț unit.</th>
                  <th className="py-2.5 px-2 text-right w-16">TVA</th>
                  <th className="py-2.5 pl-2 text-right w-32">Total</th>
                </tr>
              </thead>
              <tbody>
                {parsed.lines.map((l, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="py-3 pr-3 text-white align-top">{l.name || '—'}</td>
                    <td className="py-3 px-2 text-right tabular-nums text-[#C8DAE8] whitespace-nowrap align-top">{l.qty}{l.unit ? ` ${l.unit}` : ''}</td>
                    <td className="py-3 px-2 text-right tabular-nums text-[#C8DAE8] whitespace-nowrap align-top">{ron(l.unitPrice)}</td>
                    <td className="py-3 px-2 text-right tabular-nums text-[#C8DAE8] whitespace-nowrap align-top">{l.vatPct != null ? `${l.vatPct}%` : '—'}</td>
                    <td className="py-3 pl-2 text-right tabular-nums font-semibold text-white whitespace-nowrap align-top">{ron(l.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-full sm:w-72 space-y-2">
              <div className="flex justify-between text-[14px]"><span className="text-[#8FA6BC]">Subtotal</span><span className="tabular-nums text-white">{ron(parsed.subtotal)}</span></div>
              <div className="flex justify-between text-[14px]"><span className="text-[#8FA6BC]">TVA</span><span className="tabular-nums text-white">{ron(parsed.vatTotal)}</span></div>
              <div className="flex justify-between pt-2 border-t border-white/10 text-[16px] font-bold"><span className="text-white">Total</span><span className="tabular-nums text-white">{ron(parsed.total)}</span></div>
            </div>
          </div>

          {parsed.note && <p className="mt-6 pt-5 border-t border-white/10 text-[13px] text-[#8FA6BC]">{parsed.note}</p>}
        </div>
      )}
    </div>
  );
}
