# Rich Text Editor – Tesztelési Checklist

Ezt a checklist-et minden olyan kiadás (release) előtt futtasd le, amely érinti a `src/components/mail/RichTextEditor.tsx` fájlt, a Composer-t, az aláírás-szerkesztőt vagy a sablon-szerkesztőt. Cél: a H1/H2, listák, link- és képbeszúrás soha többé ne regresszáljon.

---

## 0. Előkészítés

- [ ] `npm run dev` (vagy `update.command` futtatása az Electron buildhez)
- [ ] Nyiss meg egy új levél írása ablakot (Composer)
- [ ] Nyisd meg a Beállítások → Aláírás szerkesztőt
- [ ] Nyisd meg a Beállítások → Sablonok szerkesztőt
- [ ] Minden teszt-pontot mind a 3 helyen futtass le (Composer, Aláírás, Sablon)

> **Tipp:** A hibák 90%-a fókusz-vesztés (toolbar gomb ellopja a fókuszt) vagy `useEffect` általi reset (szülő re-render felülírja a tartalmat). Ha bármi visszaugrik, először ezeket nézd.

---

## 1. Címsorok (H1 / H2)

| # | Lépés | Elvárt eredmény | OK? |
|---|---|---|---|
| 1.1 | Írj be egy sort: `Teszt cím`, jelöld ki, kattints **H1** | A sor `<h1>` lesz, vizuálisan nagyobb | ☐ |
| 1.2 | Ugyanazon a soron kattints újra **H1** | Visszaáll bekezdéssé (`<p>`) | ☐ |
| 1.3 | Új sor, írd be: `Alcím`, jelöld ki, kattints **H2** | A sor `<h2>` lesz | ☐ |
| 1.4 | H1 sor után `Enter` → írj új szöveget | Az új sor **bekezdés**, NEM örökli a H1-et | ☐ |
| 1.5 | H1 sor közepére állva kattints **H2** | Az egész sor H2 lesz (nem törik szét) | ☐ |
| 1.6 | Mentsd, zárd be, nyisd újra a piszkozatot | A H1/H2 megmarad a megnyitás után is | ☐ |

---

## 2. Felsorolás (bullet list)

| # | Lépés | Elvárt eredmény | OK? |
|---|---|---|---|
| 2.1 | Üres soron kattints **• Lista** | Megjelenik egy `•` jelölő | ☐ |
| 2.2 | Írj 3 elemet, mindegyik után `Enter` | 3 különálló pont | ☐ |
| 2.3 | Üres listaelemen `Enter` | Kilép a listából, normál bekezdés lesz | ☐ |
| 2.4 | Meglévő bekezdést jelölj ki, kattints **• Lista** | Listává alakul | ☐ |
| 2.5 | Listán állva kattints újra **• Lista** | Visszaáll bekezdéssé | ☐ |

---

## 3. Számozott felsorolás (ordered list)

| # | Lépés | Elvárt eredmény | OK? |
|---|---|---|---|
| 3.1 | Üres soron kattints **1. Lista** | Megjelenik `1.` | ☐ |
| 3.2 | Írj 3 elemet `Enter`-rel | `1.`, `2.`, `3.` automatikusan | ☐ |
| 3.3 | Üres elemen `Enter` | Kilép a számozott listából | ☐ |
| 3.4 | Váltás bullet → számozott (jelölés után) | Helyesen átalakul, számozás újraindul | ☐ |

---

## 4. Link beszúrás

| # | Lépés | Elvárt eredmény | OK? |
|---|---|---|---|
| 4.1 | Jelölj ki egy szót, kattints **Link**, írd be: `https://lovable.dev` | A szó kattintható linkké válik | ☐ |
| 4.2 | Vidd a kurzort a linkre | Aláhúzott, primary színű | ☐ |
| 4.3 | Kattints a linken állva újra **Link**-re, töröld az URL-t | A link megszűnik, a szöveg marad | ☐ |
| 4.4 | Üres kijelölés mellett **Link** + URL | Beszúr egy új linket az URL szövegével | ☐ |
| 4.5 | Mentés után újranyitás | A link `href` megmarad | ☐ |

---

## 5. Kép beszúrás

| # | Lépés | Elvárt eredmény | OK? |
|---|---|---|---|
| 5.1 | Kattints **Kép**, adj meg egy URL-t (pl. `https://placehold.co/200`) | A kép megjelenik a kurzor pozíciójában | ☐ |
| 5.2 | A kép után `Enter`, írj szöveget | A szöveg a kép alatt jelenik meg | ☐ |
| 5.3 | Mentsd piszkozatként, nyisd újra | A kép `<img src="...">` megmaradt | ☐ |
| 5.4 | Küldd el magadnak teszt e-mailben | A fogadott e-mailben látszik a kép | ☐ |

---

## 6. Fókusz / re-render regresszió (a leggyakoribb hiba)

| # | Lépés | Elvárt eredmény | OK? |
|---|---|---|---|
| 6.1 | Toolbar gombra kattintva **NEM** tűnik el a kurzor | Fókusz az editorban marad | ☐ |
| 6.2 | Formázás után 1 mp-en belül **NEM** áll vissza az eredeti formára | Stabil marad | ☐ |
| 6.3 | Gyorsan kattints H1 → H2 → bullet → ordered | Mindegyik váltás azonnal érvényesül | ☐ |
| 6.4 | Composerben írj címzettet közben — az editor tartalom **NEM** resetel | Tartalom változatlan | ☐ |

---

## 7. Automatizált smoke teszt (opcionális)

Ha szeretnél `vitest` alapú gyors ellenőrzést, futtasd:

```bash
bunx vitest run src/components/mail/RichTextEditor.test.tsx
```

Minimum lefedendő esetek:

- `toggleHeading({ level: 1 })` H1-et készít
- `toggleHeading({ level: 2 })` H2-t készít
- `toggleBulletList()` bullet listát készít
- `toggleOrderedList()` számozott listát készít
- `setLink({ href })` linket szúr be
- `setImage({ src })` képet szúr be
- A `value` prop változás **NEM** írja felül az aktív szerkesztést, ha a HTML megegyezik a `lastEmittedRef` értékével

---

## 8. Kiadás előtti aláírás

- [ ] Minden fenti pont OK mind a 3 helyen (Composer / Aláírás / Sablon)
- [ ] `package.json` verzió frissítve (PATCH +1 ha bugfix)
- [ ] `CHANGELOG.md` bejegyzés hozzáadva
- [ ] Dátum: ____________  Tesztelő: ____________
