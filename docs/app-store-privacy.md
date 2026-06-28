# App Store Connect — App Privacy (nutrition label)

Cum completezi secțiunea **App Privacy** în App Store Connect. Reflectă ce
colectează efectiv facturamea (verificat în cod): fără tracking, fără SDK de
publicitate/analytics, datele sunt strict pentru funcționarea aplicației și contul tău.

## Întrebarea de start
"Do you or your third-party partners collect data from this app?" → **Yes**
(colectezi email, nume, date de facturare — deci Yes).

## Data Used to Track You
**NONE.** Nu există tracking cross-app/cross-site, fără SDK-uri de reclame, fără
data brokers. La întrebarea "Is this data used for tracking purposes?" pentru
FIECARE tip → **No**.

## Data Linked to You (colectat + legat de identitate)
Pentru fiecare: Linked to identity = **Yes**, Used for tracking = **No**,
Purpose = **App Functionality** (și **Account Management** unde se aplică).

| Categorie Apple | Tip de date | De ce |
|---|---|---|
| **Contact Info** | Email Address | autentificare, cont, notificări |
| **Contact Info** | Name | profil utilizator / firmă |
| **Contact Info** | Physical Address | adresa firmei pe facturi (date introduse de tine) |
| **Contact Info** | Phone Number *(dacă o adaugi în profilul firmei)* | date pe facturi |
| **Financial Info** | Other Financial Info | facturi, cheltuieli, încasări, solduri (datele contabile ale firmei tale) |
| **User Content** | Photos or Videos | pozele de bonuri/facturi pe care le scanezi |
| **User Content** | Other User Content | facturi, clienți, produse, documente create de tine |
| **Identifiers** | User ID | identificatorul contului |
| **Identifiers** | Device ID | token de notificări push (APNs) |

Notă: **Payment Info (numerele de card) NU se colectează** — plata licenței se face
pe web prin Stripe (procesator terț), nu în aplicație. Nu bifa "Payment Info".

Notă: clienții/furnizorii pe care îi introduci sunt **User Content**, NU "Contacts"
(aplicația nu accesează agenda telefonului). Nu bifa categoria "Contacts".

## Data Not Linked to You
**NONE** în prezent.
- **Diagnostics (Crash/Performance):** doar dacă activezi Sentry (`SENTRY_DSN`).
  Acum e OFF. Dacă îl pornești, adaugă **Diagnostics → Crash Data + Performance Data**,
  Linked = No, Tracking = No, Purpose = App Functionality, și revino la acest label.

## Ce NU colectezi (lasă nebifat)
Location · Browsing History · Search History · Health & Fitness · Sensitive Info ·
Contacts · Purchases · Audio Data · Gameplay Content · Advertising Data.

## URL-uri obligatorii (App Privacy + metadata)
- Privacy Policy URL: https://facturamea.com/confidentialitate
- Support URL: https://facturamea.com/asistenta
