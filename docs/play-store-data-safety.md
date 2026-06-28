# Google Play — Data Safety (formularul de confidențialitate)

Cum completezi secțiunea **Data safety** în Play Console. Reflectă ce colectează
efectiv facturamea: fără tracking/reclame, datele sunt pentru funcționarea
aplicației și contul tău, criptate în tranzit.

## Întrebări generale (sus)
- "Does your app collect or share any of the required user data types?" → **Yes**
- "Is all of the user data collected by your app encrypted in transit?" → **Yes** (HTTPS)
- "Do you provide a way for users to request that their data is deleted?" → **Yes**
  (ștergere cont in-app la Setări → Securitate; vezi și URL-ul de ștergere mai jos)

## Date COLECTATE (pentru fiecare: Shared = No · Processing = Collected ·
## Purpose = App functionality + Account management · Optional/Required ca mai jos)

| Categorie Google | Tip | Required? | De ce |
|---|---|---|---|
| **Personal info** | Name | Required | profil / firmă |
| **Personal info** | Email address | Required | autentificare, cont |
| **Personal info** | Address | Optional | adresa firmei pe facturi |
| **Personal info** | Phone number | Optional | date pe facturi (dacă o adaugi) |
| **Financial info** | Other financial info | Optional | facturi, cheltuieli, încasări (contabilitatea firmei tale) |
| **Photos and videos** | Photos | Optional | pozele de bonuri scanate |
| **Files and docs** | Files and docs | Optional | facturi/documente generate |
| **Device or other IDs** | Device or other IDs | Optional | token notificări push (FCM) |

Pentru fiecare rând: **Is this data shared?** → **No** · **Collected?** → **Yes** ·
**Used for tracking?** nu există secțiune separată, dar NU bifa scopuri de
Advertising/Marketing. Scopuri = **App functionality** (+ Account management).

## Date pe care NU le colectezi (lasă nebifat)
- **Payment info / card numbers** — plata licenței e pe web prin Stripe, NU în app
- Location · Web browsing history · Search history · Contacts (agenda telefonului) ·
  Health & fitness · Calendar · SMS/Call logs · Audio · Installed apps ·
  Advertising ID / orice pt reclame

## Data deletion (cerință Google)
- **Privacy policy URL:** https://facturamea.com/confidentialitate
- **Account/data deletion:** utilizatorii pot șterge contul direct din aplicație
  (Setări → Securitate → Șterge contul; ștergere definitivă după 30 zile, GDPR Art. 17).
- **URL public de ștergere (pentru câmpul „Account deletion" din Data Safety):**
  `https://facturamea.com/stergere-cont` — pagină publică ce explică ștergerea din
  app + prin email (support@facturamea.com) + ce se șterge și în 30 de zile.
