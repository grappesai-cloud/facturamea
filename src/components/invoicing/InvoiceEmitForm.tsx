import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Plus, AlertCircle, Search, Save, Check, BookmarkPlus, BookmarkCheck } from 'lucide-react';
import { isValidCui } from '../../lib/utils';

const PRODUCT_TYPES = ['Servicii', 'Marfuri', 'Produs finit', 'Materii prime', 'Semifabricate', 'Obiecte de inventar', 'Ambalaje'];

// Common units of measure with friendly labels for the U.M. dropdowns.
const UNITS = ['buc', 'set', 'pachet', 'serviciu', 'abonament', 'oră', 'zi', 'lună', 'an', 'km', 'cursă', 'kg', 'to', 'litru', 'm', 'mp', 'm³', '%'];
const UNIT_LABELS: Record<string, string> = {
  buc: 'buc · bucată', set: 'set', pachet: 'pachet', serviciu: 'serviciu', abonament: 'abonament',
  'oră': 'oră', zi: 'zi', 'lună': 'lună', an: 'an', km: 'km', 'cursă': 'cursă', kg: 'kg',
  to: 'to · tonă', litru: 'litru', m: 'm · metru', mp: 'mp · m²', 'm³': 'm³', '%': '%',
};

interface CatalogProduct {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  defaultUnitPriceCents: number | null;
  defaultCurrency: string | null;
  defaultUm: string | null;
  defaultVatRate: number | null;
}

type Kind = 'factura' | 'proforma' | 'storno' | 'chitanta' | 'aviz';

const KIND_TITLE: Record<Kind, string> = {
  factura: 'Emite factură',
  proforma: 'Emite proformă',
  storno: 'Emite factură storno',
  chitanta: 'Emite chitanță',
  aviz: 'Emite aviz de însoțire',
};

interface ExternalClient {
  id: string;
  name: string;
  taxId: string | null;
  city: string | null;
  country: string | null;
  isVatPayer: boolean;
}

interface Series {
  id: string;
  name: string;
  prefix: string;
  kind: string;
  nextNumber: number;
  isDefault: boolean;
  scope: string | null;
}

// Oblio-style preview of the next document number for a series, e.g. "TH 0001".
function seriesNumberPreview(s: Series): string {
  return `${s.prefix} ${String(s.nextNumber).padStart(4, '0')}`;
}

interface Line {
  productId?: string; // catalogue link (drives stock-out); set when a product is picked
  code: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string; // in major units (RON), converted to cents on submit
  vatRate: string;
}

interface TvaRate { id: string; name: string; percent: number; regime: string; isDefault: boolean; isActive: boolean }
// Standard Romanian VAT rates (2026), fixed by law — no per-company setting.
// A line's rate comes from the product (its default) or is picked here; manual
// lines default to 21%.
const RO_VAT_RATES: TvaRate[] = [
  { id: 'std',  name: 'Standard',     percent: 21, regime: 'standard', isDefault: true,  isActive: true },
  { id: 'red',  name: 'Redusă',       percent: 11, regime: 'standard', isDefault: false, isActive: true },
  { id: 'zero', name: 'Scutit / 0%',  percent: 0,  regime: 'standard', isDefault: false, isActive: true },
];

function emptyLine(vatRate = '21'): Line {
  return { code: '', description: '', quantity: '1', unit: 'buc', unitPrice: '', vatRate };
}

interface DossierPrefill {
  displayId: string;
  route: string;
  priceTotal: number | null; // major units (RON)
  currency?: string;
}

// ── Shared field styling ──────────────────────────────────────────────────
// Inputs sit one shade lighter than their card so they always read as a field.
const FIELD = 'bg-white/10 border border-white/[0.12] text-white placeholder:text-[#8FA6BC] focus:ring-2 focus:ring-[#E1FB15]/40';
const SELECT = `[color-scheme:dark] ${FIELD}`;
// Inset variant — for fields that live inside a line sub-card (which is itself
// bg-white/10), so the field stays one shade darker than its container.
const FIELD_INSET = 'bg-white/5 border border-white/[0.12] text-white placeholder:text-[#8FA6BC] focus:ring-2 focus:ring-[#E1FB15]/40';
const SELECT_INSET = `[color-scheme:dark] ${FIELD_INSET}`;
const LBL = 'mb-1.5 block text-[12px] font-medium text-[#A8BED2]';

// A numbered step card — gives the whole flow an obvious top-to-bottom order.
function Section({ n, title, desc, children }: { n: number; title: string; desc?: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl bg-white/5 p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-5">
        <span className="shrink-0 w-7 h-7 rounded-full bg-[#E1FB15] text-[#07090f] grid place-items-center text-[13px] font-bold tabular-nums">{n}</span>
        <div className="min-w-0">
          <h2 className="text-[16px] font-bold text-white leading-tight">{title}</h2>
          {desc && <p className="text-[12.5px] text-[#8FA6BC] mt-0.5">{desc}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

// A premium toggle row — replaces the bare native checkboxes.
function Toggle({ checked, onChange, title }: { checked: boolean; onChange: (v: boolean) => void; title: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-center gap-3 text-left p-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors"
    >
      <span className={`relative shrink-0 w-10 h-6 rounded-full transition-colors ${checked ? 'bg-[#E1FB15]' : 'bg-[#5E6B7C]'}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform ${checked ? 'translate-x-4 bg-[#07090f]' : 'translate-x-0 bg-white'}`} />
      </span>
      <span className="text-[13.5px] font-medium text-white leading-snug">{title}</span>
    </button>
  );
}

// U.M. picker — common units as a dropdown, keeping any custom value already set.
function UnitSelect({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      {value && !UNITS.includes(value) && <option value={value}>{value}</option>}
      {UNITS.map((u) => <option key={u} value={u}>{UNIT_LABELS[u] || u}</option>)}
    </Select>
  );
}

export default function InvoiceEmitForm({ kind, orderId, fromId, dossierPrefill, efacturaAutoSend = false, anafConnected = true, companyVatPayer = true }: { kind: Kind; orderId?: string; fromId?: string; dossierPrefill?: DossierPrefill; efacturaAutoSend?: boolean; anafConnected?: boolean; companyVatPayer?: boolean }) {
  // Recipient — picker uses external clients only for now. Internal linking
  // comes from the comenzi-emit-invoice flow with orderId pre-populated.
  const [clientSearch, setClientSearch] = useState('');
  const [clients, setClients] = useState<ExternalClient[]>([]);
  const [pickedClient, setPickedClient] = useState<ExternalClient | null>(null);
  const [showAddClient, setShowAddClient] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown when clicking outside the picker.
  useEffect(() => {
    if (!dropdownOpen) return;
    function onDocClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [dropdownOpen]);

  // Inline "add new client" form
  const [newClient, setNewClient] = useState({
    name: '', taxId: '', isVatPayer: false, country: 'Romania', city: '', address: '', email: '', phone: '',
  });
  const [cuiLookupHint, setCuiLookupHint] = useState('');
  const [cuiLookupState, setCuiLookupState] = useState<'idle' | 'loading' | 'found' | 'notfound'>('idle');

  const [currency, setCurrency] = useState(dossierPrefill?.currency || 'RON');
  const [vatRegime, setVatRegime] = useState('standard');
  const [language, setLanguage] = useState<'ro' | 'en'>('ro');
  const [precision, setPrecision] = useState('2');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const tvaRates = RO_VAT_RATES;
  const defaultVat = tvaRates.find((r) => r.isDefault) || tvaRates[0];
  // Series picker (Oblio-style): choose which series numbers this document.
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [seriesId, setSeriesId] = useState('');
  // Mark the invoice paid + emit a chitanță in one go (only for kind=factura).
  const [collectNow, setCollectNow] = useState(false);
  // e-Factura: trimite la ANAF la emitere. Implicit = setajul firmei (auto-send).
  const [sendEfactura, setSendEfactura] = useState(efacturaAutoSend);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [bnr, setBnr] = useState<{ rate: number; date: string } | null>(null);

  // Load product catalog once.
  useEffect(() => {
    fetch('/api/invoicing/products?active=1').then((r) => r.ok ? r.json() : { results: [] })
      .then((d) => setProducts(d.results || []))
      .catch(() => {});
  }, []);

  // Copy ("Copiază"): prefill the form from an existing invoice + its lines.
  useEffect(() => {
    if (!fromId) return;
    fetch(`/api/invoicing/invoices/${fromId}`).then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d?.invoice) return;
        const inv = d.invoice;
        setCurrency(inv.currency || 'RON');
        setVatRegime(inv.vatRegime || 'standard');
        setLanguage(inv.language === 'en' ? 'en' : 'ro');
        setPrecision(String(inv.precision ?? 2));
        if (inv.notes) setNotes(inv.notes);
        if (Array.isArray(d.lines) && d.lines.length) {
          setLines(d.lines.map((l: any) => ({
            code: l.code || '', description: l.description || '',
            quantity: String(l.quantity ?? 1), unit: l.unit || 'buc',
            unitPrice: ((l.unitPriceCents ?? 0) / 100).toFixed(2), vatRate: String(l.vatRate ?? 0),
          })));
        }
        if (inv.clientExternalId) {
          fetch(`/api/invoicing/clients`).then((r) => r.json()).then((cd) => {
            const c = (cd.results || []).find((x: ExternalClient) => x.id === inv.clientExternalId);
            if (c) setPickedClient(c);
          }).catch(() => {});
        }
      })
      .catch(() => {});
  }, [fromId]);

  // Load this company's series for the current document kind and pre-select the
  // default one (scope-aware: platform series when issuing from a TH order,
  // external otherwise — mirrors the server's auto-pick).
  useEffect(() => {
    fetch('/api/invoicing/series').then((r) => r.ok ? r.json() : { results: [] })
      .then((d) => {
        const all: Series[] = (d.results || []).filter((s: Series) => s.kind === kind);
        setSeriesList(all);
        const pref = orderId ? 'platform' : 'external';
        const pick =
          all.find((s) => s.isDefault && s.scope === pref) ||
          all.find((s) => s.isDefault && !s.scope) ||
          all.find((s) => s.isDefault) ||
          all[0];
        if (pick) setSeriesId(pick.id);
      })
      .catch(() => {});
  }, [kind, orderId]);

  // Refresh BNR rate when currency changes (skipped for RON).
  useEffect(() => {
    if (currency === 'RON') { setBnr(null); return; }
    // Guard against a race: if currency changes again before this resolves, a
    // slow earlier response must NOT overwrite the newer rate (last-request wins).
    let cancelled = false;
    const today = new Date().toISOString().slice(0, 10);
    fetch(`/api/invoicing/fx/bnr?date=${today}&currency=${currency}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (cancelled) return; if (d?.rate) setBnr({ rate: d.rate, date: d.date }); else setBnr(null); })
      .catch(() => { if (!cancelled) setBnr(null); });
    return () => { cancelled = true; };
  }, [currency]);

  const applyProductToLine = (i: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    setLines((ls) => ls.map((x, j) => j === i ? {
      productId: p.id,
      code: p.code || x.code,
      description: p.description ? `${p.name}, ${p.description}` : p.name,
      quantity: x.quantity || '1',
      unit: p.defaultUm || x.unit,
      unitPrice: p.defaultUnitPriceCents != null ? (p.defaultUnitPriceCents / 100).toFixed(2) : x.unitPrice,
      vatRate: p.defaultVatRate != null ? String(p.defaultVatRate) : x.vatRate,
    } : x));
  };
  const [dueDate, setDueDate] = useState('');
  // Due date as "N days from issue" instead of a calendar. Presets + free input.
  const isoInDays = (n: number) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const daysFromToday = (iso: string): number | '' => { if (!iso) return ''; const d = new Date(iso + 'T00:00:00'); const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((d.getTime() - t.getTime()) / 86400000); };
  const DUE_PRESETS: Array<[string, number]> = [['Azi', 0], ['Mâine', 1], ['7 zile', 7], ['14 zile', 14], ['30 zile', 30], ['60 zile', 60], ['90 zile', 90]];
  const [issueImmediately, setIssueImmediately] = useState(true);
  const [notes, setNotes] = useState(dossierPrefill ? `Dosar ${dossierPrefill.displayId}` : '');
  const [lines, setLines] = useState<Line[]>(() => {
    if (!dossierPrefill) return [emptyLine()];
    return [{
      code: '',
      description: `Transport ${dossierPrefill.displayId}: ${dossierPrefill.route}`,
      quantity: '1',
      unit: 'buc',
      unitPrice: dossierPrefill.priceTotal != null ? String(dossierPrefill.priceTotal) : '',
      vatRate: '21',
    }];
  });

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Draft autosave ── a 401 / accidental refresh mid-edit must not wipe typed
  // work. We persist the line items + a few fields to localStorage and offer to
  // restore them on a fresh (non-prefilled) form. Cleared on successful emit.
  const DRAFT_KEY = `fm-draft-invoice-${kind}`;
  const isPrefilled = !!(dossierPrefill || orderId || fromId);
  const [draftBanner, setDraftBanner] = useState(false);
  useEffect(() => {
    if (isPrefilled) return;
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (d?.lines?.some((l: Line) => l.description || l.unitPrice)) setDraftBanner(true);
    } catch { /* ignore */ }
  }, [DRAFT_KEY, isPrefilled]);
  useEffect(() => {
    if (isPrefilled) return;
    const id = window.setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ lines, notes, dueDate, currency })); } catch { /* ignore */ }
    }, 600);
    return () => window.clearTimeout(id);
  }, [lines, notes, dueDate, currency, isPrefilled, DRAFT_KEY]);
  // Flush the draft SYNCHRONOUSLY when leaving mid-edit — unmount, SPA navigation
  // (astro:before-swap) or tab close/refresh (pagehide). The debounced save above
  // gets its timer cleared on a quick exit, so without this the draft is lost.
  const draftRef = useRef({ lines, notes, dueDate, currency });
  draftRef.current = { lines, notes, dueDate, currency };
  useEffect(() => {
    if (isPrefilled) return;
    const flush = () => {
      try {
        const d = draftRef.current;
        if (d.lines?.some((l: Line) => l.description || l.unitPrice)) {
          localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
        }
      } catch { /* ignore */ }
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('astro:before-swap', flush);
    return () => {
      flush();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('astro:before-swap', flush);
    };
  }, [isPrefilled, DRAFT_KEY]);
  const restoreDraft = () => {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (d?.lines) setLines(d.lines);
      if (d?.notes != null) setNotes(d.notes);
      if (d?.dueDate != null) setDueDate(d.dueDate);
      if (d?.currency) setCurrency(d.currency);
    } catch { /* ignore */ }
    setDraftBanner(false);
  };
  const discardDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } setDraftBanner(false); };

  // Inline "save this typed line into the nomenclator" — per-line feedback.
  const [savingProdIdx, setSavingProdIdx] = useState<number | null>(null);
  const [savingClient, setSavingClient] = useState(false);
  const [savedProdIdx, setSavedProdIdx] = useState<Record<number, boolean>>({});
  // Which line's "save to nomenclator" popover is open.
  const [nomenIdx, setNomenIdx] = useState<number | null>(null);
  // Treat entered unit prices as VAT-inclusive (gross) → net/VAT back-calculated.
  const [priceIncludesVat, setPriceIncludesVat] = useState(false);
  // Full "create a new product/service" form, right inside the billing flow.
  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', code: '', unitPrice: '', unit: 'buc', vatRate: '', productType: 'Servicii' });

  // Initial client list
  useEffect(() => {
    fetch('/api/invoicing/clients').then((r) => r.json()).then((d) => setClients(d.results || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const url = clientSearch ? `/api/invoicing/clients?q=${encodeURIComponent(clientSearch)}` : '/api/invoicing/clients';
      fetch(url).then((r) => r.json()).then((d) => setClients(d.results || [])).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [clientSearch]);

  const lookupCui = async (attempt = 0) => {
    const cleaned = newClient.taxId.replace(/^RO/i, '').replace(/\D/g, '');
    if (cleaned.length < 2) return;
    setCuiLookupState('loading');
    setCuiLookupHint(attempt > 0 ? `ANAF ocupat, reîncerc... (${attempt}/2)` : 'Caut în ANAF...');
    try {
      const res = await fetch(`/api/anaf/lookup?cui=${encodeURIComponent(cleaned)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        // ANAF's free API is rate-limited (1 req/s) and flaky — a 429 / 5xx /
        // rate-limit message is TRANSIENT, not "CUI inexistent". Retry up to 2x
        // before giving up, and never say "negăsit" for a transient failure.
        // ANAF 404 = the CUI genuinely doesn't exist (deterministic) — don't retry.
        // Retry only truly-transient failures: our 429, ANAF 5xx, rate-limit/timeout.
        const transient = res.status === 429 || res.status >= 500
          || /rate|ocupat|reîncearcă|temporar|indisponibil|timeout|prea multe|anaf a răspuns 5/i.test(data.error || '');
        if (transient && attempt < 2) { setTimeout(() => lookupCui(attempt + 1), 1600); return; }
        setCuiLookupState('notfound');
        setCuiLookupHint(transient ? 'ANAF indisponibil acum — reîncearcă sau completează manual.' : 'CUI negăsit. Continuă manual.');
        return;
      }
      // ANAF returns only `address`; derive the city/locality from it.
      const parsedCity = ((data.address || '').match(/(?:MUNICIPIUL|MUN\.?|ORAŞUL|ORASUL|ORAŞ|ORAS|COMUNA|COM\.?|SAT)\s+([A-Za-zĂÂÎȘȚăâîșţş][A-Za-zĂÂÎȘȚăâîșţş.\- ]+?)(?:\s*,|\s+SECTOR|\s+STR\.|\s+NR\.|$)/i)?.[1] || '').trim().replace(/\s+/g, ' ');
      setNewClient((c) => ({
        ...c,
        name: c.name || data.name || '',
        city: c.city || parsedCity || '',
        address: c.address || data.address || '',
        isVatPayer: typeof data.isVatPayer === 'boolean' ? data.isVatPayer : c.isVatPayer,
      }));
      setCuiLookupState('found');
      setCuiLookupHint(`✓ ${data.name}${data.isVatPayer ? ' (plătitor TVA)' : ''}`);
    } catch {
      if (attempt < 2) { setTimeout(() => lookupCui(attempt + 1), 1600); return; }
      setCuiLookupState('notfound');
      setCuiLookupHint('Eroare de conexiune — reîncearcă.');
    }
  };

  // When the user types a CUI in the client search and opens "Adaugă client nou",
  // the CUI is pre-filled — auto-fetch the company from ANAF so it's recognized
  // without a manual blur.
  useEffect(() => {
    if (showAddClient && /^(RO)?\s*\d{2,}$/i.test(newClient.taxId.trim()) && !newClient.name.trim()) {
      lookupCui();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddClient]);

  const saveNewClient = async () => {
    if (savingClient) return; // guard against double-submit (duplicate client)
    if (!newClient.name.trim()) { setError('Numele clientului este obligatoriu'); return; }
    setSavingClient(true);
    try {
      const res = await fetch('/api/invoicing/clients', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newClient),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare client'); return; }
      setClients((cs) => [{ id: data.id, ...newClient } as any, ...cs]);
      setPickedClient({ id: data.id, ...newClient } as any);
      setShowAddClient(false);
    } catch { setError('Eroare conexiune'); } finally { setSavingClient(false); }
  };

  // Live totals — keep cents internally to avoid float drift
  // Net unit price in cents — if prices are VAT-inclusive, strip the VAT out.
  const netUnitCents = (l: Line) => {
    const entered = Math.round((parseFloat(l.unitPrice) || 0) * 100);
    const rate = parseFloat(l.vatRate) || 0;
    return priceIncludesVat ? Math.round(entered / (1 + rate / 100)) : entered;
  };
  const lineCalc = (l: Line) => {
    const q = parseFloat(l.quantity) || 0;
    const net = Math.round(q * netUnitCents(l));
    // Non-VAT-payer issuer: invoices carry no VAT (server enforces this too).
    const vat = companyVatPayer ? Math.round((net * (parseFloat(l.vatRate) || 0)) / 100) : 0;
    return { net, vat, total: net + vat };
  };
  const totals = lines.reduce((acc, l) => {
    const c = lineCalc(l);
    acc.sub += c.net;
    acc.vat += c.vat;
    return acc;
  }, { sub: 0, vat: 0 });
  const total = totals.sub + totals.vat;

  const fmt = (cents: number) => (cents / 100).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  // True when this line's description already matches a saved catalog product
  // (so we don't offer to save a duplicate).
  const alreadyInCatalog = (l: Line) =>
    !!l.description.trim() &&
    products.some((p) => p.name.trim().toLowerCase() === l.description.trim().toLowerCase());

  // Save a hand-typed line into the nomenclator so it's reusable next time.
  const saveLineAsProduct = async (i: number) => {
    const l = lines[i];
    if (!l.description.trim() || !l.unitPrice) return;
    setSavingProdIdx(i);
    setError('');
    try {
      const payload = {
        code: l.code.trim() || null,
        name: l.description.trim(),
        description: null,
        defaultUnitPriceCents: netUnitCents(l),
        defaultCurrency: currency,
        defaultUm: l.unit || 'buc',
        defaultVatRate: parseFloat(l.vatRate) || 0,
        productType: 'Servicii',
        isActive: true,
      };
      const res = await fetch('/api/invoicing/products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || 'Nu am putut salva produsul'); return; }
      const { id } = await res.json();
      setProducts((prev) => [{
        id, code: payload.code, name: payload.name, description: payload.description,
        defaultUnitPriceCents: payload.defaultUnitPriceCents, defaultCurrency: payload.defaultCurrency,
        defaultUm: payload.defaultUm, defaultVatRate: payload.defaultVatRate,
      } as CatalogProduct, ...prev]);
      setSavedProdIdx((m) => ({ ...m, [i]: true }));
    } catch {
      setError('Eroare conexiune');
    } finally {
      setSavingProdIdx(null);
    }
  };

  const openCreateProduct = () => {
    setNewProduct({ name: '', code: '', unitPrice: '', unit: 'buc', vatRate: defaultVat ? String(defaultVat.percent) : '21', productType: 'Servicii' });
    setShowCreateProduct(true);
  };

  // Create a brand-new product/service in the nomenclator and drop it straight
  // onto the invoice as a new line.
  const createProduct = async () => {
    if (!newProduct.name.trim()) { setError('Denumirea produsului este obligatorie'); return; }
    setCreatingProduct(true);
    setError('');
    try {
      const payload = {
        code: newProduct.code.trim() || null,
        name: newProduct.name.trim(),
        description: null,
        defaultUnitPriceCents: newProduct.unitPrice ? Math.round((parseFloat(newProduct.unitPrice) || 0) * 100) : null,
        defaultCurrency: currency,
        defaultUm: newProduct.unit || 'buc',
        defaultVatRate: newProduct.vatRate ? (parseFloat(newProduct.vatRate) || 0) : (defaultVat ? defaultVat.percent : 0),
        productType: newProduct.productType,
        isActive: true,
      };
      const res = await fetch('/api/invoicing/products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || 'Nu am putut crea produsul'); return; }
      const { id } = await res.json();
      const prod: CatalogProduct = {
        id, code: payload.code, name: payload.name, description: null,
        defaultUnitPriceCents: payload.defaultUnitPriceCents, defaultCurrency: payload.defaultCurrency,
        defaultUm: payload.defaultUm, defaultVatRate: payload.defaultVatRate,
      };
      setProducts((prev) => [prod, ...prev]);
      const lineData: Line = {
        code: prod.code || '',
        description: prod.name,
        quantity: '1',
        unit: prod.defaultUm || 'buc',
        unitPrice: prod.defaultUnitPriceCents != null ? (prod.defaultUnitPriceCents / 100).toFixed(2) : '',
        vatRate: prod.defaultVatRate != null ? String(prod.defaultVatRate) : (defaultVat ? String(defaultVat.percent) : '21'),
      };
      // Drop it onto the first empty line; only append if every line is filled.
      setLines((ls) => {
        const idx = ls.findIndex((l) => !l.description.trim() && !l.unitPrice && !l.code.trim());
        return idx >= 0 ? ls.map((l, j) => (j === idx ? lineData : l)) : [...ls, lineData];
      });
      setShowCreateProduct(false);
    } catch {
      setError('Eroare conexiune');
    } finally {
      setCreatingProduct(false);
    }
  };

  const submit = async () => {
    setError('');
    if (!pickedClient) { setError('Alege sau adaugă un client'); return; }
    if (lines.length === 0 || lines.some((l) => !l.description.trim() || !l.unitPrice)) {
      setError('Completează toate liniile (descriere și preț)'); return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/invoicing/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          seriesId: seriesId || null,
          clientExternalId: pickedClient.id,
          orderId: orderId || null,
          currency,
          vatRegime,
          language,
          precision: parseInt(precision, 10) || 2,
          attachmentUrl: attachmentUrl.trim() || null,
          attachmentName: attachmentName.trim() || null,
          dueAt: dueDate || null,
          issueImmediately,
          sendEfactura: kind === 'factura' ? sendEfactura : false,
          notes: notes || null,
          lines: lines.map((l) => ({
            productId: l.productId || null,
            code: l.code.trim() || null,
            description: l.description.trim(),
            quantity: parseFloat(l.quantity) || 0,
            unit: l.unit || 'buc',
            unitPriceCents: netUnitCents(l),
            vatRate: parseFloat(l.vatRate) || 0,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare la emitere'); return; }
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      // "Încasează acum" → record full payment + emit chitanță for the new invoice.
      if (collectNow && kind === 'factura' && total > 0) {
        await fetch(`/api/invoicing/invoices/${data.id}/chitanta`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amountCents: total, method: 'cash', reference: '' }),
        }).catch(() => {});
      }
      window.location.href = `/app/facturare/${data.id}`;
    } catch {
      setError('Eroare conexiune');
    } finally {
      setSaving(false);
    }
  };

  const selectedSeries = seriesList.find((s) => s.id === seriesId);

  return (
    <div className="pb-28 lg:pb-6">
      <h1 className="text-[24px] sm:text-[30px] font-bold tracking-[-0.02em] text-white mb-6">{KIND_TITLE[kind]}</h1>

      {draftBanner && (
        <div className="mb-5 flex flex-wrap items-center gap-3 px-4 py-3 rounded-2xl bg-[#E1FB15]/10 ring-1 ring-[#E1FB15]/25" role="status">
          <span className="text-[13.5px] text-white flex-1 min-w-0">Ai o ciornă nesalvată din sesiunea anterioară. O restaurezi?</span>
          <button type="button" onClick={restoreDraft} className="px-4 py-2 rounded-full bg-[#E1FB15] text-[#07090f] text-[13px] font-bold hover:bg-[#D2EA0E] transition-colors">Restaurează</button>
          <button type="button" onClick={discardDraft} className="px-3 py-2 rounded-full text-[13px] font-semibold text-[#A8BED2] hover:text-white transition-colors">Ignoră</button>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_330px] lg:gap-6 lg:items-start">
        {/* ── Left column: the document ── */}
        <div className="space-y-5 min-w-0">

          {/* ─── 1 · Client ─── */}
          <Section n={1} title="Către cine?" desc="Clientul care primește documentul">
            {pickedClient ? (
              <div className="flex items-center justify-between gap-3 p-4 bg-white/10 rounded-2xl">
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-white truncate">{pickedClient.name}</p>
                  <p className="text-[12.5px] text-[#A8BED2] truncate">{[pickedClient.taxId, pickedClient.city, pickedClient.country].filter(Boolean).join(' · ') || '—'}</p>
                </div>
                <Button variant="outline" size="sm" className="rounded-full bg-white/10 text-white border-0 hover:bg-white/15 hover:border-0 shrink-0" onClick={() => setPickedClient(null)}>Schimbă</Button>
              </div>
            ) : showAddClient ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-semibold text-white">Client nou</p>
                  <button type="button" onClick={() => setShowAddClient(false)} className="text-[13px] text-[#A8BED2] hover:text-white">Înapoi la căutare</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className={LBL}>CUI / Cod fiscal</Label>
                    <Input autoComplete="off" value={newClient.taxId} onChange={(e) => setNewClient((c) => ({ ...c, taxId: e.target.value }))} onBlur={() => lookupCui()} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); lookupCui(); } }} placeholder="ex: 14186770 sau RO14186770" className={FIELD} />
                    {cuiLookupHint && (
                      <p className={`text-[11px] mt-1.5 ${cuiLookupState === 'found' ? 'text-[#2E9E6A]' : 'text-[#E8A33C]'}`}>
                        {cuiLookupHint}
                        {cuiLookupState === 'notfound' && <button type="button" onClick={() => lookupCui()} className="ml-1.5 underline font-semibold">Reîncearcă</button>}
                      </p>
                    )}
                    {!cuiLookupHint && newClient.taxId.trim() && /^(ro)?\s*\d{2,10}$/i.test(newClient.taxId.trim()) && !isValidCui(newClient.taxId) && (
                      <p className="text-[11px] mt-1.5 text-[#E8A33C]">CUI-ul pare invalid (cifra de control nu corespunde). Verifică-l.</p>
                    )}
                  </div>
                  <div>
                    <Label className={LBL}>Nume *</Label>
                    <Input value={newClient.name} onChange={(e) => setNewClient((c) => ({ ...c, name: e.target.value }))} required className={FIELD} />
                  </div>
                  <div>
                    <Label className={LBL}>Țară</Label>
                    <Input value={newClient.country} onChange={(e) => setNewClient((c) => ({ ...c, country: e.target.value }))} className={FIELD} />
                  </div>
                  <div>
                    <Label className={LBL}>Oraș</Label>
                    <Input value={newClient.city} onChange={(e) => setNewClient((c) => ({ ...c, city: e.target.value }))} className={FIELD} />
                  </div>
                  <div className="md:col-span-2">
                    <Label className={LBL}>Adresă</Label>
                    <Input value={newClient.address} onChange={(e) => setNewClient((c) => ({ ...c, address: e.target.value }))} className={FIELD} />
                  </div>
                  <div>
                    <Label className={LBL}>Email</Label>
                    <Input type="email" value={newClient.email} onChange={(e) => setNewClient((c) => ({ ...c, email: e.target.value }))} className={FIELD} />
                  </div>
                  <div>
                    <Label className={LBL}>Telefon</Label>
                    <Input value={newClient.phone} onChange={(e) => setNewClient((c) => ({ ...c, phone: e.target.value }))} className={FIELD} />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-[13px] text-white">
                  <input type="checkbox" className="accent-[#E1FB15]" checked={newClient.isVatPayer} onChange={(e) => setNewClient((c) => ({ ...c, isVatPayer: e.target.checked }))} />
                  Plătitor de TVA
                </label>
                <div className="flex gap-2 pt-1">
                  <Button type="button" size="sm" className="rounded-full bg-[#E1FB15] text-[#07090f] hover:bg-[#D2EA0E] active:scale-100" onClick={saveNewClient}>Salvează client</Button>
                  <Button type="button" variant="outline" size="sm" className="rounded-full bg-white/10 text-white border-0 hover:bg-white/15 hover:border-0" onClick={() => setShowAddClient(false)}>Renunță</Button>
                </div>
              </div>
            ) : (
              <div ref={pickerRef} className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8FA6BC] pointer-events-none" />
                <Input
                  value={clientSearch}
                  onChange={(e) => { setClientSearch(e.target.value); setDropdownOpen(true); }}
                  onFocus={() => setDropdownOpen(true)}
                  placeholder="Caută client după nume sau CUI…"
                  className={`pl-10 rounded-full ${FIELD}`}
                  autoComplete="off"
                />
                {dropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-2 z-20 bg-[#07090f] ring-1 ring-white/10 rounded-2xl shadow-2xl overflow-hidden">
                    {clients.length > 0 ? (
                      <>
                        <p className="px-3.5 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8FA6BC]">
                          {clientSearch ? `${clients.length} rezultate` : 'Clienți recenți'}
                        </p>
                        <ul className="max-h-72 overflow-y-auto">
                          {clients.slice(0, 8).map((c) => (
                            <li key={c.id}>
                              <button
                                type="button"
                                onMouseDown={(e) => { e.preventDefault(); setPickedClient(c); setDropdownOpen(false); setClientSearch(''); }}
                                className="w-full text-left px-3.5 py-2.5 hover:bg-white/5 transition-colors"
                              >
                                <p className="text-[14px] font-medium text-white truncate">{c.name}</p>
                                <p className="text-[12px] text-[#A8BED2] truncate">{[c.taxId, c.city, c.country].filter(Boolean).join(' · ') || '—'}</p>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <p className="px-3.5 py-3 text-[13px] text-[#A8BED2]">
                        {clientSearch ? `Niciun client cu „${clientSearch}".` : 'Niciun client salvat încă.'}
                      </p>
                    )}
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const q = clientSearch.trim();
                        const looksLikeCui = /^(RO)?\d{2,}$/i.test(q);
                        setNewClient((c) => ({
                          ...c,
                          taxId: looksLikeCui ? q : c.taxId,
                          name: !looksLikeCui && q ? q : c.name,
                        }));
                        setShowAddClient(true);
                        setDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-1.5 px-3.5 py-3 border-t border-white/10 bg-white/5 hover:bg-white/10 text-[13px] font-semibold text-[#E1FB15] transition-colors"
                    >
                      <Plus className="w-4 h-4" /> Adaugă client nou{clientSearch ? ` „${clientSearch}"` : ''}
                    </button>
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* ─── 2 · Conținut ─── */}
          <Section n={2} title="Ce facturezi?" desc="Tastează direct descrierea sau alege din nomenclator">

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <button type="button" onClick={() => setPriceIncludesVat((v) => !v)} className="inline-flex items-center gap-2.5 pl-1.5 pr-3.5 h-9 rounded-full bg-white/10 text-[13px] font-medium text-white hover:bg-white/15 transition-colors">
                  <span className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${priceIncludesVat ? 'bg-[#E1FB15]' : 'bg-[#5E6B7C]'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform ${priceIncludesVat ? 'translate-x-4 bg-[#07090f]' : 'translate-x-0 bg-white'}`} />
                  </span>
                  Prețurile includ TVA
                </button>
                <button
                  type="button"
                  onClick={() => (showCreateProduct ? setShowCreateProduct(false) : openCreateProduct())}
                  className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full bg-white/10 text-white text-[13px] font-semibold hover:bg-white/15 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Produs nou
                </button>
              </div>

              {showCreateProduct && (
                <div className="rounded-2xl bg-white/10 p-4 space-y-3">
                  <p className="text-[13px] font-semibold text-white">Produs / serviciu nou</p>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    <div className="sm:col-span-3">
                      <Label className={LBL}>Denumire *</Label>
                      <Input value={newProduct.name} onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))} placeholder="ex: Consultanță transport" className={FIELD_INSET} />
                    </div>
                    <div>
                      <Label className={LBL}>Cod (opțional)</Label>
                      <Input value={newProduct.code} onChange={(e) => setNewProduct((p) => ({ ...p, code: e.target.value }))} placeholder="—" className={FIELD_INSET} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div>
                      <Label className={LBL}>Preț unitar</Label>
                      <Input type="number" step="0.01" value={newProduct.unitPrice} onChange={(e) => setNewProduct((p) => ({ ...p, unitPrice: e.target.value }))} placeholder="0.00" className={SELECT_INSET} />
                    </div>
                    <div>
                      <Label className={LBL}>U.M.</Label>
                      <UnitSelect value={newProduct.unit} onChange={(v) => setNewProduct((p) => ({ ...p, unit: v }))} className={SELECT_INSET} />
                    </div>
                    <div>
                      <Label className={LBL}>Cotă TVA</Label>
                      {tvaRates.length > 0 ? (
                        <Select value={newProduct.vatRate} onChange={(e) => setNewProduct((p) => ({ ...p, vatRate: e.target.value }))} className={SELECT_INSET}>
                          {tvaRates.map((r) => <option key={r.id} value={String(r.percent)}>{r.percent}% · {r.name}</option>)}
                        </Select>
                      ) : (
                        <Input type="number" step="1" value={newProduct.vatRate} onChange={(e) => setNewProduct((p) => ({ ...p, vatRate: e.target.value }))} className={SELECT_INSET} />
                      )}
                    </div>
                    <div>
                      <Label className={LBL}>Tip</Label>
                      <Select value={newProduct.productType} onChange={(e) => setNewProduct((p) => ({ ...p, productType: e.target.value }))} className={SELECT_INSET}>
                        {PRODUCT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </Select>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button type="button" size="sm" disabled={creatingProduct} className="rounded-full bg-[#E1FB15] text-[#07090f] hover:bg-[#D2EA0E] active:scale-100" onClick={createProduct}>
                      {creatingProduct ? 'Se salvează…' : 'Salvează și adaugă pe factură'}
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="rounded-full bg-white/5 text-white border-0 hover:bg-white/10 hover:border-0" onClick={() => setShowCreateProduct(false)}>Renunță</Button>
                  </div>
                </div>
              )}

              {lines.map((l, i) => {
                const lc = lineCalc(l);
                return (
                  <div key={i} className="rounded-2xl bg-white/10 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8FA6BC]">Linia {i + 1}</span>
                      <div className="relative flex items-center gap-1.5">
                        {l.description.trim() && (
                          <button
                            type="button"
                            onClick={() => setNomenIdx(nomenIdx === i ? null : i)}
                            className={`w-8 h-8 rounded-full bg-white/5 grid place-items-center hover:bg-white/10 transition-colors ${savedProdIdx[i] || alreadyInCatalog(l) ? 'text-[#2E9E6A]' : 'text-[#A8BED2]'}`}
                            aria-label="Salvează în nomenclator"
                            title="Salvează în nomenclator"
                          >
                            {savedProdIdx[i] || alreadyInCatalog(l) ? <BookmarkCheck className="w-4 h-4" /> : <BookmarkPlus className="w-4 h-4" />}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                          disabled={lines.length === 1}
                          className="w-9 h-9 rounded-full bg-white/5 grid place-items-center text-[#A8BED2] hover:bg-white/10 hover:text-[#DC4B41] disabled:opacity-30 transition-colors"
                          aria-label="Șterge linia"
                          title="Șterge linia"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>

                        {nomenIdx === i && (
                          <>
                            <button type="button" aria-hidden className="fixed inset-0 z-20 cursor-default" onClick={() => setNomenIdx(null)} />
                            <div className="fm-select-pop absolute right-0 top-full mt-2 z-30 w-60 max-w-[80vw] rounded-2xl p-3.5 text-left">
                              <p className="fm-pop-title text-[13px] font-semibold">Adaugă în nomenclator</p>
                              {savedProdIdx[i] || alreadyInCatalog(l) ? (
                                <p className="fm-pop-sub text-[12px] mt-1 inline-flex items-center gap-1"><Check className="w-3.5 h-3.5 text-[#2E9E6A] shrink-0" /> Produsul e deja salvat.</p>
                              ) : (
                                <>
                                  <p className="fm-pop-sub text-[12px] mt-1 mb-3">Salvează produsul ca să-l refolosești pe alte facturi.</p>
                                  <div className="flex gap-2">
                                    <button type="button" onClick={() => saveLineAsProduct(i)} disabled={savingProdIdx === i} className="flex-1 h-9 rounded-full bg-[#E1FB15] text-[#07090f] text-[13px] font-semibold hover:bg-[#D2EA0E] disabled:opacity-60 transition-colors">{savingProdIdx === i ? 'Se salvează…' : 'Salvează'}</button>
                                    <button type="button" onClick={() => setNomenIdx(null)} className="h-9 px-3 rounded-full bg-white/10 text-white text-[13px] font-semibold hover:bg-white/15 transition-colors">Renunță</button>
                                  </div>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {products.length > 0 && (
                      <div className="mb-3">
                        <Select
                          value=""
                          onChange={(e) => { if (e.target.value) applyProductToLine(i, e.target.value); }}
                          className={`text-[13px] ${SELECT_INSET}`}
                        >
                          <option value="">Alege din nomenclator…</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.code ? `[${p.code}] ` : ''}{p.name}
                              {p.defaultUnitPriceCents != null ? ` — ${(p.defaultUnitPriceCents / 100).toFixed(2)} ${p.defaultCurrency || 'RON'}` : ''}
                            </option>
                          ))}
                        </Select>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                      <div className="sm:col-span-3">
                        <Label className={LBL}>Descriere</Label>
                        <Input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="ex: Transport rutier București — Cluj" className={FIELD_INSET} />
                      </div>
                      <div>
                        <Label className={LBL}>Cod (opțional)</Label>
                        <Input value={l.code} onChange={(e) => setLine(i, { code: e.target.value })} placeholder="—" className={FIELD_INSET} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-2.5">
                      <div>
                        <Label className={LBL}>Cantitate</Label>
                        <Input type="number" step="0.01" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} className={SELECT_INSET} />
                      </div>
                      <div>
                        <Label className={LBL}>U.M.</Label>
                        <UnitSelect value={l.unit} onChange={(v) => setLine(i, { unit: v })} className={SELECT_INSET} />
                      </div>
                      <div>
                        <Label className={LBL}>Preț unitar{priceIncludesVat ? ' (cu TVA)' : ''}</Label>
                        <Input type="number" step="0.01" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} placeholder="0.00" className={SELECT_INSET} />
                      </div>
                      <div>
                        <Label className={LBL}>Cotă TVA</Label>
                        {!companyVatPayer ? (
                          <div className="flex h-11 w-full items-center rounded-xl border border-white/[0.12] bg-white/5 px-4 py-2.5 text-sm text-[#A8BED2]">Neplătitor TVA</div>
                        ) : tvaRates.length > 0 ? (
                          <Select value={l.vatRate} onChange={(e) => setLine(i, { vatRate: e.target.value })} className={SELECT_INSET}>
                            {!tvaRates.some((r) => String(r.percent) === l.vatRate) && <option value={l.vatRate}>{l.vatRate}%</option>}
                            {tvaRates.map((r) => <option key={r.id} value={String(r.percent)} title={r.name}>{r.percent}%</option>)}
                          </Select>
                        ) : (
                          <Input type="number" step="1" value={l.vatRate} onChange={(e) => setLine(i, { vatRate: e.target.value })} className={SELECT_INSET} />
                        )}
                      </div>
                    </div>

                    <div className="flex items-baseline justify-end gap-2 mt-3 pt-3 border-t border-white/10">
                      <span className="text-[12px] text-[#8FA6BC]">Valoare</span>
                      <span className="text-[15px] font-bold tabular-nums text-white">{fmt(lc.net)} {currency}</span>
                      {lc.vat > 0 && <span className="text-[11px] text-[#8FA6BC]">+ {fmt(lc.vat)} TVA</span>}
                    </div>
                  </div>
                );
              })}

              <Button type="button" variant="outline" size="sm" className="w-full rounded-2xl bg-white/10 text-white border-0 hover:bg-white/15 hover:border-0 h-12" onClick={() => setLines((ls) => [...ls, emptyLine(defaultVat ? String(defaultVat.percent) : '21')])}>
                <Plus className="w-4 h-4 mr-1.5" /> Adaugă linie
              </Button>
            </div>
          </Section>

          {/* ─── 3 · Detalii document ─── */}
          <Section n={3} title="Detalii document" desc="Serie, monedă, scadență și opțiuni">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label className={LBL}>Serie</Label>
                <Select className={SELECT} value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
                  {seriesList.length === 0 && <option value="">Serie implicită</option>}
                  {seriesList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.prefix} — {s.name}{s.scope ? ` (${s.scope === 'platform' ? 'facturamea' : 'extern'})` : ''}
                    </option>
                  ))}
                </Select>
                {selectedSeries
                  ? <p className="text-[11px] text-[#A8BED2] mt-1.5">Următorul număr: <span className="font-mono font-semibold text-white">{seriesNumberPreview(selectedSeries)}</span></p>
                  : <p className="text-[11px] text-[#A8BED2] mt-1.5">Gestionează seriile în <a href="/app/facturare/setari" className="text-[#E1FB15] hover:underline">Setări</a>.</p>}
              </div>
              <div>
                <Label className={LBL}>Monedă</Label>
                <Select className={SELECT} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="RON">RON</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </Select>
              </div>
              <div>
                <Label className={LBL}>Limbă</Label>
                <Select className={SELECT} value={language} onChange={(e) => setLanguage(e.target.value as 'ro' | 'en')}>
                  <option value="ro">Română (RO)</option>
                  <option value="en">English (EN)</option>
                </Select>
              </div>
              {(kind === 'factura' || kind === 'proforma') && (
                <div className="sm:col-span-2">
                  <Label className={LBL}>{kind === 'proforma' ? 'Valabilă' : 'Scadență'}</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {DUE_PRESETS.map(([label, n]) => {
                      const active = dueDate === isoInDays(n);
                      return (
                        <button type="button" key={label} onClick={() => setDueDate(isoInDays(n))}
                          className={`px-3 py-1.5 rounded-full text-[13px] font-semibold transition-colors ${active ? 'bg-[#E1FB15] text-[#07090f]' : 'bg-white/10 text-[#D7E5F0] hover:bg-white/15'}`}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2 mt-2.5">
                    <span className="text-[13px] text-[#A8BED2]">sau în</span>
                    <Input type="number" min="0" inputMode="numeric" value={daysFromToday(dueDate)}
                      onChange={(e) => { const v = e.target.value; setDueDate(v === '' ? '' : isoInDays(Math.max(0, parseInt(v) || 0))); }}
                      className={`${SELECT} w-24 text-center`} placeholder="zile" />
                    <span className="text-[13px] text-[#A8BED2]">zile de la emitere</span>
                    {dueDate && <span className="text-[13px] text-[#8FA6BC] ml-auto">scadent {new Date(dueDate + 'T00:00:00').toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest' })}</span>}
                  </div>
                </div>
              )}
              <div>
                <Label className={LBL}>Precizie</Label>
                <Select className={SELECT} value={precision} onChange={(e) => setPrecision(e.target.value)}>
                  <option value="2">2 zecimale</option>
                  <option value="0">Fără zecimale</option>
                  <option value="3">3 zecimale</option>
                  <option value="4">4 zecimale</option>
                </Select>
              </div>
            </div>
          </Section>

          {/* ─── 4 · Note ─── */}
          <Section n={4} title="Note & atașament" desc="Opțional — apar pe document">
            <div className="space-y-3">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Mențiuni — ex: termenul de plată, codul comenzii clientului…" className={FIELD} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className={LBL}>Atașează document (link)</Label>
                  <Input value={attachmentUrl} onChange={(e) => setAttachmentUrl(e.target.value)} placeholder="https://…" className={FIELD} />
                </div>
                <div>
                  <Label className={LBL}>Denumire atașament</Label>
                  <Input value={attachmentName} onChange={(e) => setAttachmentName(e.target.value)} placeholder="ex: CMR scanat" className={FIELD} />
                </div>
              </div>
            </div>
          </Section>
        </div>

        {/* ── Right column: sticky summary + emit ── */}
        <aside className="mt-5 lg:mt-0 lg:sticky lg:top-28 lg:self-start space-y-3">
          <div className="rounded-3xl bg-white/5 p-5 sm:p-6">
            <h2 className="text-[16px] font-bold text-white mb-4">Sumar</h2>
            <div className="space-y-2.5">
              <div className="flex justify-between text-[14px]"><span className="text-[#A8BED2]">Subtotal</span><span className="font-mono tabular-nums text-white">{fmt(totals.sub)} {currency}</span></div>
              <div className="flex justify-between text-[14px]"><span className="text-[#A8BED2]">TVA</span><span className="font-mono tabular-nums text-white">{fmt(totals.vat)} {currency}</span></div>
              <div className="flex items-baseline justify-between border-t border-white/10 pt-3 mt-1">
                <span className="text-[14px] font-semibold text-white">Total</span>
                <span className="text-[22px] font-bold tabular-nums text-white">{fmt(total)} <span className="text-[14px] text-[#A8BED2]">{currency}</span></span>
              </div>
              {bnr && currency !== 'RON' && (
                <div className="mt-3 pt-3 border-t border-white/10 text-[12px] text-[#A8BED2] space-y-1">
                  <div className="flex justify-between"><span>Curs BNR {bnr.date}</span><span className="font-mono">1 {currency} = {bnr.rate.toFixed(4)} RON</span></div>
                  <div className="flex justify-between font-semibold text-white"><span>Echivalent RON</span><span className="font-mono tabular-nums">{(total * bnr.rate).toLocaleString('ro-RO', { minimumFractionDigits: 2 })} RON</span></div>
                </div>
              )}
            </div>
          </div>

          <Toggle checked={issueImmediately} onChange={setIssueImmediately} title="Emite imediat (altfel rămâne ciornă)" />
          {kind === 'factura' && (
            <Toggle checked={collectNow} onChange={setCollectNow} title="Încasează acum (emite chitanță)" />
          )}
          {kind === 'factura' && issueImmediately && (
            <Toggle
              checked={sendEfactura}
              onChange={setSendEfactura}
              title={<>Trimite la e-Factura (ANAF){!anafConnected && <span className="text-[#E8A33C]"> · neconectat</span>}</>}
            />
          )}

          {error && (
            <div className="flex items-center gap-2 bg-[#DC4B41]/15 text-[#DC4B41] px-4 py-3 rounded-2xl text-[13px]">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          <Button type="button" disabled={saving} onClick={submit} className="w-full h-[52px] rounded-2xl bg-[#E1FB15] text-[#07090f] hover:bg-[#D2EA0E] active:scale-100 text-[15px] font-bold">
            {issueImmediately ? <Check className="w-5 h-5 mr-1.5" /> : <Save className="w-5 h-5 mr-1.5" />}
            {saving ? 'Se salvează…' : (issueImmediately ? 'Emite document' : 'Salvează ciornă')}
          </Button>
        </aside>
      </div>
    </div>
  );
}
