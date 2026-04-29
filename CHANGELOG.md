# Változások (Changelog)

A formátum: minden verzió saját szakaszt kap `## [verzió] – dátum` címmel.
A bejegyzések kategóriái: **Új**, **Javítás**, **Változás**.

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
