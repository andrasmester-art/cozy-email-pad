# Mailwise — Mac email kliens

Egy letisztult, Mac-stílusú email kliens több IMAP fiók kezelésére, gazdag (Tiptap) szövegszerkesztővel és menthető sablonokkal.

## Mit látsz a Lovable preview-ben?

A preview böngészőben fut, ezért valódi IMAP kapcsolat helyett **demó adatokat** látsz. A teljes UI — fiókkezelés, sablonszerkesztő, levélíró, küldés gomb — működik (a sablonok és fiókok `localStorage`-ba mentődnek).

A **valódi IMAP/SMTP kapcsolat** csak a natív Mac appban él, amit alább tudsz lebuildelni magadnak.

## Natív Mac app build (egyszer kell beállítani)

A natív részhez le kell tölteni a kódot a saját géped`re és pár parancsot futtatni. Az Electron- és node-alapú IMAP csomagok **nem fognak települni a Lovable sandboxban**, ezért lokálisan kell.

### 1. Klónozd a projektet

A Lovable jobb felső sarkában: **GitHub → Connect to GitHub** → push, majd a saját gépeden:

```bash
git clone <a-saját-repo-d>
cd <projekt-mappa>
npm install
```

### 2. Telepítsd az Electron-függőségeket

```bash
npm install --save-dev electron @electron/packager
npm install imap mailparser nodemailer
```

### 3. Add hozzá a `package.json`-höz az alábbi script-eket

A `"scripts"` blokkba másold be:

```json
"electron:dev": "concurrently \"vite\" \"wait-on http://localhost:8080 && ELECTRON_DEV_URL=http://localhost:8080 electron electron/main.cjs\"",
"electron:build": "vite build && electron-packager . Mailwise --platform=darwin --arch=arm64 --out=release --overwrite --icon=public/favicon.ico"
```

(Ha Intel Mac-en vagy: `--arch=x64`. Mindkettőhöz: futtasd kétszer.)

Opcionális dev kényelem:
```bash
npm install --save-dev concurrently wait-on
```

### 4. Vite base — már be van állítva

Az Electron `file://` betöltéshez a `vite.config.ts`-ben `base: './'` kell. (Ha nem szerepel ott, add hozzá.)

### 5. Indítás

- **Fejlesztés** (hot reload): `npm run electron:dev`
- **Csomagolás** (`.app`): `npm run electron:build` → a kész alkalmazás a `release/Mailwise-darwin-arm64/Mailwise.app` mappában lesz.

A `.app` mappát egyszerűen áthúzhatod az `Applications`-be.

## Funkciók

- 📬 **Több IMAP fiók** egyidejű kezelése (Gmail, iCloud, Outlook, Yahoo előre konfigurált presetek)
- 🔐 **Jelszavak macOS Keychainben** titkosítva (`safeStorage` API)
- ✍️ **Tiptap rich text editor** — címsorok, listák, idézet, kód, link, kép, markdown shortcutok (`**bold**`, `# heading`, stb.)
- 📋 **Mentett sablonok** — saját sablonkönyvtár, egy kattintással beszúrható
- 📤 **SMTP küldés** Nodemailerrel
- 🪟 **Mac-natív kinézet** — hidden inset titlebar, drag region, Apple system font

## Biztonság

- IMAP/SMTP jelszavak **soha nem kerülnek a hálózatra Lovable-en keresztül**: az Electron app közvetlenül kapcsolódik az email szerverhez.
- A jelszavakat a Mac Keychain titkosítja (`safeStorage.encryptString`).
- Self-signed tanúsítványok elfogadva (sok IMAP szerver miatt) — éles használat előtt érdemes szigorítani.

## Ismert korlátok

- A jelenlegi verzió **csak olvas és küld** — nincs még levéltörlés, mappába mozgatás vagy push (IDLE) szinkronizáció.
- Csatolmány csak megjelenítve, küldéshez még nincs UI.
- OAuth (Gmail XOAUTH2) helyett app-jelszót használj Gmailhez.
