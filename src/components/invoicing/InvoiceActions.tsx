import { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Printer, Receipt, Loader2, FileText, Undo2, AlertTriangle, Share2, Repeat, CreditCard } from 'lucide-react';

// Close a modal on the Escape key (modals already close on backdrop click).
function useEscapeClose(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);
}

export default function InvoiceActions({ invoiceId, kind, status, totalCents, paidCents, currency, clientCompanyId, payEnabled }: {
  invoiceId: string;
  kind: string;
  status: string;
  totalCents: number;
  paidCents: number;
  currency: string;
  clientCompanyId?: string | null;
  payEnabled?: boolean;
}) {
  const [showPayModal, setShowPayModal] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [payLinkUrl, setPayLinkUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // App-styled confirm dialog (replaces the native confirm(), which is
  // inconsistent and blocks automated flows). Promise-based so call sites stay
  // `if (!(await askConfirm(...))) return;`.
  const [confirmState, setConfirmState] = useState<{ message: string; resolve: (v: boolean) => void } | null>(null);
  const askConfirm = (message: string) => new Promise<boolean>((resolve) => setConfirmState({ message, resolve }));

  const remaining = totalCents - paidCents;
  // A storno'd (reversed) or voided document is settled: no more money/mutation
  // actions — you can't collect on, pay-link, re-storno, dispute or recur it.
  const settled = status === 'voided' || status === 'reversed';
  const canRecordPayment = kind === 'factura' && status !== 'paid' && !settled && status !== 'draft';
  // Pay-link only when Stripe is configured (payEnabled), else the button is hidden.
  const canPayLink = !!payEnabled && kind === 'factura' && remaining > 0 && !settled && status !== 'draft';
  const canStorno = kind === 'factura' && status !== 'draft' && !settled;
  const canDispute = kind === 'factura' && !['draft', 'paid', 'voided', 'reversed', 'disputed'].includes(status);
  const canRecur = (kind === 'factura' || kind === 'proforma') && status !== 'draft' && !settled;

  const doShare = async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/invoicing/invoices/${invoiceId}/share`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare'); return; }
      // Native app: open the OS share sheet directly. Web: show the share modal.
      const cap = (window as any).Capacitor;
      const Share = cap?.Plugins?.Share;
      if (cap?.isNativePlatform?.() && Share?.share) {
        try { await Share.share({ title: 'Factură', text: 'Vezi factura', url: data.url, dialogTitle: 'Distribuie factura' }); return; }
        catch { /* cancelled / unavailable → fall through to the modal */ }
      }
      setShareUrl(data.url);
    } catch { setError('Eroare conexiune'); } finally { setBusy(false); }
  };

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
    if (!(await askConfirm('Creezi un abonament de facturare recurentă pe baza acestei facturi (frecvență lunară)? O poți edita apoi în Recurente.'))) return;
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
    if (!(await askConfirm(msg))) return;
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/invoicing/invoices/${invoiceId}/dispute`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare'); return; }
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
    if (!(await askConfirm('Stornează această factură? Operația emite o factură storno cu valori negative și marchează originalul ca anulat.'))) return;
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/invoicing/invoices/${invoiceId}/storno`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare'); return; }
      window.location.href = `/app/facturare/${data.id}`;
    } catch { setError('Eroare conexiune'); } finally { setBusy(false); }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button variant="outline" size="sm" className="rounded-full bg-white/10 text-white border-0 hover:bg-white/15 hover:border-0" onClick={() => window.open(`/api/invoicing/invoices/${invoiceId}/pdf`, '_blank')}>
        <Printer className="w-4 h-4 mr-1.5" /> Descarcă PDF
      </Button>
      <Button variant="outline" size="sm" className="rounded-full bg-white/10 text-white border-0 hover:bg-white/15 hover:border-0" onClick={() => window.open(`/app/facturare/${invoiceId}/print`, '_blank')}>
        <FileText className="w-4 h-4 mr-1.5" /> Vezi tipărit
      </Button>
      {canRecordPayment && (
        <Button size="sm" className="rounded-full bg-[#E1FB15] text-[#0A2238] hover:bg-[#D2EA0E] active:scale-100" onClick={() => setShowPayModal(true)}>
          <Receipt className="w-4 h-4 mr-1.5" /> Înregistrează încasare
        </Button>
      )}
      {canPayLink && (
        <Button variant="outline" size="sm" className="rounded-full bg-white/10 text-white border-0 hover:bg-white/15 hover:border-0" disabled={busy} onClick={doPayLink}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <CreditCard className="w-4 h-4 mr-1.5" />}
          Link de plată
        </Button>
      )}
      {canStorno && (
        <Button variant="outline" size="sm" className="rounded-full bg-white/10 text-white border-0 hover:bg-white/15 hover:border-0" disabled={busy} onClick={submitStorno}>
          <Undo2 className="w-4 h-4 mr-1.5" /> Stornează
        </Button>
      )}
      {canDispute && (
        <Button variant="outline" size="sm" disabled={busy} onClick={submitDispute} className="rounded-full bg-[#DC4B41]/15 text-[#DC4B41] border-0 hover:bg-[#DC4B41]/25 hover:border-0">
          <AlertTriangle className="w-4 h-4 mr-1.5" /> Sesizează neîncasare
        </Button>
      )}
      {canRecur && (
        <Button variant="outline" size="sm" className="rounded-full bg-white/10 text-white border-0 hover:bg-white/15 hover:border-0" disabled={busy} onClick={doRecur}>
          <Repeat className="w-4 h-4 mr-1.5" /> Transformă în recurentă
        </Button>
      )}
      <Button variant="outline" size="sm" className="rounded-full bg-white/10 text-white border-0 hover:bg-white/15 hover:border-0" disabled={busy} onClick={doShare}>
        <Share2 className="w-4 h-4 mr-1.5" /> Distribuie
      </Button>

      {shareUrl && (
        <ShareModal url={shareUrl} invoiceId={invoiceId} onClose={() => setShareUrl(null)} onRevoke={() => setShareUrl(null)} />
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
      {confirmState && (
        <ConfirmModal
          message={confirmState.message}
          onYes={() => { confirmState.resolve(true); setConfirmState(null); }}
          onNo={() => { confirmState.resolve(false); setConfirmState(null); }}
        />
      )}
    </div>
  );
}

function ConfirmModal({ message, onYes, onNo }: { message: string; onYes: () => void; onNo: () => void }) {
  useEscapeClose(onNo);
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onNo}>
      <div className="bg-[#071828] ring-1 ring-white/10 rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-5">
          <AlertTriangle className="w-5 h-5 text-[#E8A33C] shrink-0 mt-0.5" />
          <p className="text-[14px] text-white leading-relaxed">{message}</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" className="rounded-full bg-white/10 text-white border-0 hover:bg-white/15 hover:border-0" onClick={onNo}>Renunță</Button>
          <Button className="rounded-full bg-[#E1FB15] text-[#0A2238] hover:bg-[#D2EA0E]" onClick={onYes}>Confirmă</Button>
        </div>
      </div>
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
  useEscapeClose(onClose);
  const [amount, setAmount] = useState((remainingCents / 100).toFixed(2));
  const [method, setMethod] = useState('transfer');
  const [reference, setReference] = useState('');
  const [emitReceipt, setEmitReceipt] = useState(true);
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#071828] ring-1 ring-white/10 rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Receipt className="w-5 h-5" /> Înregistrează încasare
        </h3>
        {error && <p className="text-sm text-[#DC4B41] mb-3">{error}</p>}
        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block text-[13px] font-medium text-[#9FB8CC]">Sumă încasată ({currency})</Label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="[color-scheme:dark] bg-white/5 border-0 text-white placeholder:text-[#7C9AB4] hover:border-0 focus:border-0 focus:ring-2 focus:ring-[#E1FB15]/40" />
            <p className="text-[11px] text-[#9FB8CC] mt-1">Rest de plată: {(remainingCents / 100).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</p>
          </div>
          <div>
            <Label className="mb-1.5 block text-[13px] font-medium text-[#9FB8CC]">Metodă</Label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full rounded-xl bg-white/5 px-4 py-2.5 text-[14px] text-white border-0 focus:outline-none focus:ring-2 focus:ring-[#E1FB15]/40 [color-scheme:dark]">
              <option value="transfer">Transfer bancar</option>
              <option value="card">Card</option>
              <option value="cash">Numerar</option>
              <option value="compensation">Compensare</option>
            </select>
          </div>
          <div>
            <Label className="mb-1.5 block text-[13px] font-medium text-[#9FB8CC]">Referință (OP, terminal, etc) — opțional</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} className="bg-white/5 border-0 text-white placeholder:text-[#7C9AB4] hover:border-0 focus:border-0 focus:ring-2 focus:ring-[#E1FB15]/40" />
          </div>
          <label className="flex items-start gap-2 text-sm pt-1 text-white">
            <input type="checkbox" checked={emitReceipt} onChange={(e) => setEmitReceipt(e.target.checked)} className="mt-0.5" />
            <span>
              Emite și document <strong>chitanță</strong> (linkat la factură, cu număr propriu din seria de chitanțe)
            </span>
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" className="rounded-full bg-white/10 text-white border-0 hover:bg-white/15 hover:border-0" onClick={onClose}>Renunță</Button>
          <Button disabled={busy} className="rounded-full bg-[#E1FB15] text-[#0A2238] hover:bg-[#D2EA0E] active:scale-100" onClick={() => onSubmit(Math.round(parseFloat(amount) * 100), method, reference, emitReceipt)}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : (emitReceipt ? 'Salvează & emite chitanță' : 'Salvează încasare')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ShareModal({ url, invoiceId, onClose, onRevoke }: { url: string; invoiceId: string; onClose: () => void; onRevoke: () => void }) {
  useEscapeClose(onClose);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  const revoke = async () => {
    setRevoking(true);
    await fetch(`/api/invoicing/invoices/${invoiceId}/share`, { method: 'DELETE' }).catch(() => {});
    setRevoking(false); onRevoke();
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#071828] ring-1 ring-white/10 rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2"><Share2 className="w-5 h-5" /> Link public</h3>
        <p className="text-xs text-[#9FB8CC] mb-4">Oricine are acest link poate vedea documentul (doar citire). Poți revoca oricând.</p>
        <div className="flex gap-2">
          <Input value={url} readOnly className="flex-1 font-mono text-xs bg-white/5 border-0 text-white placeholder:text-[#7C9AB4] hover:border-0 focus:border-0 focus:ring-2 focus:ring-[#E1FB15]/40" />
          <Button size="sm" className="rounded-full bg-[#E1FB15] text-[#0A2238] hover:bg-[#D2EA0E] active:scale-100" onClick={copy}>{copied ? 'Copiat!' : 'Copiază'}</Button>
        </div>
        <div className="flex justify-between gap-2 mt-5">
          <Button variant="outline" disabled={revoking} onClick={revoke} className="rounded-full bg-[#DC4B41]/15 text-[#DC4B41] border-0 hover:bg-[#DC4B41]/25 hover:border-0">
            {revoking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Revocă linkul'}
          </Button>
          <Button variant="outline" className="rounded-full bg-white/10 text-white border-0 hover:bg-white/15 hover:border-0" onClick={onClose}>Închide</Button>
        </div>
      </div>
    </div>
  );
}

function PayLinkModal({ url, onClose }: { url: string; onClose: () => void }) {
  useEscapeClose(onClose);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#071828] ring-1 ring-white/10 rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2"><CreditCard className="w-5 h-5" /> Link de plată online</h3>
        <p className="text-xs text-[#9FB8CC] mb-4">Trimite acest link clientului ca să plătească factura cu cardul. Încasarea se înregistrează automat când plata reușește.</p>
        <div className="flex gap-2">
          <Input value={url} readOnly className="flex-1 font-mono text-xs bg-white/5 border-0 text-white placeholder:text-[#7C9AB4] hover:border-0 focus:border-0 focus:ring-2 focus:ring-[#E1FB15]/40" />
          <Button size="sm" className="rounded-full bg-[#E1FB15] text-[#0A2238] hover:bg-[#D2EA0E] active:scale-100" onClick={copy}>{copied ? 'Copiat!' : 'Copiază link'}</Button>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" className="rounded-full bg-white/10 text-white border-0 hover:bg-white/15 hover:border-0" onClick={() => window.open(url, '_blank')}>Deschide pagina de plată</Button>
          <Button variant="outline" className="rounded-full bg-white/10 text-white border-0 hover:bg-white/15 hover:border-0" onClick={onClose}>Închide</Button>
        </div>
      </div>
    </div>
  );
}

