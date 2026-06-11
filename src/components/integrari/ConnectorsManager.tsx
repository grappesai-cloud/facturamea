import { useEffect, useState } from 'react';

interface Conn {
  id: string;
  provider: 'woocommerce' | 'shopify' | 'prestashop' | 'custom';
  label: string | null;
  baseUrl: string | null;
  webhookSecret: string;
  autoInvoice: boolean;
  isActive: boolean;
  lastEventAt: string | null;
  createdAt: string | null;
}

const PROVIDERS: { id: Conn['provider']; label: string; webhookBase: string | null }[] = [
  { id: 'woocommerce', label: 'WooCommerce', webhookBase: '/api/webhooks/woocommerce/' },
  { id: 'shopify', label: 'Shopify', webhookBase: '/api/webhooks/shopify/' },
  { id: 'prestashop', label: 'PrestaShop', webhookBase: null },
  { id: 'custom', label: 'Altă platformă (custom)', webhookBase: null },
];

const PROVIDER_LABELS: Record<Conn['provider'], string> = {
  woocommerce: 'WooCommerce',
  shopify: 'Shopify',
  prestashop: 'PrestaShop',
  custom: 'Custom',
};

function webhookUrlFor(c: Conn, origin: string): string | null {
  const p = PROVIDERS.find((x) => x.id === c.provider);
  if (!p?.webhookBase) return null;
  return `${origin}${p.webhookBase}${c.webhookSecret}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('ro-RO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return '—';
  }
}

export default function ConnectorsManager() {
  const [conns, setConns] = useState<Conn[]>([]);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ provider: Conn['provider']; label: string; baseUrl: string }>({
    provider: 'woocommerce',
    label: '',
    baseUrl: '',
  });

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const refresh = async () => {
    try {
      const r = await fetch('/api/connectors');
      const d = await r.json();
      setConns(d.results || []);
    } catch {
      setConns([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
  }, []);

  const addConnection = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/connectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: draft.provider, label: draft.label.trim(), baseUrl: draft.baseUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Eroare la salvare');
        return;
      }
      setShowAdd(false);
      setDraft({ provider: 'woocommerce', label: '', baseUrl: '' });
      await refresh();
    } catch {
      setError('Eroare de conexiune');
    } finally {
      setBusy(false);
    }
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    // Optimistic UI for toggles.
    setConns((prev) => prev.map((c) => (c.id === id ? { ...c, ...body } : c)));
    try {
      await fetch(`/api/connectors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      await refresh();
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Sigur ștergi această conexiune? Webhook-ul nu va mai funcționa.')) return;
    try {
      const r = await fetch(`/api/connectors/${id}`, { method: 'DELETE' });
      if (r.ok) setConns((prev) => prev.filter((c) => c.id !== id));
    } catch {
      /* ignore */
    }
  };

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  const card = 'bg-white border border-[#E8E8E4] rounded-2xl';
  const btnPrimary = 'inline-flex items-center justify-center h-11 px-5 rounded-xl bg-[#FF5C00] hover:bg-[#E04E00] text-white text-[15px] font-semibold transition-colors';
  const btnGhost = 'inline-flex items-center justify-center h-11 px-4 rounded-xl bg-white border border-[#E0E0DA] hover:border-[#0A0A0A] text-[15px] font-semibold transition-colors';
  const inputCls = 'w-full h-11 px-4 rounded-xl border border-[#E8E8E4] bg-white text-[15px] text-[#0A0A0A] placeholder:text-[#A8A8A4] focus:outline-none focus:border-[#0A0A0A]';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-[#6B6B68]">
          Conectează magazinul tău online. La fiecare comandă nouă putem emite automat factura.
        </p>
        {!showAdd && (
          <button className={btnPrimary} onClick={() => setShowAdd(true)}>
            Adaugă conexiune
          </button>
        )}
      </div>

      {/* Add form */}
      {showAdd && (
        <div className={`${card} p-6 space-y-4`}>
          <h3 className="text-[16px] font-semibold text-[#0A0A0A]">Conexiune nouă</h3>
          {error && (
            <div className="px-4 py-3 rounded-xl bg-[#FDECEC] border border-[#B91C1C]/30 text-[14px] text-[#B91C1C]">
              {error}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[14px] font-medium text-[#0A0A0A] mb-1.5">Platformă</label>
              <select
                className={`${inputCls} appearance-none`}
                value={draft.provider}
                onChange={(e) => setDraft({ ...draft, provider: e.target.value as Conn['provider'] })}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[14px] font-medium text-[#0A0A0A] mb-1.5">Etichetă (opțional)</label>
              <input
                className={inputCls}
                placeholder="ex: Magazinul principal"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="block text-[14px] font-medium text-[#0A0A0A] mb-1.5">Adresa magazinului (opțional)</label>
            <input
              className={inputCls}
              placeholder="ex: https://magazinul-meu.ro"
              value={draft.baseUrl}
              onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <button className={btnPrimary} disabled={busy} onClick={addConnection}>
              {busy ? 'Se salvează…' : 'Salvează conexiunea'}
            </button>
            <button
              className={btnGhost}
              onClick={() => {
                setShowAdd(false);
                setError('');
              }}
            >
              Anulează
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className={`${card} px-5 py-12 text-center text-[15px] text-[#6B6B68]`}>Se încarcă…</div>
      ) : conns.length === 0 ? (
        <div className={`${card} px-5 py-12 text-center text-[15px] text-[#6B6B68]`}>
          Nicio conexiune încă. Apasă „Adaugă conexiune" ca să conectezi un magazin.
        </div>
      ) : (
        <div className="space-y-4">
          {conns.map((c) => {
            const url = webhookUrlFor(c, origin);
            return (
              <div key={c.id} className={`${card} p-5 sm:p-6`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[17px] font-semibold text-[#0A0A0A]">
                        {c.label || PROVIDER_LABELS[c.provider]}
                      </h3>
                      <span className="px-2.5 py-1 rounded-lg text-[13px] font-medium bg-[#F0F0EC] text-[#6B6B68]">
                        {PROVIDER_LABELS[c.provider]}
                      </span>
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[13px] font-medium ${
                          c.isActive ? 'bg-[#E7F7EC] text-[#15803D]' : 'bg-[#F0F0EC] text-[#6B6B68]'
                        }`}
                      >
                        {c.isActive ? 'Activă' : 'Inactivă'}
                      </span>
                    </div>
                    <p className="text-[14px] text-[#6B6B68] mt-1">Ultimul eveniment: {fmtDate(c.lastEventAt)}</p>
                  </div>
                  <button
                    className="px-3 h-10 rounded-xl text-[14px] font-semibold text-[#B91C1C] border border-transparent hover:border-[#B91C1C]/30 transition-colors"
                    onClick={() => remove(c.id)}
                  >
                    Șterge
                  </button>
                </div>

                {/* Toggles */}
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    role="switch"
                    aria-checked={c.isActive}
                    onClick={() => patch(c.id, { isActive: !c.isActive })}
                    className="inline-flex items-center gap-2.5 h-11 px-4 rounded-xl bg-[#FAFAF8] border border-[#E8E8E4] text-[15px] font-semibold text-[#0A0A0A]"
                  >
                    <span
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        c.isActive ? 'bg-[#FF5C00]' : 'bg-[#D4D4CE]'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          c.isActive ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </span>
                    Activă
                  </button>
                  <button
                    role="switch"
                    aria-checked={c.autoInvoice}
                    onClick={() => patch(c.id, { autoInvoice: !c.autoInvoice })}
                    className="inline-flex items-center gap-2.5 h-11 px-4 rounded-xl bg-[#FAFAF8] border border-[#E8E8E4] text-[15px] font-semibold text-[#0A0A0A]"
                  >
                    <span
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        c.autoInvoice ? 'bg-[#FF5C00]' : 'bg-[#D4D4CE]'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          c.autoInvoice ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </span>
                    Factură automată
                  </button>
                </div>

                {/* Webhook URL + setup */}
                {url ? (
                  <div className="mt-5 rounded-xl bg-[#FAFAF8] border border-[#E8E8E4] p-4">
                    <p className="text-[14px] font-semibold text-[#0A0A0A] mb-2">Adresa webhook (URL de livrare)</p>
                    <div className="flex flex-wrap items-stretch gap-2">
                      <code className="flex-1 min-w-[220px] break-all rounded-lg bg-white border border-[#E8E8E4] px-3 py-2.5 text-[13px] text-[#0A0A0A] font-mono">
                        {url}
                      </code>
                      <button className={btnGhost} onClick={() => copy(url, c.id)}>
                        {copied === c.id ? 'Copiat ✓' : 'Copiază'}
                      </button>
                    </div>
                    <div className="mt-3 text-[14px] text-[#6B6B68] leading-relaxed">
                      {c.provider === 'woocommerce' ? (
                        <p>
                          În WooCommerce: <strong>Setări → Avansat → Webhooks</strong>, adaugă un webhook nou, alege
                          acțiunea <strong>order.created</strong> și lipește adresa de mai sus la „Delivery URL".
                        </p>
                      ) : (
                        <p>
                          În Shopify: <strong>Settings → Notifications → Webhooks</strong>, apasă „Create webhook",
                          alege evenimentul <strong>Order creation</strong> (format JSON) și lipește adresa de mai sus.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 rounded-xl bg-[#FFF3E9] border border-[#FF5C00]/25 p-4 text-[14px] text-[#0A0A0A]">
                    Pentru {PROVIDER_LABELS[c.provider]} integrarea automată prin webhook nu este încă disponibilă.
                    Poți folosi această conexiune pentru organizare; emiterea automată funcționează momentan pentru
                    WooCommerce și Shopify.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
