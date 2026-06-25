// HTML email templates for transactional notifications.
// All templates use a consistent shell (header + body + footer) and are RO/EN aware.

export type EmailLocale = 'ro' | 'en';

interface ShellOpts {
  locale?: EmailLocale;
  preheader?: string;
}

const COLORS = {
  navy900: '#0a1929',
  navy700: '#334e68',
  navy500: '#627d98',
  navy300: '#9fb3c8',
  navy100: '#d9e2ec',
  navy50: '#f0f4f8',
  accent500: '#f0b429',
  accent600: '#de911d',
  white: '#ffffff',
};

function shell(content: string, { locale = 'ro', preheader = '' }: ShellOpts = {}): string {
  const footer = locale === 'en'
    ? `You received this because you have a facturamea account. <a href="https://facturamea.com/app/setari/notifications" style="color:${COLORS.accent600};text-decoration:none">Manage preferences</a> · <a href="https://facturamea.com" style="color:${COLORS.accent600};text-decoration:none">facturamea.com</a>`
    : `Primești acest email pentru că ai cont facturamea. <a href="https://facturamea.com/app/setari/notifications" style="color:${COLORS.accent600};text-decoration:none">Gestionează preferințele</a> · <a href="https://facturamea.com" style="color:${COLORS.accent600};text-decoration:none">facturamea.com</a>`;

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>facturamea</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.navy50};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${COLORS.navy900}">
<div style="display:none;max-height:0;overflow:hidden;color:transparent">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.navy50};padding:32px 16px">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:${COLORS.white};border-radius:16px;overflow:hidden;border:1px solid ${COLORS.navy100}">
      <tr><td style="background:${COLORS.navy900};padding:24px 32px">
        <table role="presentation" width="100%"><tr>
          <td style="vertical-align:middle">
            <span style="display:inline-block;background:linear-gradient(135deg,#f7c948,#de911d);width:32px;height:32px;border-radius:8px;text-align:center;line-height:32px;font-weight:bold;color:white;vertical-align:middle">TH</span>
            <span style="margin-left:8px;color:white;font-size:18px;font-weight:bold;letter-spacing:-0.01em;vertical-align:middle">facturamea</span>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:32px">${content}</td></tr>
      <tr><td style="padding:20px 32px;border-top:1px solid ${COLORS.navy100};background:${COLORS.navy50};font-size:12px;color:${COLORS.navy500};text-align:center;line-height:1.5">${footer}</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="border-radius:12px;background:${COLORS.accent500}">
    <a href="${href}" style="display:inline-block;padding:12px 24px;color:white;text-decoration:none;font-weight:600;font-size:14px;border-radius:12px">${label}</a>
  </td></tr></table>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${COLORS.navy700}">${text}</p>`;
}

function heading(text: string): string {
  return `<h1 style="margin:0 0 16px;font-size:22px;color:${COLORS.navy900};font-weight:700;line-height:1.3">${text}</h1>`;
}

function metaRow(label: string, value: string): string {
  return `<tr><td style="padding:8px 0;color:${COLORS.navy500};font-size:13px;width:130px">${label}</td><td style="padding:8px 0;color:${COLORS.navy900};font-size:14px;font-weight:600">${value}</td></tr>`;
}

// ─── Templates ───────────────────────────────────────────

export interface OrderCreatedData {
  orderNumber: string;
  loadingCity: string;
  unloadingCity: string;
  loadingDate: string;
  carrierName: string;
  price: string;
  orderUrl: string;
}

export function orderCreatedEmail(data: OrderCreatedData, locale: EmailLocale = 'ro'): { subject: string; html: string; text: string } {
  const t = locale === 'en' ? {
    subject: `Order ${data.orderNumber} created`,
    h1: 'New transport order',
    intro: 'A new transport order was created on facturamea.',
    cta: 'View order details',
    labels: { num: 'Order #', route: 'Route', date: 'Loading', carrier: 'Carrier', price: 'Agreed price' },
    text: `Order ${data.orderNumber} created — ${data.loadingCity} → ${data.unloadingCity}, loading ${data.loadingDate}, carrier ${data.carrierName}, price ${data.price}. View: ${data.orderUrl}`,
  } : {
    subject: `Comanda ${data.orderNumber} a fost creată`,
    h1: 'Comandă transport nouă',
    intro: 'O nouă comandă de transport a fost creată pe facturamea.',
    cta: 'Vezi detalii comandă',
    labels: { num: 'Nr. comandă', route: 'Rută', date: 'Încărcare', carrier: 'Transportator', price: 'Preț convenit' },
    text: `Comanda ${data.orderNumber} creată — ${data.loadingCity} → ${data.unloadingCity}, încărcare ${data.loadingDate}, transportator ${data.carrierName}, preț ${data.price}. Vezi: ${data.orderUrl}`,
  };

  const content = `
${heading(t.h1)}
${paragraph(t.intro)}
<table role="presentation" style="width:100%;background:${COLORS.navy50};border-radius:12px;padding:16px;margin-bottom:8px">
  ${metaRow(t.labels.num, data.orderNumber)}
  ${metaRow(t.labels.route, `${data.loadingCity} → ${data.unloadingCity}`)}
  ${metaRow(t.labels.date, data.loadingDate)}
  ${metaRow(t.labels.carrier, data.carrierName)}
  ${metaRow(t.labels.price, data.price)}
</table>
${button(data.orderUrl, t.cta)}`;

  return { subject: t.subject, html: shell(content, { locale, preheader: t.intro }), text: t.text };
}

export interface AuctionBidData {
  auctionTitle: string;
  bidPrice: string;
  bidderName: string;
  totalBids: number;
  auctionUrl: string;
}

export function auctionBidEmail(data: AuctionBidData, locale: EmailLocale = 'ro'): { subject: string; html: string; text: string } {
  const t = locale === 'en' ? {
    subject: `New bid on your auction`,
    h1: 'New bid received',
    intro: `<strong>${data.bidderName}</strong> placed a bid of <strong>${data.bidPrice}</strong> on your auction.`,
    info: `You now have ${data.totalBids} bid(s) total.`,
    cta: 'View auction & bids',
    text: `New bid: ${data.bidPrice} from ${data.bidderName} on "${data.auctionTitle}". Total ${data.totalBids} bids. ${data.auctionUrl}`,
  } : {
    subject: 'Ofertă nouă la licitația ta',
    h1: 'Ofertă nouă primită',
    intro: `<strong>${data.bidderName}</strong> a plasat o ofertă de <strong>${data.bidPrice}</strong> la licitația ta.`,
    info: `Ai în total ${data.totalBids} oferte.`,
    cta: 'Vezi licitația și ofertele',
    text: `Ofertă nouă: ${data.bidPrice} de la ${data.bidderName} la „${data.auctionTitle}". Total ${data.totalBids} oferte. ${data.auctionUrl}`,
  };

  const content = `
${heading(t.h1)}
${paragraph(`<strong>${data.auctionTitle}</strong>`)}
${paragraph(t.intro)}
${paragraph(`<span style="color:${COLORS.navy500};font-size:13px">${t.info}</span>`)}
${button(data.auctionUrl, t.cta)}`;

  return { subject: t.subject, html: shell(content, { locale, preheader: t.intro.replace(/<[^>]+>/g, '') }), text: t.text };
}

export interface AuctionAwardedData {
  auctionTitle: string;
  winnerName: string;
  finalPrice: string;
  orderNumber: string;
  orderUrl: string;
  isWinner: boolean;
}

export function auctionAwardedEmail(data: AuctionAwardedData, locale: EmailLocale = 'ro'): { subject: string; html: string; text: string } {
  const t = locale === 'en' ? {
    subject: data.isWinner ? `🎉 You won the auction!` : `Auction awarded`,
    h1: data.isWinner ? '🎉 You won the auction!' : 'Auction was awarded',
    intro: data.isWinner
      ? `Congratulations — your bid of <strong>${data.finalPrice}</strong> on "${data.auctionTitle}" won. Order ${data.orderNumber} was created automatically.`
      : `The auction "${data.auctionTitle}" was awarded to ${data.winnerName} at ${data.finalPrice}.`,
    cta: data.isWinner ? 'View order' : 'View auction',
    text: data.isWinner
      ? `You won! ${data.auctionTitle} at ${data.finalPrice}. Order ${data.orderNumber}: ${data.orderUrl}`
      : `Auction "${data.auctionTitle}" awarded to ${data.winnerName} at ${data.finalPrice}.`,
  } : {
    subject: data.isWinner ? `🎉 Ai câștigat licitația!` : `Licitație atribuită`,
    h1: data.isWinner ? '🎉 Ai câștigat licitația!' : 'Licitația a fost atribuită',
    intro: data.isWinner
      ? `Felicitări — oferta ta de <strong>${data.finalPrice}</strong> la „${data.auctionTitle}" a câștigat. Comanda ${data.orderNumber} a fost creată automat.`
      : `Licitația „${data.auctionTitle}" a fost atribuită lui ${data.winnerName} la ${data.finalPrice}.`,
    cta: data.isWinner ? 'Vezi comanda' : 'Vezi licitația',
    text: data.isWinner
      ? `Ai câștigat! ${data.auctionTitle} la ${data.finalPrice}. Comanda ${data.orderNumber}: ${data.orderUrl}`
      : `Licitația „${data.auctionTitle}" atribuită lui ${data.winnerName} la ${data.finalPrice}.`,
  };

  const content = `
${heading(t.h1)}
${paragraph(t.intro)}
${button(data.orderUrl, t.cta)}`;

  return { subject: t.subject, html: shell(content, { locale, preheader: t.intro.replace(/<[^>]+>/g, '') }), text: t.text };
}

export interface DocumentExpiryData {
  documentName: string;
  documentType: string;
  daysUntilExpiry: number;
  expiresAt: string;
  url: string;
}

export function documentExpiryEmail(data: DocumentExpiryData, locale: EmailLocale = 'ro'): { subject: string; html: string; text: string } {
  const t = locale === 'en' ? {
    subject: `${data.documentType} expires in ${data.daysUntilExpiry} days`,
    h1: `Document expires soon`,
    intro: `Your <strong>${data.documentType}</strong> ("${data.documentName}") expires in <strong>${data.daysUntilExpiry} days</strong> (on ${data.expiresAt}).`,
    cta: 'Update document',
    text: `${data.documentType} "${data.documentName}" expires ${data.expiresAt} (in ${data.daysUntilExpiry} days). Update: ${data.url}`,
  } : {
    subject: `${data.documentType} expiră în ${data.daysUntilExpiry} zile`,
    h1: 'Document expiră curând',
    intro: `<strong>${data.documentType}</strong> („${data.documentName}") expiră în <strong>${data.daysUntilExpiry} zile</strong> (pe ${data.expiresAt}).`,
    cta: 'Actualizează documentul',
    text: `${data.documentType} „${data.documentName}" expiră ${data.expiresAt} (în ${data.daysUntilExpiry} zile). Actualizează: ${data.url}`,
  };

  const content = `
${heading('⚠️ ' + t.h1)}
${paragraph(t.intro)}
${button(data.url, t.cta)}`;

  return { subject: t.subject, html: shell(content, { locale, preheader: t.intro.replace(/<[^>]+>/g, '') }), text: t.text };
}

export interface PasswordResetData {
  resetUrl: string;
  expiresInHours: number;
}

export function passwordResetEmail(data: PasswordResetData, locale: EmailLocale = 'ro'): { subject: string; html: string; text: string } {
  const t = locale === 'en' ? {
    subject: 'Reset your facturamea password',
    h1: 'Reset your password',
    intro: `You requested a password reset. Click the button below to set a new password. The link expires in ${data.expiresInHours} hour(s).`,
    fallback: 'If you did not request this, ignore this email — your password remains unchanged.',
    cta: 'Reset password',
    text: `Reset your facturamea password: ${data.resetUrl} (expires in ${data.expiresInHours}h)`,
  } : {
    subject: 'Resetează parola facturamea',
    h1: 'Resetează-ți parola',
    intro: `Ai cerut resetarea parolei. Apasă butonul de mai jos pentru a seta o parolă nouă. Linkul expiră în ${data.expiresInHours} oră (oră).`,
    fallback: 'Dacă nu ai cerut tu această resetare, ignoră acest email — parola rămâne neschimbată.',
    cta: 'Resetează parola',
    text: `Resetează parola facturamea: ${data.resetUrl} (expiră în ${data.expiresInHours}h)`,
  };

  const content = `
${heading(t.h1)}
${paragraph(t.intro)}
${button(data.resetUrl, t.cta)}
${paragraph(`<span style="color:${COLORS.navy500};font-size:12px">${t.fallback}</span>`)}`;

  return { subject: t.subject, html: shell(content, { locale, preheader: t.intro }), text: t.text };
}

export interface EmailVerificationData {
  verifyUrl: string;
  expiresInHours: number;
}

export function emailVerificationEmail(data: EmailVerificationData, locale: EmailLocale = 'ro'): { subject: string; html: string; text: string } {
  const t = locale === 'en' ? {
    subject: 'Confirm your facturamea email',
    h1: 'Confirm your email address',
    intro: `Welcome to facturamea! Click the button below to confirm your email address. The link expires in ${data.expiresInHours} hour(s).`,
    fallback: 'If you did not create this account, you can safely ignore this email.',
    cta: 'Confirm email',
    text: `Confirm your facturamea email: ${data.verifyUrl} (expires in ${data.expiresInHours}h)`,
  } : {
    subject: 'Confirmă adresa de email facturamea',
    h1: 'Confirmă-ți adresa de email',
    intro: `Bine ai venit pe facturamea! Apasă butonul de mai jos pentru a confirma adresa de email. Linkul expiră în ${data.expiresInHours} ore.`,
    fallback: 'Dacă nu ai creat tu acest cont, poți ignora acest email.',
    cta: 'Confirmă emailul',
    text: `Confirmă adresa de email facturamea: ${data.verifyUrl} (expiră în ${data.expiresInHours}h)`,
  };

  const content = `
${heading(t.h1)}
${paragraph(t.intro)}
${button(data.verifyUrl, t.cta)}
${paragraph(`<span style="color:${COLORS.navy500};font-size:12px">${t.fallback}</span>`)}`;

  return { subject: t.subject, html: shell(content, { locale, preheader: t.intro }), text: t.text };
}

export interface NewMessageData {
  senderName: string;
  preview: string;
  conversationUrl: string;
}

export function newMessageEmail(data: NewMessageData, locale: EmailLocale = 'ro'): { subject: string; html: string; text: string } {
  const t = locale === 'en' ? {
    subject: `New message from ${data.senderName}`,
    h1: 'New message',
    intro: `<strong>${data.senderName}</strong> sent you a message:`,
    cta: 'Open conversation',
    text: `New message from ${data.senderName}: "${data.preview}". Open: ${data.conversationUrl}`,
  } : {
    subject: `Mesaj nou de la ${data.senderName}`,
    h1: 'Mesaj nou',
    intro: `<strong>${data.senderName}</strong> ți-a trimis un mesaj:`,
    cta: 'Deschide conversația',
    text: `Mesaj nou de la ${data.senderName}: „${data.preview}". Deschide: ${data.conversationUrl}`,
  };

  const content = `
${heading(t.h1)}
${paragraph(t.intro)}
<blockquote style="margin:16px 0;padding:16px;background:${COLORS.navy50};border-left:3px solid ${COLORS.accent500};border-radius:8px;color:${COLORS.navy700};font-size:14px;font-style:italic">${data.preview}</blockquote>
${button(data.conversationUrl, t.cta)}`;

  return { subject: t.subject, html: shell(content, { locale, preheader: t.intro.replace(/<[^>]+>/g, '') }), text: t.text };
}

// ─── Waitlist (early-access) ─────────────────────────────
// Cream / orange themed shell to match the new landing page,
// independent of the navy app shell used for transactional emails.
const WAITLIST = {
  bg: '#EDF1F5',
  ink: '#0A2238',
  mute: '#5a5a5a',
  signal: '#1A759F',
  border: 'rgba(10,10,10,0.12)',
};

function waitlistShell(content: string, preheader: string): string {
  return `<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>facturamea — Acces anticipat</title>
</head>
<body style="margin:0;padding:0;background:${WAITLIST.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${WAITLIST.ink}">
<div style="display:none;max-height:0;overflow:hidden;color:transparent">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${WAITLIST.bg};padding:40px 16px">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${WAITLIST.border}">
      <tr><td style="padding:32px 40px 24px;border-bottom:1px solid ${WAITLIST.border}">
        <span style="font-size:13px;letter-spacing:2px;color:${WAITLIST.ink};font-weight:600">Transport<span style="color:${WAITLIST.signal}">HUB</span></span>
      </td></tr>
      <tr><td style="padding:40px">${content}</td></tr>
      <tr><td style="padding:24px 40px;border-top:1px solid ${WAITLIST.border};font-size:11px;color:${WAITLIST.mute};letter-spacing:0.5px">
        Primești acest email pentru că ai aplicat pentru acces anticipat la facturamea.<br>
        Dacă nu tu ai aplicat, ignoră acest mesaj.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export interface WaitlistThankYouData {
  name: string;
  companyType: 'transportator' | 'expeditie' | 'client' | 'partener';
}

export function waitlistThankYouEmail(data: WaitlistThankYouData): { subject: string; html: string; text: string } {
  const subject = 'Te-am adăugat pe lista de acces anticipat — facturamea';
  const preheader = `Mulțumim, ${data.name}. Te anunțăm pe email când platforma e gata.`;
  const roleLabel = {
    transportator: 'transportator',
    expeditie: 'casă de expediții',
    client: 'client',
    partener: 'partener care vinde servicii / echipamente',
  }[data.companyType];

  const content = `
<h1 style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:28px;font-weight:800;color:${WAITLIST.ink};letter-spacing:-0.5px;line-height:1.2">Mulțumim, ${data.name}.</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:${WAITLIST.ink}">Te-am adăugat pe lista de acces anticipat ca <strong>${roleLabel}</strong>.</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:${WAITLIST.mute}">
  facturamea se construiește pentru a deveni prima bursă din România unde seriozitatea și transparența devin standard. Estimăm că prima versiune va fi disponibilă <strong style="color:${WAITLIST.ink}">la jumătatea lunii mai – început de iunie</strong>.
</p>
<div style="margin:32px 0;padding:20px 24px;background:rgba(255,92,0,0.06);border-left:3px solid ${WAITLIST.signal}">
  <p style="margin:0;font-size:14px;line-height:1.6;color:${WAITLIST.ink};font-weight:600">Ce urmează</p>
  <p style="margin:8px 0 0;font-size:14px;line-height:1.7;color:${WAITLIST.mute}">
    Când platforma e gata, primești email cu link de activare ca să-ți finalizezi contul și să intri din prima zi.
  </p>
</div>
<p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:${WAITLIST.mute}">
  Susținut de ASET România. Construit împreună cu industria.
</p>`;

  const text = `Mulțumim, ${data.name}.\n\nTe-am adăugat pe lista de acces anticipat ca ${roleLabel}.\n\nfacturamea se construiește pentru a deveni prima bursă din România unde seriozitatea și transparența devin standard. Estimăm că prima versiune va fi disponibilă la jumătatea lunii mai – început de iunie.\n\nCând platforma e gata, primești email cu link de activare ca să-ți finalizezi contul.\n\nSusținut de ASET România.`;

  return { subject, html: waitlistShell(content, preheader), text };
}

// ─── Daily digest ─────────────────────────────────────

export interface DailyDigestData {
  userName: string;
  pendingBidsCount: number;
  unreadMessagesCount: number;
  expiringDocsCount: number;
  newOrdersCount: number;
  myFreightLiveCount: number;
  endingAuctionsCount: number;
  appUrl: string;
}

export function dailyDigestEmail(data: DailyDigestData, locale: EmailLocale = 'ro'): { subject: string; html: string; text: string } {
  const total = data.pendingBidsCount + data.unreadMessagesCount + data.expiringDocsCount
              + data.newOrdersCount + data.endingAuctionsCount;

  const t = locale === 'en' ? {
    subject: `facturamea — ${total} updates today`,
    intro: `Hi ${data.userName}, here's what changed since yesterday.`,
    cta: 'Open dashboard',
    bidsLabel: 'New bids on your loads',
    msgsLabel: 'Unread messages',
    docsLabel: 'Documents expiring soon',
    ordersLabel: 'Orders awaiting your action',
    liveLabel: 'Your live freight',
    endingLabel: 'Auctions ending in <2h',
    footer: 'Manage notification preferences',
  } : {
    subject: `facturamea — ${total} actualizări azi`,
    intro: `Bună ${data.userName}, ce s-a schimbat de ieri.`,
    cta: 'Deschide dashboard',
    bidsLabel: 'Bid-uri noi pe ofertele tale',
    msgsLabel: 'Mesaje necitite',
    docsLabel: 'Documente care expiră curând',
    ordersLabel: 'Comenzi care aşteaptă',
    liveLabel: 'Marfa ta activă',
    endingLabel: 'Licitaţii care se închid în <2h',
    footer: 'Gestionează preferinţele de notificare',
  };

  const items = [
    { label: t.bidsLabel,    n: data.pendingBidsCount },
    { label: t.msgsLabel,    n: data.unreadMessagesCount },
    { label: t.docsLabel,    n: data.expiringDocsCount },
    { label: t.ordersLabel,  n: data.newOrdersCount },
    { label: t.liveLabel,    n: data.myFreightLiveCount },
    { label: t.endingLabel,  n: data.endingAuctionsCount },
  ].filter((i) => i.n > 0);

  const itemsHtml = items.map((i) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #E3EAF1;color:#0A2238;font-size:14px">${i.label}</td>
      <td style="padding:12px 0;border-bottom:1px solid #E3EAF1;text-align:right;color:#1A759F;font-weight:700;font-size:18px;font-variant-numeric:tabular-nums">${i.n}</td>
    </tr>`).join('');

  const content = `
<p style="margin:0 0 24px;color:#46627A;font-size:14px;line-height:1.5">${t.intro}</p>
<table style="width:100%;border-collapse:collapse;margin:0 0 24px">${itemsHtml}</table>
<p style="margin:0 0 16px;text-align:center">
  <a href="${data.appUrl}" style="display:inline-block;background:#1A759F;color:#fff;padding:12px 28px;border-radius:6px;font-weight:600;text-decoration:none;font-size:14px">${t.cta} →</a>
</p>
<p style="margin:32px 0 0;color:#9FB8CC;font-size:11px;text-align:center">
  <a href="${data.appUrl}/setari/notifications" style="color:#9FB8CC;text-decoration:underline">${t.footer}</a>
</p>`;

  const text = `${t.intro}\n\n${items.map(i => `  ${i.label}: ${i.n}`).join('\n')}\n\n${t.cta}: ${data.appUrl}\n\n${t.footer}: ${data.appUrl}/setari/notifications`;

  return { subject: t.subject, html: shell(content, { locale, preheader: t.intro }), text };
}
