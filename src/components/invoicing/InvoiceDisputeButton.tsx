import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

// Compact "Sesizează neîncasare" action for invoice rows shown outside the
// invoice detail page (dossier, order). Posts to the same /dispute endpoint:
// marks the invoice disputed and, for TH-registered clients, opens a payment
// incident (then redirects to it). Renders nothing when the invoice can't be
// disputed (not a factura, or already paid/draft/voided/disputed).
export default function InvoiceDisputeButton({ invoiceId, kind, status, clientCompanyId, className }: {
  invoiceId: string;
  kind: string;
  status: string;
  clientCompanyId?: string | null;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const canDispute = kind === 'factura' && !['draft', 'paid', 'voided', 'disputed'].includes(status);
  if (!canDispute) return null;

  const run = async () => {
    const msg = clientCompanyId
      ? 'Marchezi factura drept neîncasată și deschizi o sesizare de plată către client pe facturamea. Clientul este notificat și are drept de replică; neplata îi afectează scorul de încredere. Continui?'
      : 'Marchezi factura drept neîncasată. Clientul este extern (fără cont facturamea), deci nu se poate deschide o sesizare pe platformă. Continui?';
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/invoicing/invoices/${invoiceId}/dispute`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Eroare'); return; }
      if (data.incidentId) window.location.href = `/app/incidente/${data.incidentId}`;
      else window.location.reload();
    } catch {
      alert('Eroare conexiune');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      title="Marchează neîncasată și sesizează"
      className={className || 'inline-flex items-center gap-1 shrink-0 text-[11px] font-semibold text-[#B91C1C] hover:underline disabled:opacity-50'}
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
      Sesizează
    </button>
  );
}
