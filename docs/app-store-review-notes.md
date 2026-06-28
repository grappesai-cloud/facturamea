# App Store — Review Notes (de lipit în App Store Connect → App Review Information → Notes)

facturamea is a Romanian business invoicing & accounting app for companies, sole
traders (PFA) and freelancers. It lets users issue invoices, send them to the
Romanian tax authority (ANAF e-Factura / SPV), scan receipts, track expenses,
manage stock, and run reports — on the web and on iOS, with one account.

## Demo account (already activated, full access)
- Email: apple.review@facturamea.com
- Password: [COMPLETEAZĂ PAROLA AICI]
The account is pre-activated with a lifetime license and sample data (invoices,
clients, products, an expense), so the full app is available immediately.

## Native iOS features (this is a native app, not a website wrapper)
- Push notifications (APNs) — payment reminders, e-Factura status, account alerts.
- Camera + on-device OCR — scan paper receipts/invoices; text is recognised
  locally with Apple's Vision framework (no server round-trip) to pre-fill expenses.
- Face ID / Touch ID — optional biometric lock for the app (Settings → Security).
- Native share sheet — share invoices as PDF.
- Local notifications, status-bar and splash handled natively.
The app stores and works with the user's own business data; it is not a generic
browser to a public website.

## Payment model (re: Guideline 3.1.1)
facturamea is a multi-platform B2B service with a one-time business license that
is purchased on the web and used across web + mobile. In line with Guideline
3.1.3, the iOS app does NOT sell any digital content and shows no purchase or
upgrade UI — users simply sign in and use the service. There is no in-app
purchase to review.

## Privacy / account
- Sign in with Apple is offered (alongside Google and email).
- In-app account deletion + data export (GDPR) are in Settings → Security.
- Privacy policy: https://facturamea.com/confidentialitate
- Support: https://facturamea.com/asistenta

## Notes
ANAF e-Factura submission requires a Romanian digital certificate (the user's own),
so the e-Factura "send" step can't be fully exercised by the reviewer — but issuing
invoices, expenses, stock, POS and reports are all available with the demo account.
