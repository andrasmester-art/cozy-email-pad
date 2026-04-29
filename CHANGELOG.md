# Változások (Changelog)

A formátum: minden verzió saját szakaszt kap `## [verzió] – dátum` címmel.
A bejegyzések kategóriái: **Új**, **Javítás**, **Változás**.

## [1.7.0] – 2026-04-29

### Új
- Az oldalsáv (fiókok + mappák) szélessége **átméretezhető**: vidd a kurzort a sáv jobb szélére, fogd meg a függőleges fogantyút és húzd jobbra/balra. Tartomány: 200–480 px. **Dupla kattintás** a fogantyún visszaállítja az alapértelmezett 240 px-et. A beállított szélesség elmentődik (localStorage), így újraindítás után is megmarad.

## [1.6.0] – 2026-04-29

### Új
- Fiókok sorrendje **drag & drop**-pal módosítható az oldalsávban: vidd a kurzort egy fiók fölé, fogd meg a bal oldalon megjelenő fogantyút (vagy magát a sort) és húzd a kívánt pozícióba. A sorrend a böngésző tárolójában (localStorage) menti, így újraindítás után is megmarad.

## [1.5.0] – 2026-04-29

### Változás
- Email letöltés átállítva lazy-load modellre: első szinkronnál csak a legfrissebb **200 levél** töltődik le mappánként. A régebbiek automatikusan jönnek le, amikor lejjebb görgetsz a listában (200-as oldalakban).
- Fiókváltáskor most már csak az **INBOX** szinkronizálódik a háttérben — a többi mappa (Sent / Drafts / Archive / Spam / Trash) csak akkor töltődik le, ha rákattintasz. Ez megszünteti a fiókváltáskori akadást és az időtúllépést.
- IMAP timeout 60s → **120s** nagy postafiókokhoz.
- Lokális cache mérete 1000 → 5000 levél/mappa, hogy a görgetve betöltött régi levelek is megmaradjanak.

### Új
- `cache:loadOlder` IPC végpont: a `oldestUid` alatti UID tartományból tölt le egy oldalnyi régebbi levelet.
- A levéllistában „Régebbi levelek betöltése…" / „Nincs több régebbi levél" jelzés a lista alján.

## [1.4.1] – 2026-04-29

### Javítás
- Rich text szerkesztő (aláírás + sablon): a H1/H2/H3, kép beszúrás és link gombok most ténylegesen működnek. Tiptap v3 alatt a `Link` extension duplán volt regisztrálva (StarterKit + külön `Link.configure`), ami „Duplicate extension names" figyelmeztetést és néma parancs-ütközést okozott — most a StarterKit Link-je le van tiltva, és csak a saját, biztonságos verzió fut.
- Image extension explicit konfigurációt kapott (`inline: false`, `allowBase64: true`), így a beillesztett képek megjelennek.
- A szerkesztő külső `value` szinkronizációja már nem írja felül a tartalmat gépelés/formázás közben (csak ha az editor nincs fókuszban), így a H1/H2 váltás nem „pattan vissza".

## [1.3.1] – 2026-04-29

### Változás
- A fiók-varázsló (`AccountWizard`) és a hozzá tartozó szolgáltató-presetek (`providerPresets.ts`) eltávolítva.
- A fiók-szerkesztőből kikerültek a „Gyors beállítások" gombok (Gmail / iCloud / Outlook / Yahoo) — minden mezőt kézzel kell kitölteni.
- Az „Új fiók" gomb most közvetlenül az üres fiók-szerkesztőt nyitja meg.

## [1.3.0] – 2026-04-29

### Új
- Visszakerült egy minimalista IMAP/SMTP réteg az Electron mainbe:
  - `imap:test` — gyors bejelentkezés-ellenőrzés (15s timeout).
  - `imap:listInbox` — az INBOX utolsó N levelét hozza le, parsolva (30s timeout).
  - `smtp:send` — `nodemailer`-rel küld.
- Minden IMAP munkamenet kemény teljes-deadline-nal fut (`withImap`), így a renderer soha nem tud befagyni.
- A „Kapcsolat ellenőrzése" gomb visszakerült a fiók szerkesztőbe.
- A „Szinkronizálás" gomb újra használható: minden fiókon újrahúzza az INBOX-ot.

### Változás
- Szándékosan nincs cache, nincs UID-alapú inkrementális szinkron, nincs background sync, nincs auto-retry, nincs mailbox-felderítés. Minden hívás egyszer fut le és véget ér.
- Egyelőre csak az INBOX mappa él valós szervernél; a Sent / Drafts / Archive üres listát ad.
- A Gmail továbbra is sima IMAP/SMTP-vel csatlakozik, app-specifikus jelszóval (Google OAuth nincs).
## [1.2.0] – 2026-04-29

### Változás
- A teljes IMAP és SMTP logika eltávolítva (`electron/main.cjs`, `electron/mailCache.cjs`, `electron/preload.cjs`).
- A „Kapcsolat ellenőrzése" gomb, a háttér-szinkron, a manuális szinkronizálás és a levélküldés is no-op — minden hívás üres adatot vagy „nem támogatott" üzenetet ad vissza.
- A frontend (fiókok, mappák, levélnézet, sablonok, aláírások, piszkozatok) megmarad, hogy később új backendre lehessen kötni.

## [1.1.6] – 2026-04-29

### Javítás
- A háttérszinkron most már külön timeouttal védi a lassú mappa-megnyitást és mappalista-lekérést, így nem akad be néma kapcsolódási hibába.
- A szerver által visszaadott valódi mappaneveket (`INBOX.Sent`, stb.) a cache-ben is helyesen visszaolvassuk, ezért a Hostinger/cPanel fiókoknál újra megjelennek a levelek.

## [1.1.4] – 2026-04-29

### Változás
- A Titan átirányítás teljesen eltávolítva. A Hostinger / Hoating.eu presetek visszaálltak az eredeti `imap.hostinger.com` / `smtp.hostinger.com` szerverekre.
- A korábban bevezetett automatikus host-normalizálás (`normalizeAccountHosts`) eltávolítva — a mentett fiók host értékei érintetlenül maradnak.

## [1.1.5] – 2026-04-29

### Javítás
- A „Kapcsolat ellenőrzése” gomb többé nem teljes `INBOX` szinkront indít, hanem gyors IMAP bejelentkezés-tesztet futtat.
- Az ellenőrzés emiatt nem akad el 25 másodperces timeouttal olyan szervereken sem, ahol a mailbox megnyitás vagy mappa-felderítés lassú.

## [1.1.2] – 2026-04-29

### Javítás
- A „Kapcsolat ellenőrzése" gomb többé nem akad be vég nélküli „Ellenőrzés…" állapotban: 25 másodperces időtúllépés után érthető hibaüzenettel leáll.
- IMAP kapcsolat-, és socket-timeout (15s / 30s) hozzáadva, hogy a süket szerverek ne fagyaszthassák be a műveleteket.
- Az `INBOX` szinkron is a szerver által felismert valódi mappanevet használja (pl. Hostingernél), nem csak a `syncAll`.

## [1.1.3] – 2026-04-29

### Javítás
- A Hostinger / Titan presetek javítva a hivatalos szerverekre: `imap.titan.email` és `smtp.titan.email`.
- A korábban hibás `imap.hostinger.com` / `smtp.hostinger.com` hostokkal mentett fiókok mentéskor automatikusan a helyes Titan hostokra normalizálódnak.
- A Hostinger súgó pontosítva: teljes e-mail címes felhasználónév, mailbox-jelszó, és bekapcsolt third-party app hozzáférés szükséges.

## [1.1.1] – 2026-04-29

### Javítás
- Hostinger (és más cPanel-alapú) szerverek mappa felismerése: a szerver által visszaadott valódi mappaneveket használjuk (pl. `INBOX.Sent`, `INBOX.Drafts`) a fixen kódolt `Sent` / `Drafts` helyett. Megszünteti a „Client tried to access nonexistent namespace" hibát.

## [1.1.0] – 2026-04-29

### Új
- Jelszó megjelenítés gomb (szem ikon) a fiók varázsló jelszó mezőjében — gépelés közben ellenőrizhető a beírt jelszó.

## [1.0.2] – 2026-04-29

### Új
- „Változások” panel az App frissítése ablakban: megmutatja a telepített és az elérhető verzió közötti újdonságokat a `CHANGELOG.md` alapján.

## [1.0.1] – 2026-04-29

### Javítás
- A fiók szerkesztésekor nem törlődik a mentett jelszó, ha az új jelszó mező üresen marad. Ez javítja a Hostinger („No supported authentication method(s) available”) bejelentkezési hibát.

## [1.0.0] – 2026-04-29

### Új
- Verziószámozás bevezetése (SemVer): hibajavítás → PATCH +1, új funkció → MINOR +1.
- Verziószám megjelenítése az App frissítése ablakban (telepített / elérhető).
- Helyi e-mail cache (better-sqlite3): induláskor nem kell mindent újra letölteni.
- Hostinger preset a fiók varázslóban (imap.hostinger.com / smtp.hostinger.com).
