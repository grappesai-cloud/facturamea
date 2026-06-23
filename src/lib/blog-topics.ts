// SEO topic queue for the auto-published blog. Each day the cron picks the first
// topic whose slug is not yet in blog_posts and generates an article for it.
// When the list is exhausted, the generator asks Claude for a fresh topic.

export interface BlogTopic {
  slug: string;
  title: string;        // working title (the model may refine it)
  keywords: string;     // target search terms
  category: string;
  brief: string;        // what the article should cover
}

export const BLOG_TOPICS: BlogTopic[] = [
  { slug: 'cum-emiti-e-factura-anaf-2026', title: 'Cum emiți o e-Factură prin SPV ANAF în 2026', keywords: 'e-factura, SPV ANAF, factura electronica, emitere e-factura', category: 'e-Factura', brief: 'Ghid pas cu pas pentru emiterea unei e-Facturi în SPV ANAF: înrolare, certificat, generare XML UBL, trimitere, verificare stare. Obligații 2026.' },
  { slug: 'e-factura-obligatorie-2026-cine-cum', title: 'e-Factura obligatorie în 2026: cine intră și ce trebuie să faci', keywords: 'e-factura obligatorie, B2B, B2C, termene ANAF 2026', category: 'e-Factura', brief: 'Cine este obligat la e-Factura în 2026 (B2B, B2C), termene, sancțiuni, cum te pregătești.' },
  { slug: 'ce-este-saf-t-d406-pe-intelesul-tuturor', title: 'Ce este SAF-T (D406) și cine trebuie să-l depună', keywords: 'SAF-T, D406, declaratie SAF-T, fisier standard de audit', category: 'SAF-T', brief: 'Explică SAF-T D406 simplu: ce conține, cine depune, termene, cum se generează din programul de facturare.' },
  { slug: 'e-transport-ghid-complet', title: 'e-Transport: ghid complet pentru transportul de bunuri', keywords: 'e-transport, UIT, transport bunuri, ANAF e-transport', category: 'e-Transport', brief: 'Ce este e-Transport, ce mărfuri intră, cum obții codul UIT, sancțiuni, cum declari.' },
  { slug: 'factura-fiscala-elemente-obligatorii', title: 'Ce trebuie să conțină o factură fiscală corectă', keywords: 'elemente factura, factura corecta, date obligatorii factura', category: 'Facturare', brief: 'Lista completă a elementelor obligatorii pe o factură conform Codului Fiscal, cu exemple.' },
  { slug: 'proforma-vs-factura-fiscala', title: 'Factură proformă vs factură fiscală: care e diferența', keywords: 'proforma, factura fiscala, diferenta proforma factura', category: 'Facturare', brief: 'Diferențele dintre proformă și factură fiscală, când folosești fiecare, implicații contabile.' },
  { slug: 'cum-stornezi-o-factura-corect', title: 'Cum stornezi o factură corect (factură storno)', keywords: 'storno factura, anulare factura, factura storno ANAF', category: 'Facturare', brief: 'Cum se face un storno corect, diferența față de anulare, cum apare în e-Factura și contabilitate.' },
  { slug: 'tva-la-incasare-cum-functioneaza', title: 'TVA la încasare: cum funcționează și cui i se aplică', keywords: 'TVA la incasare, sistem TVA incasare, exigibilitate TVA', category: 'TVA', brief: 'Explică sistemul TVA la încasare, condiții, avantaje, cum se reflectă pe factură.' },
  { slug: 'cote-tva-romania-2026', title: 'Cotele de TVA în România în 2026', keywords: 'cote TVA, TVA 21, TVA redus, TVA Romania 2026', category: 'TVA', brief: 'Cotele de TVA valabile în 2026 (standard și reduse), ce produse/servicii intră în fiecare.' },
  { slug: 'taxare-inversa-tva-explicata', title: 'Taxarea inversă la TVA, explicată simplu', keywords: 'taxare inversa, reverse charge, TVA taxare inversa', category: 'TVA', brief: 'Ce este taxarea inversă, când se aplică, cum se emite factura, exemple practice.' },
  { slug: 'plafon-tva-cand-devii-platitor', title: 'Plafonul de TVA: când devii plătitor de TVA', keywords: 'plafon TVA, platitor TVA, inregistrare TVA, 300000 lei', category: 'TVA', brief: 'Plafonul de înregistrare în scopuri de TVA, ce se întâmplă când îl depășești, pași de înregistrare.' },
  { slug: 'pfa-vs-srl-facturare', title: 'PFA sau SRL: ce înseamnă pentru facturare și taxe', keywords: 'PFA vs SRL, facturare PFA, facturare SRL, impozite', category: 'Antreprenoriat', brief: 'Comparație PFA vs SRL din perspectiva facturării, taxelor și obligațiilor fiscale.' },
  { slug: 'cum-tii-gestiunea-stocurilor', title: 'Cum ții corect gestiunea stocurilor în firmă', keywords: 'gestiune stocuri, NIR, receptie marfa, evidenta stoc', category: 'Gestiune', brief: 'Bazele gestiunii de stocuri: NIR, recepție, descărcare, inventar, metode de evaluare.' },
  { slug: 'ce-este-nir-receptie-marfa', title: 'Ce este NIR-ul (nota de recepție) și cum se face', keywords: 'NIR, nota receptie, receptie marfa, document gestiune', category: 'Gestiune', brief: 'Explică NIR-ul: rol, când e obligatoriu, ce conține, cum se întocmește.' },
  { slug: 'chitanta-vs-bon-fiscal', title: 'Chitanță, bon fiscal sau factură: ce eliberezi și când', keywords: 'chitanta, bon fiscal, factura, document justificativ', category: 'Facturare', brief: 'Diferențele dintre chitanță, bon fiscal și factură, când folosești fiecare.' },
  { slug: 'declaratia-300-tva-ghid', title: 'Declarația 300 (decont TVA): ghid pentru începători', keywords: 'declaratia 300, decont TVA, D300, depunere TVA', category: 'Declarații', brief: 'Ce este D300, cine o depune, termene, cum se completează din evidența facturilor.' },
  { slug: 'declaratia-394-explicata', title: 'Declarația 394: ce este și cum o completezi', keywords: 'declaratia 394, D394, livrari achizitii, ANAF', category: 'Declarații', brief: 'Rolul D394, cine o depune, ce conține, erori frecvente.' },
  { slug: 'cum-incasezi-mai-repede-facturile', title: 'Cum încasezi mai repede facturile neîncasate', keywords: 'incasare facturi, facturi neincasate, termen plata, dunning', category: 'Cash-flow', brief: 'Strategii practice pentru a încasa la timp: termene clare, reminder-e, penalități, reconciliere.' },
  { slug: 'reconciliere-bancara-ce-este', title: 'Reconcilierea bancară: ce este și de ce contează', keywords: 'reconciliere bancara, extras de cont, potrivire plati', category: 'Contabilitate', brief: 'Ce înseamnă reconcilierea bancară, cum se face, cum o automatizezi cu importul de extras.' },
  { slug: 'facturi-recurente-abonamente', title: 'Cum gestionezi facturile recurente și abonamentele', keywords: 'facturi recurente, abonamente, facturare automata', category: 'Facturare', brief: 'Cum automatizezi facturarea recurentă pentru clienți cu abonament sau servicii lunare.' },
];

/** Topic used when the curated list is exhausted (cron asks Claude for a fresh one). */
export const FALLBACK_CATEGORY = 'Facturare';
