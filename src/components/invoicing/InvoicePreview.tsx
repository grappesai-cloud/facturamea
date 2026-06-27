// Live, updating preview of an invoice design. Mirrors the 5 templates in
// InvoiceDocument.astro (classic · modern · minimal · bold · elegant) so the
// user sees their design change instantly while editing — no save needed.
interface Draft {
  layoutKey: string;
  brandColor: string;
  logoUrl?: string | null;
  footerText?: string | null;
  showQr?: boolean;
  showShipping?: boolean;
  showEmittedWith?: boolean;
}

const SAMPLE = {
  supplier: 'Compania Mea SRL',
  cui: 'RO12345678',
  iban: 'RO49 AAAA 1B31 0075 9384 0000',
  number: 'FCT-2026-0042',
  date: '21.06.2026',
  due: '21.07.2026',
  buyer: 'Client Demo SRL',
  buyerCui: 'RO87654321',
  lines: [
    { d: 'Servicii consultanță', q: '1', up: '2.400,00', vat: '21%', tot: '2.904,00' },
    { d: 'Licență software', q: '2', up: '600,00', vat: '21%', tot: '1.452,00' },
    { d: 'Mentenanță lunară', q: '1', up: '450,00', vat: '21%', tot: '544,50' },
  ],
  subtotal: '3.450,00',
  vat: '655,50',
  total: '4.105,50',
};

export default function InvoicePreview({ draft }: { draft: Draft }) {
  const layout = ['classic', 'modern', 'minimal', 'bold', 'elegant'].includes(draft.layoutKey)
    ? draft.layoutKey
    : (draft.layoutKey === 'accent' ? 'elegant' : 'classic');
  const brand = draft.brandColor && draft.brandColor !== '#0A0A0A' ? draft.brandColor : '#07090f';
  const cfg = ({
    classic: { topBar: true, band: false, stripe: false, tableFill: true, totalFill: false, panel: false },
    modern: { topBar: false, band: true, stripe: false, tableFill: true, totalFill: true, panel: false },
    minimal: { topBar: false, band: false, stripe: false, tableFill: false, totalFill: false, panel: false },
    bold: { topBar: false, band: false, stripe: true, tableFill: true, totalFill: true, panel: false },
    elegant: { topBar: false, band: false, stripe: false, tableFill: true, totalFill: false, panel: true },
  } as Record<string, any>)[layout];

  const INK = '#07090f', MUTED = '#46627A', FAINT = '#8FA6BC', LINE = '#E3EAF1', LINE2 = '#EFF3F7';

  const Logo = ({ dark }: { dark?: boolean }) =>
    draft.logoUrl ? (
      <img src={draft.logoUrl} alt="" style={{ maxHeight: 28, marginBottom: 6 }} />
    ) : (
      <div style={{ fontSize: 13, fontWeight: 800, color: dark ? '#fff' : brand, marginBottom: 4 }}>Compania Mea</div>
    );

  return (
    <div className="rounded-2xl overflow-hidden ring-1 ring-black/[0.06] shadow-[0_20px_60px_-30px_rgba(16,42,67,0.5)]">
      <div
        style={{
          background: '#fff',
          color: INK,
          fontSize: 8,
          lineHeight: 1.35,
          padding: 18,
          paddingLeft: cfg.stripe ? 22 : 18,
          borderTop: cfg.topBar ? `4px solid ${brand}` : undefined,
          borderLeft: cfg.stripe ? `5px solid ${brand}` : undefined,
          fontFamily: "'Outfit', ui-sans-serif, system-ui, sans-serif",
        }}
      >
        {/* Header */}
        {cfg.band ? (
          <div style={{ background: brand, color: '#fff', margin: -18, marginBottom: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <Logo dark />
                <div style={{ fontSize: 7, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.7 }}>Furnizor</div>
                <div style={{ fontWeight: 700, fontSize: 11 }}>{SAMPLE.supplier}</div>
                <div style={{ opacity: 0.8 }}>CUI: {SAMPLE.cui}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 7, textTransform: 'uppercase', opacity: 0.7 }}>Factură fiscală</div>
                <div style={{ fontSize: layout === 'bold' ? 18 : 15, fontWeight: 700, fontFamily: 'monospace' }}>{SAMPLE.number}</div>
                <div style={{ opacity: 0.8 }}>Data: {SAMPLE.date}</div>
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              paddingBottom: 10,
              marginBottom: cfg.panel ? 6 : 10,
              borderBottom: cfg.panel ? undefined : `1px solid ${LINE}`,
              background: cfg.panel ? `${brand}0F` : undefined,
              borderRadius: cfg.panel ? 10 : undefined,
              padding: cfg.panel ? 12 : undefined,
            }}
          >
            <div>
              <Logo />
              <div style={{ fontSize: 7, textTransform: 'uppercase', letterSpacing: 0.5, color: FAINT }}>Furnizor</div>
              <div style={{ fontWeight: 700, fontSize: 11, color: INK }}>{SAMPLE.supplier}</div>
              <div style={{ color: MUTED }}>CUI: {SAMPLE.cui}</div>
              <div style={{ color: MUTED }}>IBAN: {SAMPLE.iban}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {layout === 'minimal' ? (
                <div style={{ fontSize: 7, textTransform: 'uppercase', letterSpacing: 1.5, color: MUTED }}>Factură fiscală</div>
              ) : (
                <span style={{ display: 'inline-block', fontSize: 7, fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 999, color: '#fff', background: brand }}>Factură fiscală</span>
              )}
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color: brand, marginTop: 3 }}>{SAMPLE.number}</div>
              <div style={{ color: MUTED, marginTop: 2 }}>Data: {SAMPLE.date}</div>
              <div style={{ color: MUTED }}>Scadență: {SAMPLE.due}</div>
            </div>
          </div>
        )}

        {/* Buyer */}
        <div style={{ paddingBottom: 8, marginBottom: 8, borderBottom: `1px solid ${LINE}` }}>
          <div style={{ fontSize: 7, textTransform: 'uppercase', letterSpacing: 0.5, color: FAINT }}>Cumpărător</div>
          <div style={{ fontWeight: 700, fontSize: 10, color: INK }}>{SAMPLE.buyer}</div>
          <div style={{ color: MUTED }}>CUI: {SAMPLE.buyerCui}</div>
        </div>

        {/* Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
          <thead>
            <tr
              style={
                cfg.tableFill
                  ? { background: brand, color: '#fff', textAlign: 'left' }
                  : { color: brand, textAlign: 'left', borderBottom: `2px solid ${brand}` }
              }
            >
              <th style={{ padding: '4px 5px', fontSize: 6.5, textTransform: 'uppercase' }}>Descriere</th>
              <th style={{ padding: '4px 5px', fontSize: 6.5, textTransform: 'uppercase', textAlign: 'right' }}>Cant.</th>
              <th style={{ padding: '4px 5px', fontSize: 6.5, textTransform: 'uppercase', textAlign: 'right' }}>Preț</th>
              <th style={{ padding: '4px 5px', fontSize: 6.5, textTransform: 'uppercase', textAlign: 'right' }}>TVA</th>
              <th style={{ padding: '4px 5px', fontSize: 6.5, textTransform: 'uppercase', textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {SAMPLE.lines.map((l, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${LINE2}` }}>
                <td style={{ padding: '4px 5px', color: INK }}>{l.d}</td>
                <td style={{ padding: '4px 5px', textAlign: 'right' }}>{l.q}</td>
                <td style={{ padding: '4px 5px', textAlign: 'right' }}>{l.up}</td>
                <td style={{ padding: '4px 5px', textAlign: 'right' }}>{l.vat}</td>
                <td style={{ padding: '4px 5px', textAlign: 'right', fontWeight: 600 }}>{l.tot}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Total */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          {cfg.totalFill ? (
            <div style={{ width: '55%', background: brand, color: '#fff', borderRadius: 8, padding: 10 }}>
              <Row label="Subtotal" value={`${SAMPLE.subtotal} RON`} faded />
              <Row label="TVA" value={`${SAMPLE.vat} RON`} faded />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 10, borderTop: '1px solid rgba(255,255,255,0.25)', paddingTop: 4, marginTop: 4 }}>
                <span>Total de plată</span>
                <span>{SAMPLE.total} RON</span>
              </div>
            </div>
          ) : (
            <div style={{ width: '55%', ...(cfg.panel ? { background: `${brand}0F`, borderRadius: 8, padding: 10 } : {}) }}>
              <Row label="Subtotal" value={`${SAMPLE.subtotal} RON`} muted={MUTED} />
              <Row label="TVA" value={`${SAMPLE.vat} RON`} muted={MUTED} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 10, color: brand, borderTop: `1px solid ${brand}55`, paddingTop: 4, marginTop: 4 }}>
                <span>Total de plată</span>
                <span>{SAMPLE.total} RON</span>
              </div>
            </div>
          )}
        </div>

        {/* footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', marginTop: 14 }}>
          <div style={{ width: 60, borderTop: `1px solid ${LINE}`, paddingTop: 3, textAlign: 'center', color: FAINT, fontSize: 6.5 }}>Semnătură</div>
        </div>

        {draft.footerText && (
          <div style={{ marginTop: 12, paddingTop: 6, borderTop: `1px solid ${LINE}`, textAlign: 'center', color: FAINT, fontSize: 6.5, whiteSpace: 'pre-wrap' }}>{draft.footerText}</div>
        )}
        {draft.showEmittedWith && (
          <div style={{ marginTop: 6, textAlign: 'center', color: FAINT, fontSize: 6 }}>Emis cu facturamea · facturamea.com</div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, faded, muted }: { label: string; value: string; faded?: boolean; muted?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', color: faded ? 'rgba(255,255,255,0.8)' : muted }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
