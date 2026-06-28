# Google Play — Checklist final de submisie (facturamea Android)

Package: `com.facturamea.app` · versionCode 1 · versionName 1.0 · targetSdk 35

Ce e gata în cod e ✅. Restul faci tu, în ordine.

---

## ⚠️ CITEȘTE PRIMA DATĂ — regula testării pentru conturi noi
Google cere ca **conturile de dezvoltator PERSONALE noi** (create după nov. 2023) să
ruleze un **closed test cu minim 12 testeri timp de 14 zile** ÎNAINTE de a publica în
producție. Deci „mâine direct în producție" **nu e posibil** dacă e cont personal nou.
- Cont **personal nou** → începi cu **Closed testing** (12 testeri / 14 zile), apoi producție.
- Cont **Organization** (firmă, cu D-U-N-S) → de regulă **scutit** de această regulă.
Recomandare: dacă vrei lansare rapidă, înregistrează cont **Organization**, sau pornește
ACUM testul închis ca să curgă cele 14 zile.

---

## FAZA 1 — Build semnat în Android Studio (pe Mac)

1. **Sync:**
   ```
   cd ~/facturamea
   npm run build          # opțional
   npx cap sync android
   npx cap open android   # deschide Android Studio
   ```
2. **Asigură-te că ai SDK 35 instalat:** Android Studio → SDK Manager → bifează
   "Android 15.0 (API 35)" → Apply. (targetSdk e deja 35 în cod.)
3. **Generează AAB semnat:** meniu **Build → Generate Signed App Bundle / APK** →
   **Android App Bundle** → Next.
4. **Creează upload key** (prima dată): "Create new..." → alege un fișier `.jks`,
   parolă, alias, parolă alias. **SALVEAZĂ keystore-ul + parolele în loc sigur** —
   dacă le pierzi nu mai poți actualiza app-ul niciodată.
5. Build variant = **release** → Finish. Rezultă `app-release.aab` în
   `android/app/release/`.

> ✅ FCM/push e configurat (google-services.json prezent). ✅ Plata e ascunsă pe nativ
> (politica Google Play Billing respectată). ✅ Numele app = facturamea.
> ⚠️ targetSdk 35 pe Capacitor 6: testează vizual că nu apare conținut sub bara de
> status (Android 15 forțează edge-to-edge). Dacă apar probleme, varianta curată e
> upgrade la Capacitor 7 — spune-mi și te ajut.

---

## FAZA 2 — Play Console (play.google.com/console)

### A. Creează aplicația
6. **Create app** → Name = **facturamea**, Default language = Romanian, App, Free.
   Confirmă declarațiile.

### B. Set up your app (taskurile din dashboard)
7. **App access:** „All functionality is available with these credentials" →
   dă contul demo: `apple.review@facturamea.com` + parola (e activat, vede tot).
8. **Ads:** „No, my app does not contain ads."
9. **Content rating:** completează chestionarul IARC → pentru app de business iese
   **Everyone / PEGI 3**.
10. **Target audience:** 18+ (sau 13+), NU „pentru copii".
11. **Data safety:** completează după `docs/play-store-data-safety.md`
    (criptat în tranzit = Yes, ștergere date = Yes, fără tracking/reclame).
12. **Government apps:** No. **Financial features:** dacă te întreabă, NU e app de
    plăți/credit — e facturare/contabilitate (gestionezi propriile date).
13. **Privacy Policy:** `https://facturamea.com/confidentialitate`

### C. Store listing (Main store listing)
14. **App icon:** 512×512 PNG.
15. **Feature graphic:** 1024×500 PNG (banner).
16. **Phone screenshots:** minim **2** (recomand 4-6) — poze reale din app.
17. **Short description** (max 80 caractere): ex. „Facturare, e-Factura ANAF și
    gestiune. O singură plată, fără abonament."
18. **Full description** (max 4000): facturi, e-Factura ANAF, e-Transport, SAF-T,
    gestiune stocuri, cheltuieli, POS, rapoarte; plată unică, licență pe viață.

### D. Release
19. **Production** (sau **Closed testing** dacă e cont personal nou — vezi sus) →
    **Create new release**.
20. **App signing:** acceptă **Play App Signing** (Google gestionează cheia de
    semnare; tu urci cu upload key-ul tău).
21. **Upload** `app-release.aab`.
22. **Release name** = 1.0 (1). **Release notes:** „Prima versiune."
23. **Save → Review release → Start rollout to Production** (sau testing).

---

## Diferențe față de iOS (ai grijă)
- Google cere **AAB** (nu APK) + **Play App Signing**.
- **Data deletion URL** poate fi cerut explicit (ai ștergere in-app; vezi data-safety).
- Review Google e de obicei mai rapid și mai tolerant cu webview decât Apple, dar
  respectă politica „minimum functionality" — funcțiile native (push, cameră, scanare)
  + scopul real de business acoperă asta.
- Regula **12 testeri / 14 zile** pentru conturi personale noi (vezi sus).

## Checklist scurt înainte de rollout
- [ ] SDK 35 instalat + AAB semnat generat (keystore salvat în siguranță!)
- [ ] Build testat pe telefon (fără probleme edge-to-edge)
- [ ] Data Safety completat
- [ ] Content rating + Target audience completate
- [ ] Icon 512 + Feature graphic 1024×500 + 2-6 screenshots
- [ ] Short + Full description
- [ ] Privacy Policy URL
- [ ] Demo account în App access
- [ ] (cont personal nou) test închis 12/14 pornit
