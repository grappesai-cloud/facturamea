import { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Mail, Printer, Receipt, Loader2, FileText, Send, Undo2, AlertTriangle, Copy, Share2, Repeat, CreditCard, MessageCircle } from 'lucide-react';

const KIND_LABEL: Record<string, string> = { factura: 'factura', proforma: 'proforma', storno: 'factura storno', chitanta: 'chitanța' };

// Build the message a sender pastes into WhatsApp / native share alongside the link.
function shareMessage(kind: string, totalCents: number, currency: string, url: string): string {
  const amount = (totalCents / 100).toFixed(2);
  return `Bună ziua,\nVă transmit ${KIND_LABEL[kind] || 'documentul'} în valoare de ${amount} ${currency}.\nO puteți vizualiza și descărca aici: ${url}`;
}

export default function InvoiceActions({ invoiceId, kind, status, totalCents, paidCents, currency, clientCompanyId }: {
  invoiceId: string;
  kind: string;
  status: string;
  totalCents: number;
  paidCents: number;
  currency: string;
  clientCompanyId?: string | null;
}) {
  const [showPayModal, setShowPayModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [payLinkUrl, setPayLinkUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const remaining = totalCents - paidCents;
  const canRecordPayment = kind === 'factura' && status !== 'paid' && status !== 'voided' && status !== 'draft';
  const canPayLink = kind === 'factura' && remaining > 0 && status !== 'voided' && status !== 'draft';
  const canSend = status !== 'draft';
  const canSubmitSpv = (kind === 'factura' || kind === 'storno') && status !== 'draft';
  const canStorno = kind === 'factura' && status !== 'draft' && status !== 'voided';
  const canDispute = kind === 'factura' && !['draft', 'paid', 'voided', 'disputed'].includes(status);
  const canRecur = (kind === 'factura' || kind === 'proforma') && status !== 'draft' && status !== 'voided';

  const doShare = async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/invoicing/invoices/${invoiceId}/share`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare'); return; }
      setShareUrl(data.url);
    } catch { setError('Eroare conexiune'); } finally { setBusy(false); }
  };

  const doCopy = () => { window.location.href = `/app/facturare/emite?kind=${kind}&from=${invoiceId}`; };

  const doPayLink = async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/invoicing/invoices/${invoiceId}/payment-link`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare'); return; }
      setPayLinkUrl(data.url);
      window.open(data.url, '_blank');
    } catch { setError('Eroare conexiune'); } finally { setBusy(false); }
  };

  const doRecur = async () => {
    if (!confirm('Creezi un abonament de facturare recurentă pe baza acestei facturi (frecvență lunară)? O poți edita apoi în Recurente.')) return;
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/invoicing/invoices/${invoiceId}/to-recurring`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ frequency: 'monthly' }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare'); return; }
      window.location.href = '/app/facturare/recurente';
    } catch { setError('Eroare conexiune'); } finally { setBusy(false); }
  };

  const submitDispute = async () => {
    const msg = clientCompanyId
      ? 'Marchezi factura drept neîncasată și deschizi o sesizare de plată către client pe facturamea. Clientul este notificat și are drept de replică; neplata îi afectează scorul de încredere. Continui?'
      : 'Marchezi factura drept neîncasată. Clientul este extern (fără cont facturamea), deci nu se poate deschide o sesizare pe platformă. Continui?';
    if (!confirm(msg)) return;
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/invoicing/invoices/${invoiceId}/dispute`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare'); return; }
      if (data.incidentId) window.location.href = `/app/incidente/${data.incidentId}`;
      else window.location.reload();
    } catch { setError('Eroare conexiune'); } finally { setBusy(false); }
  };

  const submitSpv = async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/invoicing/invoices/${invoiceId}/efactura`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare SPV'); return; }
      window.location.reload();
    } catch { setError('Eroare conexiune'); } finally { setBusy(false); }
  };

  const submitPayment = async (amountCents: number, method: string, reference: string, emitReceipt: boolean) => {
    setBusy(true); setError('');
    try {
      const url = emitReceipt
        ? `/api/invoicing/invoices/${invoiceId}/chitanta`
        : `/api/invoicing/invoices/${invoiceId}/payments`;
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents, method, reference }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Eroare'); return; }
      window.location.reload();
    } catch { setError('Eroare conexiune'); } finally { setBusy(false); }
  };

  const submitStorno = async () => {
    if (!confirm('Storneaza această factură? Operația emite o factură storno cu valori negative și marchează originalul ca anulat.')) return;
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/invoicing/invoices/${invoiceId}/storno`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare'); return; }
      window.location.href = `/app/facturare/${data.id}`;
    } catch { setError('Eroare conexiune'); } finally { setBusy(false); }
  };

  const submitSend = async (email: string) => {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/invoicing/invoices/${invoiceId}/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email || null }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Eroare'); return; }
      window.location.reload();
    } catch { setError('Eroare conexiune'); } finally { setBusy(false); }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button variant="outline" size="sm" onClick={() => window.open(`/api/invoicing/invoices/${invoiceId}/pdf`, '_blank')}>
        <Printer className="w-4 h-4 mr-1.5" /> Descarcă PDF
      </Button>
      <Button variant="outline" size="sm" onClick={() => window.open(`/app/facturare/${invoiceId}/print`, '_blank')}>
        <FileText className="w-4 h-4 mr-1.5" /> Vezi tipărit
      </Button>
      {canSend && (
        <Button variant="outline" size="sm" onClick={() => setShowSendModal(true)}>
          <Mail className="w-4 h-4 mr-1.5" /> Trimite pe email
        </Button>
      )}
      {canRecordPayment && (
        <Button size="sm" onClick={() => setShowPayModal(true)}>
          <Receipt className="w-4 h-4 mr-1.5" /> Înregistrează încasare
        </Button>
      )}
      {canPayLink && (
        <Button variant="outline" size="sm" disabled={busy} onClick={doPayLink}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <CreditCard className="w-4 h-4 mr-1.5" />}
          Link de plată
        </Button>
      )}
      {canSubmitSpv && (
        <Button variant="outline" size="sm" disabled={busy} onClick={submitSpv}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Send className="w-4 h-4 mr-1.5" />}
          Trimite la SPV
        </Button>
      )}
      {canStorno && (
        <Button variant="outline" size="sm" disabled={busy} onClick={submitStorno}>
          <Undo2 className="w-4 h-4 mr-1.5" /> Storneaza
        </Button>
      )}
      {canDispute && (
        <Button variant="outline" size="sm" disabled={busy} onClick={submitDispute} className="text-[#B91C1C] border-[#F0C9C9] hover:bg-[#FFF5F5]">
          <AlertTriangle className="w-4 h-4 mr-1.5" /> Sesizează neîncasare
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={doCopy}>
        <Copy className="w-4 h-4 mr-1.5" /> Copiază
      </Button>
      {canRecur && (
        <Button variant="outline" size="sm" disabled={busy} onClick={doRecur}>
          <Repeat className="w-4 h-4 mr-1.5" /> Transformă în recurentă
        </Button>
      )}
      <Button variant="outline" size="sm" disabled={busy} onClick={doShare}>
        <Share2 className="w-4 h-4 mr-1.5" /> Share
      </Button>

      {shareUrl && (
        <ShareModal url={shareUrl} invoiceId={invoiceId} kind={kind} totalCents={totalCents} currency={currency} onClose={() => setShareUrl(null)} onRevoke={() => setShareUrl(null)} />
      )}
      {payLinkUrl && (
        <PayLinkModal url={payLinkUrl} onClose={() => setPayLinkUrl(null)} />
      )}
      {showPayModal && (
        <PaymentModal
          remainingCents={remaining}
          currency={currency}
          busy={busy}
          error={error}
          onClose={() => setShowPayModal(false)}
          onSubmit={submitPayment}
        />
      )}
      {showSendModal && (
        <SendModal
          busy={busy}
          error={error}
          onClose={() => setShowSendModal(false)}
          onSubmit={submitSend}
        />
      )}
    </div>
  );
}

function PaymentModal({ remainingCents, currency, busy, error, onClose, onSubmit }: {
  remainingCents: number;
  currency: string;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (amountCents: number, method: string, reference: string, emitReceipt: boolean) => void;
}) {
  const [amount, setAmount] = useState((remainingCents / 100).toFixed(2));
  const [method, setMethod] = useState('transfer');
  const [reference, setReference] = useState('');
  const [emitReceipt, setEmitReceipt] = useState(true);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-[#0A0A0A] mb-4 flex items-center gap-2">
          <Receipt className="w-5 h-5" /> Înregistrează încasare
        </h3>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block text-xs">Sumă încasată ({currency})</Label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <p className="text-[11px] text-[#6B6B68] mt-1">Rest de plată: {(remainingCents / 100).toFixed(2)} {currency}</p>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">Metodă</Label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full h-11 px-4 border border-[#E8E8E4] rounded-xl text-sm bg-white">
              <option value="transfer">Transfer bancar</option>
              <option value="card">Card</option>
              <option value="cash">Numerar</option>
              <option value="compensation">Compensare</option>
            </select>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">Referință (OP, terminal, etc) — opțional</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <label className="flex items-start gap-2 text-sm pt-1">
            <input type="checkbox" checked={emitReceipt} onChange={(e) => setEmitReceipt(e.target.checked)} className="mt-0.5" />
            <span>
              Emite și document <strong>chitanță</strong> (linkat la factură, cu număr propriu din seria de chitanțe)
            </span>
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={onClose}>Renunță</Button>
          <Button disabled={busy} onClick={() => onSubmit(Math.round(parseFloat(amount) * 100), method, reference, emitReceipt)}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : (emitReceipt ? 'Salvează & emite chitanță' : 'Salvează încasare')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ShareModal({ url, invoiceId, kind, totalCents, currency, onClose, onRevoke }: { url: string; invoiceId: string; kind: string; totalCents: number; currency: string; onClose: () => void; onRevoke: () => void }) {
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  const msg = shareMessage(kind, totalCents, currency, url);
  const whatsapp = () => window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  const nativeShare = async () => {
    // Mobile: opens the OS share sheet (WhatsApp, SMS, email, etc.).
    try { await (navigator as any).share?.({ title: 'Document facturamea', text: msg, url }); } catch { /* user cancelled */ }
  };
  const hasNativeShare = typeof navigator !== 'undefined' && !!(navigator as any).share;
  const revoke = async () => {
    setRevoking(true);
    await fetch(`/api/invoicing/invoices/${invoiceId}/share`, { method: 'DELETE' }).catch(() => {});
    setRevoking(false); onRevoke();
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-[#0A0A0A] mb-2 flex items-center gap-2"><Share2 className="w-5 h-5" /> Trimite documentul (fără email)</h3>
        <p className="text-xs text-[#6B6B68] mb-4">Oricine are acest link poate vedea și descărca documentul (doar citire). Poți revoca oricând.</p>
        <div className="flex gap-2">
          <Input value={url} readOnly className="flex-1 font-mono text-xs" />
          <Button size="sm" onClick={copy}>{copied ? 'Copiat!' : 'Copiază'}</Button>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Button size="sm" onClick={whatsapp} className="bg-[#25D366] hover:bg-[#1FB855] text-white">
            <MessageCircle className="w-4 h-4 mr-1.5" /> WhatsApp
          </Button>
          {hasNativeShare && (
            <Button size="sm" variant="outline" onClick={nativeShare}>
              <Share2 className="w-4 h-4 mr-1.5" /> Trimite…
            </Button>
          )}
        </div>
        <div className="flex justify-between gap-2 mt-5">
          <Button variant="outline" disabled={revoking} onClick={revoke} className="text-[#B91C1C] border-[#F0C9C9] hover:bg-[#FFF5F5]">
            {revoking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Revocă linkul'}
          </Button>
          <Button variant="outline" onClick={onClose}>Închide</Button>
        </div>
      </div>
    </div>
  );
}

function PayLinkModal({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-[#0A0A0A] mb-2 flex items-center gap-2"><CreditCard className="w-5 h-5" /> Link de plată online</h3>
        <p className="text-xs text-[#6B6B68] mb-4">Trimite acest link clientului ca să plătească factura cu cardul. Încasarea se înregistrează automat când plata reușește.</p>
        <div className="flex gap-2">
          <Input value={url} readOnly className="flex-1 font-mono text-xs" />
          <Button size="sm" onClick={copy}>{copied ? 'Copiat!' : 'Copiază link'}</Button>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={() => window.open(url, '_blank')}>Deschide pagina de plată</Button>
          <Button variant="outline" onClick={onClose}>Închide</Button>
        </div>
      </div>
    </div>
  );
}

function SendModal({ busy, error, onClose, onSubmit }: { busy: boolean; error: string; onClose: () => void; onSubmit: (email: string) => void }) {
  const [email, setEmail] = useState('');
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-[#0A0A0A] mb-4 flex items-center gap-2">
          <Mail className="w-5 h-5" /> Trimite documentul pe email
        </h3>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <div>
          <Label className="mb-1.5 block text-xs">Email destinatar (lasă gol pentru emailul clientului)</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="optional@client.ro" />
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={onClose}>Renunță</Button>
          <Button disabled={busy} onClick={() => onSubmit(email)}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Trimite'}
          </Button>
        </div>
      </div>
    </div>
  );
}
