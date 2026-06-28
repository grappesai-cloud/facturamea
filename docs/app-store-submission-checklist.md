# App Store — Checklist final de submisie (facturamea iOS)

Bundle ID: `com.facturamea.app` · Versiune: 1.0 (build 2) · Team: U9JS7DBG5V

Ce e deja gata în cod e marcat ✅. Restul faci tu, în ordine.

---

## FAZA 1 — Build în Xcode (pe Mac)

1. **Sync codul nativ** (prinde plugin-ul OCR + configul recent):
   ```
   cd ~/facturamea
   npm run build          # (opțional, doar dacă vrei www proaspăt)
   npx cap sync ios
   ```
2. **Deschide proiectul:** `npx cap open ios` (sau deschide `ios/App/App.xcworkspace`).
3. **Verifică plugin-ul OCR e în target:** în Xcode, panoul din stânga → folderul App →
   confirmă că `TextRecognitionPlugin.swift` și `.m` apar și au bifat **Target Membership = App**
   (selectează fișierul → inspector dreapta → Target Membership).
4. **Signing:** tab **Signing & Capabilities** → Team = contul tău (U9JS7DBG5V),
   "Automatically manage signing" bifat. Capabilities prezente: **Push Notifications**.
   ✅ versiune/build/bundle ID sunt deja setate.
5. **Selectează destinația:** sus, „Any iOS Device (arm64)" (NU simulator).
6. **Arhivează:** meniu **Product → Archive**. Așteaptă build-ul.
7. În **Organizer** (se deschide singur) → selectează arhiva → **Distribute App** →
   **App Store Connect** → **Upload** → Next până la final.
8. Așteaptă ~5-15 min ca build-ul să apară în App Store Connect (procesare).

> ✅ Export compliance e pre-rezolvat (`ITSAppUsesNonExemptEncryption=false`) — nu te întreabă.

---

## FAZA 2 — App Store Connect (în browser, appstoreconnect.apple.com)

### A. Creează înregistrarea (dacă nu există)
9. **My Apps → +** → New App. Platform iOS, Name = **facturamea**, Primary Language =
   Romanian, Bundle ID = com.facturamea.app, SKU = facturamea-ios. Create.

### B. Informații despre app (tab „App Information")
10. **Category:** Primary = **Business**, Secondary = Finance (opțional).
11. **Privacy Policy URL:** `https://facturamea.com/confidentialitate`
12. **Content Rights:** confirmă că deții drepturile.

### C. Prețuri (tab „Pricing and Availability")
13. **Price:** **Free** (app-ul e gratuit; licența se cumpără pe web — vezi review notes).
14. **Availability:** Romania (+ orice alte țări dorite).

### D. App Privacy (folosește `docs/app-store-privacy.md`)
15. Completează nutrition label EXACT ca în acel ghid:
    - Tracking = **None**
    - Linked to You: Contact Info (Email, Name, Address), Financial Info, User Content
      (Photos + Other), Identifiers (User ID, Device ID) — toate „App Functionality"
    - NU bifa: Payment Info, Contacts, Location, Purchases, Advertising

### E. Versiunea 1.0 (pagina „1.0 Prepare for Submission")
16. **Screenshots — OBLIGATORIU.** Minim **iPhone 6.7"/6.9"** (1290×2796 sau 1320×2868),
    3-6 bucăți. Fă poze de ecran reale pe iPhone (login, listă facturi, emite factură,
    scanare bon, rapoarte). NU folosi mockup-urile de marketing din public/screens.
17. **Description:** descriere RO (facturi, e-Factura ANAF, e-Transport, SAF-T, gestiune,
    POS, rapoarte; plată unică, fără abonament). Vezi textul de pe facturamea.com.
18. **Keywords:** facturare, e-factura, anaf, factura, pfa, contabilitate, gestiune.
19. **Support URL:** `https://facturamea.com/asistenta`
20. **Marketing URL** (opțional): `https://facturamea.com`
21. **App Icon:** 1024×1024 — ✅ deja în proiect, se preia din build.
22. **Build:** apasă „+ Build" / „Select a build" → alege build-ul urcat la Faza 1.

### F. App Review Information (CRITIC — folosește `docs/app-store-review-notes.md`)
23. **Sign-In required:** Yes. **Demo account:**
    - User: `apple.review@facturamea.com`
    - Password: **(completează parola reală)**
24. **Notes:** lipește tot conținutul din `docs/app-store-review-notes.md`
    (subliniază funcțiile native — Push, Camera+OCR on-device, Face ID — pentru Guideline 4.2,
    și explică modelul de plată B2B pentru 3.1.1).
25. **Contact:** numele tău + email + telefon.

### G. Age Rating
26. Completează chestionarul → pentru un app de business va rezulta **4+**.

---

## FAZA 3 — Trimite
27. Sus dreapta → **Add for Review** → **Submit for Review**.
28. Status devine „Waiting for Review". Review-ul durează de obicei 24-48h.

---

## Dacă te resping pe Guideline 4.2 (model hosted)
Nu intra în panică — răspunzi în Resolution Center:
- Subliniezi funcțiile native: **notificări push (APNs), scanare bonuri cu camera +
  OCR on-device (Apple Vision), blocare biometrică Face ID, share nativ**.
- Explici că app-ul lucrează cu datele de business ale userului (cont propriu), nu e un
  browser către un site public.
- Dacă insistă, oferă-te să adaugi mai multe ecrane native. (Bundle-ul complet al
  FE-ului nu e fezabil — app-ul e SSR — deci mizezi pe funcțiile native + aceste note.)

## Checklist scurt înainte de „Submit"
- [ ] Build urcat și selectat (Faza 1)
- [ ] Screenshots iPhone 6.7"+ încărcate
- [ ] App Privacy completat (zero tracking)
- [ ] Demo account + parolă în Review Notes
- [ ] Privacy + Support URL setate
- [ ] Price = Free
- [ ] Age rating completat
