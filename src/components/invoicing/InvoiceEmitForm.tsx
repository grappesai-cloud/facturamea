import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Plus, Trash2, AlertCircle, Search, Save } from 'lucide-react';

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

type Kind = 'factura' | 'proforma' | 'storno' | 'chitanta';

const KIND_TITLE: Record<Kind, string> = {
  factura: 'Emite factură',
  proforma: 'Emite proformă',
  storno: 'Emite factură storno',
  chitanta: 'Emite chitanță',
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
  code: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string; // in major units (RON), converted to cents on submit
  vatRate: string;
}

interface TvaRate { id: string; name: string; percent: number; regime: string; isDefault: boolean; isActive: boolean }

const VAT_REGIMES: { value: string; label: string }[] = [
  { value: 'standard', label: 'TVA standard' },
  { value: 'reverse_charge', label: 'Taxare inversă' },
  { value: 'exempt', label: 'Scutit de TVA' },
  { value: 'tva_la_incasare', label: 'TVA la încasare' },
  { value: 'export_extra_eu', label: 'Export extra-UE (0%)' },
  { value: 'intra_eu', label: 'Livrare intra-UE (0%)' },
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

export default function InvoiceEmitForm({ kind, orderId, fromId, dossierPrefill, efacturaAutoSend = false }: { kind: Kind; orderId?: string; fromId?: string; dossierPrefill?: DossierPrefill; efacturaAutoSend?: boolean }) {
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
  const [tvaRates, setTvaRates] = useState<TvaRate[]>([]);
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

  // Load this company's VAT-rate catalogue (Cote TVA) for the per-line selector.
  useEffect(() => {
    fetch('/api/invoicing/tva').then((r) => r.ok ? r.json() : { results: [] })
      .then((d) => {
        const rates: TvaRate[] = (d.results || []).filter((r: TvaRate) => r.isActive);
        setTvaRates(rates);
        const def = rates.find((r) => r.isDefault) || rates[0];
        // Apply default cota to any line still on the hardcoded default.
        if (def) setLines((ls) => ls.map((x) => (x.vatRate === '21' || x.vatRate === '19') ? { ...x, vatRate: String(def.percent) } : x));
      })
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
    const today = new Date().toISOString().slice(0, 10);
    fetch(`/api/invoicing/fx/bnr?date=${today}&currency=${currency}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.rate) setBnr({ rate: d.rate, date: d.date }); else setBnr(null); })
      .catch(() => setBnr(null));
  }, [currency]);

  const applyProductToLine = (i: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    setLines((ls) => ls.map((x, j) => j === i ? {
      code: p.code || x.code,
      description: p.description ? `${p.name} — ${p.description}` : p.name,
      quantity: x.quantity || '1',
      unit: p.defaultUm || x.unit,
      unitPrice: p.defaultUnitPriceCents != null ? (p.defaultUnitPriceCents / 100).toFixed(2) : x.unitPrice,
      vatRate: p.defaultVatRate != null ? String(p.defaultVatRate) : x.vatRate,
    } : x));
  };
  const [dueDate, setDueDate] = useState('');
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

  const lookupCui = async () => {
    const cleaned = newClient.taxId.replace(/^RO/i, '').replace(/\D/g, '');
    if (cleaned.length < 2) return;
    setCuiLookupState('loading');
    setCuiLookupHint('Caut în ANAF...');
    try {
      const res = await fetch(`/api/tools/lookup-cui?cui=${encodeURIComponent(cleaned)}`);
      const data = await res.json();
      if (!res.ok || !data.found) {
        setCuiLookupState('notfound');
        setCuiLookupHint('CUI negăsit. Continuă manual.');
        return;
      }
      setNewClient((c) => ({
        ...c,
        name: c.name || data.name || '',
        city: c.city || data.city || '',
        address: c.address || data.address || '',
        isVatPayer: typeof data.isVatPayer === 'boolean' ? data.isVatPayer : c.isVatPayer,
      }));
      setCuiLookupState('found');
      setCuiLookupHint(`✓ ${data.name}${data.isVatPayer ? ' (plătitor TVA)' : ''}`);
    } catch {
      setCuiLookupState('notfound');
      setCuiLookupHint('Eroare lookup.');
    }
  };

  const saveNewClient = async () => {
    if (!newClient.name.trim()) { setError('Numele clientului este obligatoriu'); return; }
    const res = await fetch('/api/invoicing/clients', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newClient),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || 'Eroare client'); return; }
    setClients((cs) => [{ id: data.id, ...newClient } as any, ...cs]);
    setPickedClient({ id: data.id, ...newClient } as any);
    setShowAddClient(false);
  };

  // Live totals — keep cents internally to avoid float drift
  const totals = lines.reduce((acc, l) => {
    const q = parseFloat(l.quantity) || 0;
    const upCents = Math.round((parseFloat(l.unitPrice) || 0) * 100);
    const lineSub = Math.round(q * upCents);
    const rate = parseFloat(l.vatRate) || 0;
    const lineVat = Math.round((lineSub * rate) / 100);
    acc.sub += lineSub;
    acc.vat += lineVat;
    return acc;
  }, { sub: 0, vat: 0 });
  const total = totals.sub + totals.vat;

  const fmt = (cents: number) => (cents / 100).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
            code: l.code.trim() || null,
            description: l.description.trim(),
            quantity: parseFloat(l.quantity) || 0,
            unit: l.unit || 'buc',
            unitPriceCents: Math.round((parseFloat(l.unitPrice) || 0) * 100),
            vatRate: parseFloat(l.vatRate) || 0,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Eroare la emitere'); return; }
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#0A0A0A]">{KIND_TITLE[kind]}</h1>
      {error && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-100">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* ─── Client picker ─── */}
      <Card>
        <CardHeader><CardTitle>Client</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {pickedClient ? (
            <div className="flex items-center justify-between gap-3 p-3 bg-[#FAFAF8] border border-[#E8E8E4] rounded-xl">
              <div className="min-w-0">
                <p className="font-semibold text-[#0A0A0A] truncate">{pickedClient.name}</p>
                <p className="text-xs text-[#6B6B68] truncate">{[pickedClient.taxId, pickedClient.city, pickedClient.country].filter(Boolean).join(' · ')}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setPickedClient(null)}>Schimbă</Button>
            </div>
          ) : (
            <>
              <div ref={pickerRef} className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A8A8A4] pointer-events-none" />
                <Input
                  value={clientSearch}
                  onChange={(e) => { setClientSearch(e.target.value); setDropdownOpen(true); }}
                  onFocus={() => setDropdownOpen(true)}
                  placeholder="Caută client (nume sau CUI)"
                  className="pl-9"
                  autoComplete="off"
                />
                {dropdownOpen && !showAddClient && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-[#E8E8E4] rounded-xl shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)] overflow-hidden">
                    {clients.length > 0 ? (
                      <>
                        <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8A8A85]">
                          {clientSearch ? `${clients.length} rezultate` : 'Clienți recenți'}
                        </p>
                        <ul className="max-h-72 overflow-y-auto divide-y divide-[#E8E8E4]">
                          {clients.slice(0, 8).map((c) => (
                            <li key={c.id}>
                              <button
                                type="button"
                                onMouseDown={(e) => { e.preventDefault(); setPickedClient(c); setDropdownOpen(false); setClientSearch(''); }}
                                className="w-full text-left px-3 py-2 hover:bg-[#FAFAF8] transition-colors"
                              >
                                <p className="text-sm font-medium text-[#0A0A0A] truncate">{c.name}</p>
                                <p className="text-xs text-[#6B6B68] truncate">{[c.taxId, c.city, c.country].filter(Boolean).join(' · ') || '—'}</p>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <p className="px-3 py-3 text-sm text-[#6B6B68]">
                        {clientSearch ? `Niciun client cu „${clientSearch}" în listă.` : 'Niciun client salvat încă.'}
                      </p>
                    )}
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        // Prefill the new-client form with whatever the user typed so far
                        // (CUI if it looks numeric/RO-prefixed, otherwise treat as name).
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
                      className="w-full text-left px-3 py-2.5 border-t border-[#E8E8E4] bg-[#FAFAF8] hover:bg-[#F0F0EC] text-sm font-semibold text-[#FF5C00] transition-colors"
                    >
                      + Adaugă client nou{clientSearch ? ` „${clientSearch}"` : ''}
                    </button>
                  </div>
                )}
              </div>
              {!showAddClient && (
                <button
                  type="button"
                  onClick={() => { setShowAddClient(true); setDropdownOpen(false); }}
                  className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[#FF5C00] hover:underline"
                >
                  + Adaugă client nou
                </button>
              )}
              {showAddClient && (
                <div className="space-y-3 p-3 bg-[#FAFAF8]/50 rounded-xl border border-[#E8E8E4]">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="mb-1.5 block text-xs">CUI / Cod fiscal</Label>
                      <div className="flex gap-2">
                        <Input value={newClient.taxId} onChange={(e) => setNewClient((c) => ({ ...c, taxId: e.target.value }))} onBlur={lookupCui} placeholder="ex: 14186770 sau RO14186770" />
                      </div>
                      {cuiLookupHint && <p className={`text-[11px] mt-1.5 ${cuiLookupState === 'found' ? 'text-green-700' : 'text-amber-700'}`}>{cuiLookupHint}</p>}
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs">Nume *</Label>
                      <Input value={newClient.name} onChange={(e) => setNewClient((c) => ({ ...c, name: e.target.value }))} required />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs">Țară</Label>
                      <Input value={newClient.country} onChange={(e) => setNewClient((c) => ({ ...c, country: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs">Oraș</Label>
                      <Input value={newClient.city} onChange={(e) => setNewClient((c) => ({ ...c, city: e.target.value }))} />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="mb-1.5 block text-xs">Adresă</Label>
                      <Input value={newClient.address} onChange={(e) => setNewClient((c) => ({ ...c, address: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs">Email</Label>
                      <Input type="email" value={newClient.email} onChange={(e) => setNewClient((c) => ({ ...c, email: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs">Telefon</Label>
                      <Input value={newClient.phone} onChange={(e) => setNewClient((c) => ({ ...c, phone: e.target.value }))} />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-[#0A0A0A] col-span-1 md:col-span-2">
                      <input type="checkbox" checked={newClient.isVatPayer} onChange={(e) => setNewClient((c) => ({ ...c, isVatPayer: e.target.checked }))} />
                      Plătitor de TVA
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={saveNewClient}>Salvează client</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowAddClient(false)}>Renunță</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── Document settings ─── */}
      <Card>
        <CardHeader><CardTitle>Document</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <Label className="mb-1.5 block text-xs">Serie factură</Label>
            <Select value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
              {seriesList.length === 0 && <option value="">Serie implicită</option>}
              {seriesList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.prefix} — {s.name}{s.scope ? ` (${s.scope === 'platform' ? 'facturamea' : 'extern'})` : ''}
                </option>
              ))}
            </Select>
            {(() => {
              const sel = seriesList.find((s) => s.id === seriesId);
              return sel
                ? <p className="text-[11px] text-[#6B6B68] mt-1">Următorul număr: <span className="font-mono font-semibold text-[#0A0A0A]">{seriesNumberPreview(sel)}</span></p>
                : <p className="text-[11px] text-[#6B6B68] mt-1">Gestionează seriile în <a href="/app/facturare/setari" className="text-[#FF5C00] hover:underline">Setări</a>.</p>;
            })()}
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">Monedă</Label>
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="RON">RON</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">Regim TVA</Label>
            <Select value={vatRegime} onChange={(e) => setVatRegime(e.target.value)}>
              {VAT_REGIMES.map((r) => <option value={r.value}>{r.label}</option>)}
            </Select>
          </div>
          {kind === 'factura' && (
            <div>
              <Label className="mb-1.5 block text-xs">Scadență</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          )}
          <div>
            <Label className="mb-1.5 block text-xs">Limbă</Label>
            <Select value={language} onChange={(e) => setLanguage(e.target.value as 'ro' | 'en')}>
              <option value="ro">Română (RO)</option>
              <option value="en">English (EN)</option>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">Precizie</Label>
            <Select value={precision} onChange={(e) => setPrecision(e.target.value)}>
              <option value="2">2 zecimale</option>
              <option value="0">Fără zecimale</option>
              <option value="3">3 zecimale</option>
              <option value="4">4 zecimale</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ─── Line items ─── */}
      <Card>
        <CardHeader><CardTitle>Conținut</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              {products.length > 0 && (
                <div className="col-span-12 md:col-span-12 mb-1">
                  <Select onChange={(e) => { if (e.target.value) applyProductToLine(i, e.target.value); }} value="" className="text-xs">
                    <option value="">+ Selectează din nomenclator…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code ? `[${p.code}] ` : ''}{p.name}
                        {p.defaultUnitPriceCents != null ? ` — ${(p.defaultUnitPriceCents / 100).toFixed(2)} ${p.defaultCurrency || 'RON'}` : ''}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              <div className="col-span-4 md:col-span-2">
                {i === 0 && <Label className="mb-1.5 block text-xs">Cod</Label>}
                <Input value={l.code} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, code: e.target.value } : x))} placeholder="opțional" />
              </div>
              <div className="col-span-8 md:col-span-4">
                {i === 0 && <Label className="mb-1.5 block text-xs">Descriere</Label>}
                <Input value={l.description} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} placeholder="ex: Transport rutier București — Cluj" />
              </div>
              <div className="col-span-3 md:col-span-1">
                {i === 0 && <Label className="mb-1.5 block text-xs">Cant.</Label>}
                <Input type="number" step="0.01" value={l.quantity} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} />
              </div>
              <div className="col-span-3 md:col-span-1">
                {i === 0 && <Label className="mb-1.5 block text-xs">UM</Label>}
                <Input value={l.unit} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} placeholder="buc" />
              </div>
              <div className="col-span-3 md:col-span-2">
                {i === 0 && <Label className="mb-1.5 block text-xs">Preț unit.</Label>}
                <Input type="number" step="0.01" value={l.unitPrice} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, unitPrice: e.target.value } : x))} placeholder="0.00" />
              </div>
              <div className="col-span-3 md:col-span-1">
                {i === 0 && <Label className="mb-1.5 block text-xs">Cotă TVA</Label>}
                {tvaRates.length > 0 ? (
                  <Select value={l.vatRate} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, vatRate: e.target.value } : x))}>
                    {!tvaRates.some((r) => String(r.percent) === l.vatRate) && <option value={l.vatRate}>{l.vatRate}%</option>}
                    {tvaRates.map((r) => <option key={r.id} value={String(r.percent)}>{r.percent}% · {r.name}</option>)}
                  </Select>
                ) : (
                  <Input type="number" step="1" value={l.vatRate} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, vatRate: e.target.value } : x))} />
                )}
              </div>
              <div className="col-span-12 md:col-span-1 flex items-end justify-end">
                <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length === 1} className="p-2 text-[#A8A8A4] hover:text-red-600 disabled:opacity-40">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          <div className="pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, emptyLine(defaultVat ? String(defaultVat.percent) : '21')])}>
              <Plus className="w-4 h-4 mr-1" /> Adaugă linie
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── Notes + totals ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Note & atașament (opțional)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Mențiuni — ex: termenul de plată, codul comenzii clientului..." />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Label className="mb-1.5 block text-xs">Atașează document (link)</Label>
                <Input value={attachmentUrl} onChange={(e) => setAttachmentUrl(e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs">Denumire atașament</Label>
                <Input value={attachmentName} onChange={(e) => setAttachmentName(e.target.value)} placeholder="ex: CMR scanat" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Total</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm"><span className="text-[#3D3D3A]">Subtotal</span><span className="font-mono tabular-nums">{fmt(totals.sub)} {currency}</span></div>
            <div className="flex justify-between text-sm"><span className="text-[#3D3D3A]">TVA</span><span className="font-mono tabular-nums">{fmt(totals.vat)} {currency}</span></div>
            <div className="flex justify-between text-base font-bold border-t border-[#E8E8E4] pt-2 mt-2"><span>Total de plată</span><span className="font-mono tabular-nums">{fmt(total)} {currency}</span></div>
            {bnr && currency !== 'RON' && (
              <div className="mt-3 pt-3 border-t border-[#E8E8E4] text-xs text-[#6B6B68] space-y-0.5">
                <div className="flex justify-between"><span>Curs BNR {bnr.date}</span><span className="font-mono">1 {currency} = {bnr.rate.toFixed(4)} RON</span></div>
                <div className="flex justify-between font-semibold text-[#0A0A0A]"><span>Echivalent RON</span><span className="font-mono tabular-nums">{(total * bnr.rate).toLocaleString('ro-RO', { minimumFractionDigits: 2 })} RON</span></div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-sm text-[#0A0A0A]">
          <input type="checkbox" checked={issueImmediately} onChange={(e) => setIssueImmediately(e.target.checked)} />
          Emite imediat (altfel rămâne ca ciornă)
        </label>
        {kind === 'factura' && (
          <label className="flex items-center gap-2 text-sm text-[#0A0A0A]">
            <input type="checkbox" checked={collectNow} onChange={(e) => setCollectNow(e.target.checked)} />
            Încasează factura acum (emite chitanță)
          </label>
        )}
        {kind === 'factura' && issueImmediately && (
          <label className="flex items-center gap-2 text-sm text-[#0A0A0A]">
            <input type="checkbox" checked={sendEfactura} onChange={(e) => setSendEfactura(e.target.checked)} />
            Trimite la e-Factura (ANAF) acum
          </label>
        )}
        <div className="flex-1" />
        <Button type="button" disabled={saving} onClick={submit} className="min-w-[180px]">
          <Save className="w-4 h-4 mr-1.5" />
          {saving ? 'Se salvează...' : (issueImmediately ? 'Emite document' : 'Salvează ca ciornă')}
        </Button>
      </div>
    </div>
  );
}
