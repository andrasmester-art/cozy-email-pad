# Változások (Changelog)

A formátum: minden verzió saját szakaszt kap `## [verzió] – dátum` címmel.
A bejegyzések kategóriái: **Új**, **Javítás**, **Változás**.

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
