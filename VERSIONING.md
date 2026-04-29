# Verziószámozás

A `package.json` `version` mezője a megjelenített verziószám. Az „App frissítése"
ablakban ez látszik mind a telepített, mind a GitHub-on elérhető verziónál.

## Szabály

A verziószám formátuma `MAJOR.MINOR.PATCH` (pl. `1.0.0`).

| Változás típusa     | Mit kell növelni             | Példa             |
| ------------------- | ---------------------------- | ----------------- |
| 🐛 Hibajavítás       | PATCH (utolsó szám) +1       | `1.0.0` → `1.0.1` |
| ✨ Új funkció         | MINOR (középső) +1, PATCH=0  | `1.0.5` → `1.1.0` |
| 💥 Nagy átalakítás   | MAJOR (első) +1, többi=0     | `1.4.2` → `2.0.0` |

## Ki frissíti?

A Lovable agent minden módosítás után frissíti a `package.json` `version`
mezőjét a fenti szabály szerint, hogy az appban azonnal látható legyen
hogy van-e új verzió.

## Jelenlegi verzió

`1.0.0` — kiindulási verzió, lokális e-mail cache + IMAP/SMTP varázsló +
Hostinger preset + verziószám-alapú frissítésellenőrzés.
