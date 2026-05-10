# Változások (Changelog)

A formátum: minden verzió saját szakaszt kap `## [verzió] – dátum` címmel.
A bejegyzések kategóriái: **Új**, **Javítás**, **Változás**.

## [1.42.0] – 2026-05-10

### Új
- **Fiókbeállítások exportálása / importálása.** A Beállítások ablakban most egyszerre exportálhatod az összes IMAP/SMTP fiókod egy `.json` fájlba (jelszavakkal együtt), majd egy másik gépen ugyanezzel az alkalmazással be tudod importálni. Az import az e-mail cím alapján egyezteti a fiókokat: új fiókok hozzáadódnak, az azonos című meglévők frissülnek. A fájl titkosítatlan — a felhasználó felelőssége biztonságos helyen tartani.

## [1.41.0] – 2026-05-08

### Új
- **Visszamenőleges válasz-detektálás.** A fiók szinkron most a `Sent` mappa fejléceit (`In-Reply-To`, `References`) is végignézi, és minden olyan régebbi levélre, amire valaha is válaszoltunk (akár ebből az appból, akár Gmail web/Apple Mail/telefonról), automatikusan rákerül a `\Answered` IMAP-flag a szerveren is. Így a Reply-ikon a listanézetben azonnal azoknál a régi leveleknél is megjelenik, amelyekre korábban nem volt beállítva ez a flag.

### Változás
- **Azonnali válasz-jelzés a listában.** A „Válasz" / „Válasz mindenkinek" után az érintett levél Reply-ikonja optimisztikusan, már a szerver-flag visszaigazolása előtt megjelenik (nem kell a következő szinkronra várni).
- **Cache fejléc-séma bővítés.** Az új levelek lekérésekor a `Message-ID` / `In-Reply-To` / `References` is letárolódik, hogy a fenti detektálás működjön. A régi cache-elt levelekhez ez a következő ablaknyitásnál (vagy egy „Frissítés" után, ami új fejléceket húz le) áll össze.

## [1.40.0] – 2026-05-08

### Új
- **Megválaszolt levelek jelölése a listában.** Azoknál a leveleknél, amelyekre már válaszoltunk (IMAP `\Answered` flag), a tárgy mellett kis Reply-ikon jelenik meg. Ha az appból küldesz választ vagy „válasz mindenkinek"-et, a sikeres küldés után automatikusan rákerül az eredeti levélre a `\Answered` flag — így másik kliensben (Gmail web, Apple Mail) is látszik. Továbbítás nem állítja be ezt a flag-et.

## [1.39.7] – 2026-05-08

### Javítás
- **Elküldött piszkozat törlése a Drafts mappából.** Ha egy piszkozatot a „Piszkozat szerkesztése" gombbal nyitsz meg, majd a „Küldés" gombra nyomsz, a sikeres küldés után az eredeti piszkozat automatikusan törlődik a Drafts mappából — eddig ott maradt, miközben a levél már el lett küldve.

## [1.39.6] – 2026-05-08

### Javítás
- **Piszkozat felülírása új példány helyett.** Ha egy szerver-piszkozatot megnyitsz a „Piszkozat szerkesztése" gombbal, módosítod, és rányomsz a „Mentés piszkozatként" gombra, mostantól az eredeti piszkozatot írja felül a Drafts mappában (új APPEND + a régi UID törlése), nem hoz létre második másolatot. Fiókváltás esetén továbbra is új piszkozat keletkezik a célfiókban, az eredeti változatlan marad. Az ismételt mentések is mindig az aktuális verziót cserélik le.

## [1.39.5] – 2026-05-08

### Javítás
- **Piszkozat szerkesztése gomb most már látszik.** Az 1.39.4-ben az alsó sávra tett gomb a `MessageView` `flex-1` magassága miatt levágódott a viewport aljáról. Mostantól a gomb a felső toolbar bal szélén jelenik meg (a Válasz/Mind/Tov. mellett, „Piszkozat szerkesztése" felirattal, primary színnel) — mind a fő ablakban, mind a külön levél-ablakban.

## [1.39.4] – 2026-05-08

### Javítás
- **Mentett piszkozat újra megnyitható és szerkeszthető** a fő ablakban is. Eddig a „Piszkozat szerkesztése" gomb csak a külön ablakban (dupla katt egy levélre) jelent meg, a fő nézetben a Drafts mappában kijelölt piszkozat csak megnyithatatlan előnézet volt. Mostantól, ha a Drafts/Piszkozatok mappában állsz, az üzenet alatt megjelenik egy gomb, amely az eredeti címzettel, tárggyal és tartalommal nyitja meg a Composert.

## [1.39.3] – 2026-05-08

### Javítás
- **Válasz / Továbbítás formázása nem esik szét.** Eddig az idézett előzményt egy `<blockquote>`-ba tettük, és nyersen beleömlesztettük az eredeti levél HTML-jét (table-ek, div-ek, inline style-ok, font tag-ek). A Tiptap szerkesztő ezt a saját schema-jával ledarálta: minden egy hosszú, dőlt, behúzott blokká folyt össze, sortörések és bekezdések elvesztek. Mostantól az idézett szöveget az új `src/lib/quoteBody.ts` először tiszta sorokká alakítja (a `<br>` és block-tagek határán törve), majd minden sort külön `<p>` bekezdésként ad át a szerkesztőnek — pont úgy, ahogy a többi mail kliens is csinálja. Továbbításnál fejléc-blokkot is generál (Feladó / Címzett / Tárgy / Dátum).

## [1.39.2] – 2026-05-07

### Javítás
- **Cache fájlok sérülése megszűnt.** A hibanaplóban rendszeresen jelentkező `[cache.read] MISS (parse error) … Unexpected end of JSON input` / `Unterminated string` üzenetek oka az volt, hogy a `cache.write` egyszerű `fs.writeFile`-t használt, és párhuzamos írások (auto-sync + body fetch + flag update ugyanarra a mailboxra) félbe-csonka JSON-t hagyhattak a lemezen — ilyenkor az adott mappa teljes cache-e elveszett, és a következő indulásnál minden levelet újra kellett szinkronizálni a szerverről. Mostantól minden írás **atomic**: előbb `.tmp-…` fájlba ír, majd `rename`-mel cseréli a célfájlt (POSIX-en atomic), és ugyanarra a fájlra érkező írások **per-fájl sorba kerülnek**, így nem keverednek.

## [1.39.1] – 2026-05-07

### Javítás
- A „Balra igazítás" gomb friss bekezdésnél is aktívnak látszik, ha nincs explicit `textAlign` attribútum (default állapot). A középre/jobbra gomb továbbra is csak akkor aktív, ha az adott igazítás be van állítva. Heading (H1/H2/H3) és paragraph esetén egyaránt helyesen vált.

## [1.39.0] – 2026-05-07

### Javítás
- Az inline (`cid:`) képek immár helyesen megjelennek a levél törzsében — az `EmailHtmlFrame` a CSID hivatkozásokat a csatolmányok base64 adatából `data:` URI-ra cseréli a renderelés előtt. A csatolmány-lista nem duplikálja a már megjelenített inline képeket (csak akkor mutatja, ha a tartalom még nincs letöltve).

### Új
- A levélíró (Rich Text) szerkesztőben aláhúzás (Underline) gomb és három szöveg-igazítás (balra/középre/jobbra) gomb a toolbaron, a megfelelő TipTap kiterjesztésekkel.

## [1.38.0] – 2026-05-07

### Új
- Távoli képek alapértelmezetten blokkolva a beérkező levelekben (adatvédelmi és tracking-pixel védelem, mint az Apple Mail / Gmail). A levél tetején figyelmeztető sáv jelenik meg, ahol egy gombbal („Képek betöltése") engedélyezhető a távoli tartalom betöltése az adott levélhez. Az inline (`cid:`) csatolmányokat és a beágyazott (`data:`) képeket továbbra is azonnal megjeleníti.

## [1.37.1] – 2026-05-07

### Javítás
- A levelekben elhelyezett linkekre kattintva immár a rendszer alapértelmezett böngészőjében nyílnak meg. Eddig az iframe sandbox-beállítása blokkolta a `target="_blank"` linkeket, így semmi sem történt kattintásra.

## [1.37.0] – 2026-05-07

### Új
- A bal oldali fiók-listán minden fiók mellett kis jelvény mutatja a Beérkezett mappa olvasatlan üzeneteinek számát (99 felett "99+"). A szám automatikusan frissül szinkronizáláskor, automatikus háttér-szinkronkor, illetve amikor egy levelet olvasottnak/olvasatlannak jelölsz vagy törölsz.

## [1.36.3] – 2026-05-07

### Javítás
- A szinkronizáció most már minden alkalommal frissíti a csillag (★) és olvasott állapotot a szerverről, nem csak 10 percenként. Így ha másik levelezőben (pl. webmailben) megjelölsz vagy leveszed a jelölést egy levélről, a Mepodmail következő szinkronja átveszi.

## [1.36.2] – 2026-05-07

### Javítás
- **Indításkor üres fióklista — magától nem frissült** — ha a háttér-előtöltés (`runStartupPrefetch`) `mail:auto-synced` eseménye akkor érkezett, amikor a renderer listenere még nem regisztrálódott (mert épp a fiókokat töltötte), az értesítés elveszett, és a UI üreset mutatott amíg a felhasználó rá nem kattintott a fiókra. Mostantól üres cache esetén a `loadMessages` automatikus pollingba lép (1.5 mp-enként, max 30 mp), és amint a háttérben futó szinkron feltölti a cache-t, a lista magától megjelenik — kattintás nélkül.

## [1.36.1] – 2026-05-07

### Új
- **Indítás utáni intelligens INBOX előtöltés** — közvetlenül indítás után (500 ms) elindul minden fiók INBOX-szinkronja, a cache állapotához igazítva:
  - **Üres / sosem szinkronizált fiókok** kapnak elsőbbséget, párhuzamosan futnak.
  - **Régi cache-ű fiókok (>5 perc)** a következő fázisban frissülnek, szintén párhuzamosan.
  - **Friss cache-ű fiókok (<5 perc)** teljesen kimaradnak — semmi felesleges IMAP kapcsolat.
  - A frissítés végén a renderert a megszokott `mail:auto-synced` eseménnyel értesítjük, hogy az aktívan nézett mappát automatikusan újratöltse.

## [1.36.0] – 2026-05-07

### Változás
- **Drasztikus indulási gyorsítás** — több ponton is csökkent az induláskor szükséges IMAP-forgalom:
  - **Kezdeti fejléc-letöltés 200 → 50 db** (`INITIAL_PAGE_SIZE`). Egy új fiók első szinkronja így ~4× gyorsabb; a régebbi levelek görgetésre, lazy-load-dal töltődnek be (200-as oldalakban, változatlanul).
  - **Cache-friss kihagyás (60 mp TTL)** — fiók/mappa váltáskor csak akkor indul új IMAP szinkron, ha az adott (fiók, mappa) cache-e 60 mp-nél régebbi. Friss cache esetén a váltás teljesen azonnali, nincs IMAP körút.
  - **Drafts-háttérszinkron törölve a mappaváltásból** — eddig minden fiók/mappa váltás extra Drafts IMAP kapcsolatot is nyitott. Ezt az auto-sync (5 percenként) és a manuális Frissítés gomb már így is lefedi.
  - **Auto-sync első futás 30 mp → 2 mp** — az app indulása után szinte azonnal elindul a háttér-szinkron minden fiók INBOX-ára (párhuzamosan). A UI közben a már meglévő cache-ből azonnal renderel, az új levelek pedig néhány másodpercen belül megjelennek.

## [1.35.2] – 2026-05-06

### Javítás
- **„Mepodmail ismeretlen hiba miatt kilépett" alvás után** — a laptop felnyitása után az alvás közben megszakadt IMAP TCP-kapcsolatok el nem kapott `error` eseményeket dobtak, ami a főfolyamat összeomlásához vezetett. Globális `uncaughtException` és `unhandledRejection` handler került be, így a megszakadt kapcsolatok már csak naplózva lesznek, az app életben marad.
- **Alvás/ébredés tudatos auto-sync** — `powerMonitor` figyeli az alvás/ébredés eseményeket; ébredés után 5 másodperccel automatikusan friss INBOX-szinkront indít, hogy a megszakadt sockets helyett azonnal újak épüljenek fel.

## [1.35.0] – 2026-05-04

### Új
- **Új „Beállítások" menü a sidebar alján** — a Téma választó, az „App frissítése" és a „Hibanapló mentése" most egy közös, tiszta dialógusba (`SettingsDialog`) kerültek. A sidebar alja így rendezettebb és átláthatóbb.

### Változás
- **A korábbi „Beállítások" menüpont átnevezve „Fiók szerkesztése" néven** — a régi gomb mindig is az aktív fiók szerkesztő dialógusát nyitotta meg, ezt most már a neve is jelzi (`UserCog` ikon). Az új „Beállítások" gomb (`Settings` ikon) nyitja az alkalmazás-szintű beállításokat.
- A duplikált Sidebar-aljas akciók (App frissítése, Hibanapló mentése, ThemeToggle) eltávolítva — funkcionalitás változatlan, csak a Beállítások dialóguson keresztül érhetők el.

## [1.35.1] – 2026-05-04

### Javítás
- **Nem szabványos, törött email-fejléc kódolás toleráns helyreállítása.** A képernyőn látható `J=E1nos_Kozma-Conde` és `MEpod_St=FAdi=F3` minták nem valódi font-hibák voltak, hanem olyan hibás `From`/`To` fejlécek, ahol a küldő kliens RFC 2047 wrapper nélkül hagyott bent quoted-printable byte-szekvenciákat (`=E1`, `=F3`, stb.). A `decodeMimeWords` eddig csak a szabványos `=?charset?Q?...?=` / `=?charset?B?...?=` alakot dekódolta, ezért ezek a törött nevek változatlanul jutottak a UI-ba. Mostantól, ha a dekódolás után még mindig látható `=XX` mintázat marad a fejlécben, egy konzervatív `windows-1250` quoted-printable fallback is lefut, ami helyreállítja a tipikus közép-európai neveket. Emellett a body-letöltés cache-merge-e most már a `from` / `to` / `subject` mezőket is frissíti, így a korábban rosszul cache-elt fejlécszöveg megnyitáskor azonnal lecserélődik a javított változatra.

## [1.34.10] – 2026-05-04

### Javítás
- **MIME encoded-word fejlécek (RFC 2047) helyes dekódolása nem-UTF-8 charset esetén.** A levéllistában a feladók nevei `J=E1nos_Kozma-Conde` formában jelentek meg ahelyett, hogy `János Kozma-Conde`-ként renderelődtek volna — a felhasználó ezt "rossz betűkészletnek" érzékelte, valójában dekódolási hiba volt. Az `electron/main.cjs` `decodeMimeWords` függvénye eddig `Buffer.toString(charset)`-tel dekódolt, ami csak `utf8/latin1/ascii/utf16le`-t ismer Node.js-ben → `iso-8859-2`, `windows-1250`, `iso-8859-1` esetén csendben elhasalt és visszaadta a nyers `=XX` tokeneket. Mostantól `TextDecoder`-t használunk (WHATWG encodings), ami széles charset-támogatással rendelkezik (utf-8, iso-8859-1..16, windows-125x, koi8-r, gb18030, shift_jis, …). Plusz javítás: a header folding (CRLF + WSP) és a szomszédos encoded-word-ök közötti whitespace eltüntetése immár a regex-csere ELŐTT történik, RFC 2047 §6.2 szerint helyesen — a többszörös encoded-word-ből álló nevek/tárgyak (pl. `=?utf-8?Q?Hello?= =?utf-8?Q?_World?=`) szóköz nélkül fűződnek össze. Önteszttel ellenőrizve: `=?ISO-8859-2?Q?J=E1nos?=` → `János`, `=?windows-1250?Q?=C1rp=E1d?=` → `Árpád`.

## [1.34.9] – 2026-05-04

### Javítás
- **Dupla IMAP szinkron auto-sync + manuális Frissítés egyidejű futásakor.** A logban tisztán látható volt: `acc-…/INBOX DONE added=7 (+54000ms)` után közvetlenül ugyanaz az INBOX **újra** lefutott (+25066 ms) — mert az auto-sync és a manuális (vagy fiók/mappa-váltó) szinkron egyszerre érkezett. A korábbi `withSyncLock` ugyan szerializálta a hívásokat, de a sor végére fűzött minden új `fn`-t, így mindkét hívás végigment egy önálló IMAP sessionnel. Mostantól in-flight deduplikáció: ha érkezik egy második `withSyncLock(account, mailbox, …)` hívás MIALATT az első Promise még pending, **ugyanazt** a futó Promise-t kapja vissza minden hívó — nem indul új IMAP kapcsolat, és minden hívó ugyanazt az eredményt látja. A diagnosztikához `[syncLock] reuse in-flight …` logsor kerül kiírásra a deduplikáció pillanatában.

## [1.34.8] – 2026-05-04

### Javítás
- **`lang="hu"` deklaráció a HTML gyökerén és a levéltörzs iframe-ben.** Az `index.html` `<html lang="en">` → `<html lang="hu">`, és az `EmailHtmlFrame` `srcDoc` template literalja is `<html lang="hu">`-val nyit. A `<meta charset="UTF-8">` és a SF Pro / system-ui font stack már korábban is jól volt beállítva mindkét helyen, így a magyar diakritikák helyes nyelvi hinttel renderelődnek (jobb karakter-shaping, kerning és a megfelelő szövegtagolás Electron Chromium környezetben).

## [1.34.7] – 2026-05-04

### Javítás
- **Csatolmány-lista UX finomhangolás (SVG előnézet, fájlnév-csonkítás, betöltési állapot).** Az `AttachmentList.tsx` `isPreviewable` függvényét pontosítottam: explicit komment jelzi, hogy az `image/*` ág minden böngészőben renderelhető képformátumot (svg, png, jpg, webp, gif) lefed — így az SVG csatolmányoknál is automatikusan megjelenik az Előnézet gomb, amint a `data` mező megérkezik. A fájlnév div-re `max-w-[180px]` kapott, hogy a sor stabil szélességű maradjon, a teljes név pedig a `title` tooltipben olvasható. A státuszsor "még tölt" felirata helyett mostantól egyértelmű "tartalom betöltés alatt" üzenet jelenik meg ámbra színnel, amíg a base64 `data` mező hiányzik — így a felhasználó számára érthető, miért nincs Előnézet/Letöltés gomb.

## [1.34.6] – 2026-05-04

### Javítás
- **Flag-jelölés (csillag / olvasott) láthatóan lassú volt.** Az `applyFlagPatch` (`src/pages/Index.tsx`) az optimista lokális update után a szerverválasz `r.messages` tömbjét visszaírta a state-be (`setMessages(r.messages)`), ami a teljes levéllista újrarenderelését váltotta ki minden egyes csillag/olvasott kattintáskor. Mostantól sikeres szerverhívás után nem írjuk felül a teljes listát — az optimista patch már a helyes állapotot tükrözi. Hibánál a cache visszaolvasásával állítjuk vissza a konzisztens állapotot a korábbi `prevMessages` snapshot helyett (ami amúgy is az `useCallback` deps `messages`-ét hizlalta és minden új üzenetnél újragyártotta a callbacket).

## [1.34.5] – 2026-05-04

### Javítás
- **IMAP timeoutok csökkentése — gyorsabb hibajelzés lassú szervereknél.** Az `imapClient`-ben (`electron/main.cjs`) az `authTimeout` és `connTimeout` 12000 → 8000 ms, a `socketTimeout` 25000 → 20000 ms. Ezzel egy lassan válaszoló vagy elérhetetlen IMAP szerver hamarabb dob hibát, és a felhasználó nem ragad bent egy 12+ mp-es néma várakozásban a kapcsolódásnál.

## [1.34.4] – 2026-05-04

### Javítás
- **Indulási 50+ másodperces lassúság javítása lassú IMAP szervereknél.** A renderer fiókváltáskor két konkurens IMAP sessiont nyitott ugyanarra a mailboxra: a `loadMessages` callback a cache-olvasás után azonnal `cache:syncMailbox`-ot indított, miközben egy másik `useEffect` `cache:syncAccount`-ot is futtatott. A logokban ez 24,9 mp-es kapcsolódásként és 54 mp-es teljes szinkronként jelent meg (`acc-…/INBOX sync returned added=7 msgs=216 in 54033ms`). Mostantól a `loadMessages` kizárólag a lokális cache-t olvassa (azonnali UI), a szerver-szinkron pedig egyetlen `useEffect`-ben történik fiók/mappa váltáskor. A `Frissítés` gomb új, dedikált `refreshMailbox` callbackre kötve továbbra is kezdeményez explicit szerver-szinkront. Ez kiküszöböli a duplikált IMAP kapcsolatot és a vele járó cache-write race-eket is.

## [1.34.3] – 2026-04-30

### Javítás
- **Visszamenőleges csatolmány-helyreállítás a régi cache-hez.** Az 1.34.1 javítása az újonnan szinkronizált leveleknél már jól számolta a `hasAttachments` mezőt és mentette az `attachments` listát, de a korábban cache-elt leveleknél két maradék hiba bent maradt: (1) ha egy mappában nem érkezett új levél, a régi cache-be mentett üzenetek `hasAttachments` mezője nem frissült vissza, ezért a listanézetben továbbra sem jelent meg a 📎 gemkapocs ikon; (2) ha egy levél body-ja még egy korábbi verzióval lett elmentve `bodyLoaded=true` állapotban, de `attachments` nélkül, akkor megnyitáskor már nem indult új `fetchBody`, így a csatolmánylista üres maradt. Most a `syncMailbox` a már cache-elt UID-tartományra visszamenőleg újraolvassa a header/BODYSTRUCTURE adatokat és újraszámolja a `hasAttachments` jelzőt, a renderer pedig akkor is újrahidratálja a body-t, ha a levél csatolmányosnak van jelölve, de az `attachments` tömb hiányzik vagy üres.

### Javítás
- **Kritikus indítási hiba javítása (`SyntaxError: Unexpected end of input` a main process-ben).** Az 1.34.0-ban bevezetett `mail:delete` IPC handler `electron/main.cjs`-ben hiányzott a `});` lezárás → a teljes `main.cjs` szintaktikailag érvénytelen lett, az Electron főfolyamat el sem indult ("A JavaScript error occurred in the main process" hiba a frissítés után). Pótoltam a hiányzó lezárást a `mail:delete` handler után.

## [1.34.2] – 2026-04-30

## [1.34.1] – 2026-04-30

### Javítás
- **Csatolmányok valódi javítása — listanézet 📎 ikon + megnyitásnál csatolmány-lista.** Két különálló bug volt:
  1. **A header-szinkron eddig sosem számolt csatolmányt.** A `fetchHeadersByUidRange` `struct: false`-szal hívta az IMAP fetch-et, így a `BODYSTRUCTURE` nem érkezett meg, és a `hasAttachments` flag mindig undefined maradt → a 📎 gemkapocs ikon **soha** nem jelent meg új szinkron után. Most `struct: true`-ra váltottunk, és bevezettünk egy új `hasAttachmentsInStruct(struct)` segédet (`electron/main.cjs`), ami rekurzívan bejárja a `node-imap` BODYSTRUCTURE-t és felismeri az összes valódi csatolmányt (filename, disposition, méret, inline image cid, vagy `application/*` típus) — body letöltése nélkül.
  2. **A `cache.updateMessageBody` nem mentette el az `attachments` és `hasAttachments` mezőket.** Ezért a `mail.fetchBody` IPC-válasz a cache-ből visszaolvasott objektumot adta vissza csatolmányok nélkül → az `Index` `selected` state sem kapott `attachments`-et → az `AttachmentList` üres maradt → a megnyitott levél alatt nem jelent meg a csatolmány-lista. Most a cache is menti az `attachments`-et és `hasAttachments`-et, és a `loadMessageBody` extra biztonságból a friss body-t is rámergeli a visszatérési értékre.
- **Hatás:** új szinkron / új levél után azonnal megjelenik a 📎 ikon a listán mindenféle csatolmány-típusra (PDF, kép, doc, zip, txt, …); levél megnyitásakor pedig a body letöltése után rögtön látszik a csatolmány-lista a Letöltés / Előnézet gombokkal.

## [1.34.0] – 2026-04-30

### Új
- **Működő törlés gomb a levél-nézetben.** Eddig a `MessageView` kuka ikonja csak dekoráció volt — most teljes IMAP törlés van mögötte. Megerősítő dialógus után a levél áthelyeződik a Kuka mappába (IMAP `MOVE`, ha a szerver támogatja, különben `COPY` + `\Deleted` + `EXPUNGE` fallback). Ha már a Kukában (Trash) töröljük, akkor véglegesen kitörlődik (`\Deleted` + `EXPUNGE`). A Trash mappa nevét a meglévő `resolveMailbox("Trash")` keresi meg (XLIST/SPECIAL-USE → kanonikus nevek). A lokális cache azonnal frissül (`removeMessages`), és optimista UI-frissítéssel azonnal eltűnik a levél a listából; hiba esetén visszagörgetjük.
- **Törlés a kontextus menüből.** Mind a levéllistán (jobb klikk a sorra), mind a levél-nézetben (jobb klikk a tartalomra) megjelenik egy **„Levél törlése"** menüpont (destruktív, piros).
- **Új ablakban megnyitott levélnél** a törlés sikere után az ablak automatikusan bezárul (`window.close()`).
- IPC: új `mail:delete` handler (`electron/main.cjs`), `window.mailAPI.mail.delete(...)` preload-bridge, és `mailAPI.mail.delete(...)` típusos kliens-API (`src/lib/mailBridge.ts`).

## [1.33.4] – 2026-04-30

### Javítás
- **Pontosabb 📎 gemkapocs detektálás minden csatolmány-típusra.** A `hasAttachments` flag számolása mostantól egy közös `countRealAttachments(parsed)` segédfüggvényen keresztül történik (`electron/main.cjs`), ami a content-type-tól függetlenül felismer minden csatolmányt — **PDF, szöveg (.txt/.csv/.json), Office (doc/xlsx/pptx), zip, kép, hang, video, stb.** A szabályok: csatolmánynak számít minden olyan rész, aminek (a) van fájlneve, vagy (b) van content-disposition (`attachment` / `inline`) ÉS méret > 0, vagy (c) `image/*` cid-vel ágyazott inline kép. **Nem** számít csatolmánynak a 0 byte-os, fájlnév és disposition nélküli „üres" rész (hibás multipart wrapper, üres cid-stub) — így nem lesz hamis 📎 jelzés. A számolás a header-szinkron során fut, így body letöltése nélkül is azonnal pontos.

## [1.33.3] – 2026-04-30

### Javítás
- **Megbízhatóbb inline kép-megjelenítés a csatolmány-listában.** Az `AttachmentList` szűrése mostantól **minden** `image/*` content-type-ú inline csatolmányt megjelenít — akkor is, ha még nincs fájlnév vagy a `data` mező még nem érkezett meg (a sor maga jelzi, hogy csatolmány érkezik; a Letöltés gomb addig disabled marad, amíg a tartalom be nem töltődik). Korábban a feltétel `(hasName || hasData) && image/*` volt, ami egy frissen érkező, még tölt-állapotú inline képnél elrejtette a sort. A nem-kép típusú inline részeket (pl. `multipart/related` üres cid-referenciák, alternatív text/html partok) továbbra is kiszűrjük, mert a usernek nincs önálló értelmük.

## [1.33.2] – 2026-04-30

### Új
- **Gemkapocs ikon csatolmányos leveleknél a listában.** A levéllistában a tárgy mellett mostantól egy kis 📎 ikon jelzi, hogy a levél tartalmaz csatolmányt — anélkül, hogy a body-t ki kellene jelölni. A jelzést a header-szinkron a `BODYSTRUCTURE` (`simpleParser` `attachments` mezője) alapján számolja ki és teszi a `MailMessage.hasAttachments` mezőbe, így a cache-ből is azonnal megjelenik újraindítás után.

### Javítás
- **Beágyazott (inline) képek mostantól letölthetők a csatolmány-listából.** Ha a levélbe képet ágyazol be (a Composer rich text szerkesztője a beillesztett képet `cid:`-vel ágyazott inline csatolmányként küldi), eddig a fogadott levélnél nem volt látható „Letöltés" gomb a kép alatt — a `MessageView` az `inline=true` csatolmányokat teljesen kiszűrte, mert a HTML-ben már megjelennek. Mostantól az inline KÉP-csatolmányok is megjelennek a levél alatti listán saját **Előnézet** és **Letöltés** gombbal, így a címzett (és te magad is, a saját elküldött levelednél) le tudja menteni az ágyazott képet. Más típusú inline részek (pl. üres cid-referenciák) továbbra is rejtve maradnak.

## [1.33.1] – 2026-04-30

### Javítás
- **Ablakméret, pozíció és maximalizált állapot megőrzése indítások között.** Eddig minden indításkor 1280×820 méretben nyílt a fő ablak (és 900×720 az egy-üzenet ablakok), így a felhasználónak újra kellett húznia a magasságot, hogy a sidebar menük rendesen kiférjenek. Mostantól a `window-state.json` állományba (a felhasználói adatkönyvtárban) elmentjük az ablak `x`, `y`, `width`, `height` és `maximized` mezőit `resize` / `move` / `maximize` / `unmaximize` / `close` eseményekre (debounce 400 ms), és a következő indításkor ezt visszaállítjuk. **Több-monitoros védelem**: a mentett pozíciót csak akkor használjuk, ha továbbra is van olyan kijelző, ahol az ablak legalább 100×100 pixelt mutat — különben az alapértelmezett méretre esünk vissza, hogy egy levált monitor miatt soha ne legyen láthatatlan az ablak. Maximalizált állapotban a normál `bounds` is megőrződik, hogy az unmaximize-kor visszakapja az előző méretét.

## [1.33.0] – 2026-04-30

### Új
- **Küldési állapotkövetés lebegő panellel.** Minden levél-küldés bekerül egy központi `sendQueue`-ba, és a jobb alsó sarokban megjelenik egy lebegő ikon — színes badge-dzsel, ami mutatja a folyamatban lévő/hibás küldések számát. Klikkre kibont egy panelt, ahol minden küldés látszik **címzettel, tárggyal és állapottal**: *Küldés folyamatban* (kék spinner), *Elküldve* (zöld pipa, 8 mp után automatikusan eltűnik), *Átmeneti hiba* (sárga, az `electron/main.cjs` 3× retry-ja után is elbukott — érdemes újrapróbálni), vagy *Végleges hiba* (piros, pl. authentication failed / 5xx). A hiba-kategóriát a renderer a main process által küldött hibaüzenet alapján olvassa ki (átmeneti / permanens / EAUTH / 535 / 5xx kulcsszavak). Ha új hiba érkezik miközben a panel zárva van, **automatikusan kinyílik**, hogy a felhasználó figyelmét ne kerülje el.
- **Újraküldés és Részletek hibás küldéseknél.** Minden hibás bejegyzésnél két gomb: **„Újraküldés"** ugyanazzal a payload-dal újrapróbálja (a job státusza visszavált *folyamatban*-ra, nem keletkezik új sor a listában), és **„Részletek"** kibontja a teljes hibaüzenetet monospace blokkban, hogy SMTP/IMAP hibakódok (pl. `535-5.7.8 Username and Password not accepted`) is olvashatóak legyenek. Ha a main process automatikusan elmentette a piszkozatot a szerver Drafts mappájába (v1.31.0-tól), egy „✓ Piszkozat mentve a szerver Drafts mappájába" jelzés is megjelenik a hibasor alatt.
- **Késleltetett küldés countdown a panelben — Composer azonnali bezárása.** A küldési késleltetés (Beállítások → Küldés késleltetés) mostantól nem a Composeren belül fut, hanem a `sendQueue`-ban: a Composer azonnal bezáródik a Küldés gomb után, és a panelben látszik a *„Küldés N mp múlva…"* visszaszámlálás egy **„Mégsem"** gombbal. Ettől szabadabban lehet több levelet írni egymás után — a régi viselkedéssel szemben nem kellett megvárni a 10 mp-es countdownt, hogy a Composer felszabaduljon.
- **Tisztítás gomb.** A panel fejlécében egy „Tisztítás" gomb az összes befejezett (sikeres + hibás) küldést egyszerre eltávolítja a listából, hogy ne kelljen egyenként klikkelni.

## [1.32.0] – 2026-04-30

### Új
- **IMAP mappa-feloldás SPECIAL-USE attribútumokkal és automatikus egyeztetéssel.** A `Drafts` / `Sent` / `Trash` / `Spam` / `Archive` logikai mappák feloldása mostantól **háromszintű prioritást** követ: (1) RFC 6154 SPECIAL-USE attribútumok a LIST-ben (`\Drafts`, `\Sent`, `\Trash`, `\Junk`, `\Archive`, `\All`) — ez a leghitelesebb forrás, független a szerver névsémájától; (2) név-alias egyezés (pl. `Drafts`, `INBOX.Drafts`, `[Gmail]/Drafts`); (3) suffix egyezés (delimiter-független). Több jelölt esetén a **nem-üres mappát preferáljuk**, így megszűnik az a helyzet, amikor a kliens (pl. Thunderbird) az `INBOX.Drafts`-ba teszi a piszkozatokat, miközben a feloldó eddig a tényleg létező, de üres `Drafts` mappára mutatott.
- **Automatikus mappa-egyeztetés a syncMailbox alatt.** Két új védelmi mechanizmus: (a) **cache-validáció** — ha a korábban cache-elt valós mappanév (pl. `Drafts`) már nem nyitható, a rendszer automatikusan újra-feloldja és frissíti a cache-t (warning is a felhasználónak); (b) **üres-mappa egyeztetés** — ha a cache-elt mappa üres a szerveren, megnézzük, hogy egy másik jelölt (más név vagy SPECIAL-USE attribútum) tartalmaz-e leveleket; ha igen, áttérünk arra. Ez szünteti meg a *„server box EMPTY"* discrepancy warningot azoknál a fiókoknál, ahol a Drafts/Sent két különböző néven is létezik (pl. `Drafts` és `INBOX.Drafts` egyszerre).
- **Perzisztens mappa-feloldás cache.** A feloldott logikai → valós név leképzés mostantól lemezre is mentődik (`mailbox-resolutions.json` a felhasználói adatkönyvtárban), így újraindítás után nem kell minden mappához újra LIST-elni a szervert — gyorsabb hidegindulás. Ha a feloldás változik (pl. SPECIAL-USE-os mappa megjelenik), a cache automatikusan átáll: `[mailbox] resolution changed acct=… Drafts: "Drafts" → "INBOX.Drafts"` log-bejegyzéssel.

## [1.31.0] – 2026-04-30

### Új
- **Automatikus retry SMTP küldéshez és IMAP szinkronhoz.** Az `smtp:send`, `cache:syncMailbox` és `cache:loadOlder` IPC hívások mostantól egy közös `runWithRetry` burkolón mennek át, ami **3× próbálkozik** exponenciális várakozással (1 s → 2 s → 4 s) átmeneti hibák esetén — pl. `ETIMEDOUT`, `ECONNRESET`, `ECONNREFUSED`, 4xx greylisting/rate limit. **Permanens hibákat** (5xx response code, authentication failed / 535 / 538, missing mailbox / 550 / 553 / 554, `EAUTH`) az első próba után azonnal megáll, hogy a felhasználó ne várjon feleslegesen. A retry-folyamat minden próbálkozása megjelenik a logban `[retry] <label> attempt N/3 …` formában, így a Hibanapló-ban utólag is rekonstruálható.
- **Sikertelen SMTP küldés → automatikus mentés a szerver Drafts mappájába.** Ha mind a 3 próbálkozás elbukik (vagy az első permanens hiba volt), a main process best-effort módon **felépíti az RFC822 üzenetet** (`MailComposer`) és IMAP `APPEND`-tel beteszi a fiók Drafts mappájába `\Draft` flag-gel — így a fáradságos szöveg nem vész el, és más kliensekben (Gmail web, Mail.app) is megjelenik. A felhasználói hibaüzenet ezt is jelzi: pl. *„SMTP hiba (átmeneti, 3 próbálkozás után, ETIMEDOUT): connect ETIMEDOUT … A piszkozat a szerver Drafts mappájába mentve."* Ha a Drafts-mentés is sikertelen (pl. IMAP is le van állva), azt is a hibaüzenet végén látja: *„Drafts-mentés is sikertelen: …"*. A háttér-szinkron a Drafts mappára azonnal lefut, hogy a piszkozat a saját UI-ban is azonnal látszódjon.

## [1.30.1] – 2026-04-30

### Javítás
- **React `forwardRef` warningok megszüntetése a levéllistában.** A jobbklik-menü bevezetése után a dev konzol két warningot dobott: „Function components cannot be given refs … Check the render method of `ScrollList`" és ugyanaz `ContextMenuContent` környezetben. A `ScrollList`-et `React.forwardRef`-re alakítottuk (a kívülről kapott ref a görgethető konténer DOM-elemére mutat), a `ContextMenuContent`-et pedig kettébontottuk: a `forwardRef` belső függvénye mostantól csak a `ContextMenuPrimitive.Content`-et adja vissza, a `Portal` egy külön wrapperben van, hogy a ref-átadás soha ne fusson át function-componenten. A funkcionalitás (jobbklik menü a leveleken) változatlan.

## [1.30.0] – 2026-04-30

### Új
- **Címzett-autocomplete a Composerben (To / Cc / Bcc).** Gépelés közben felajánlja a korábban használt e-mail címeket a saját, lokális címjegyzékből — nincs külön kapcsolat-tár, automatikusan tanul a kimenő küldésekből (sikeres `smtp.send` után) és a beérkező levelek `From` mezőiből. Fuzzy keresés: a query az email vagy a megjelenítendő név bármely részére illeszkedik (case-insensitive), a találatok gyakoriság + frissesség (≈ 2 hetes felezési idő) szerint rangsorolva, a query elejére illeszkedők előrébb. Vezérlés: ↓/↑ navigáció, Enter / Tab kiválasztás, Esc zárás, kattintás beillesztés. Vesszővel/pontosvesszővel elválasztott listákban az utolsó tokenre javasol, és „, " elválasztót tesz utána, hogy folytatható legyen a gépelés. A címjegyzék a `localStorage`-ban él (`mw.addressbook.v1`), legfeljebb 2000 bejegyzés (a leggyengébb rangú túlcsorduláskor kiesik).

## [1.29.0] – 2026-04-30

### Új
- **Részletes SMTP-naplózás a Hibanapló fájlban.** A levélküldés most végigvezeti a teljes SMTP folyamatot a logokba: indulás (host:port, secure/requireTLS, user, to/cc/bcc darabszám, subject preview), nodemailer belső debug-csatornája (`[smtp] dbg/inf/wrn/err`) a teljes EHLO/STARTTLS/AUTH/MAIL FROM/RCPT/DATA párbeszéddel, sikeres küldés (messageId, accepted/rejected, server response, időtartam ms), részleges visszautasítás (rejected címek listája), valamint hibánál `code`, `responseCode`, `command`, időtartam és a stack első 4 sora. Az érzékeny mezőket (AUTH base64, jelszó-mezők) a logger redaktálja `[REDACTED]`-re. Mindezt a Sidebar „Hibanapló mentése" gombbal egy fájlként tudod elküldeni a hibakereséshez.

## [1.28.0] – 2026-04-30

### Új
- **Részletes IMAP-hibák a toast üzenetekben.** A levélbetöltés (`syncMailbox`) és a régebbi levelek (`loadOlder`) most a UI felé is továbbítja a részleges hibákat: UIDVALIDITY váltás, inkrementális UID search hiba, ALL search hiba, kezdeti ALL search hiba, hiányzó mappa, üres szerver-mailbox, fejléc-letöltés hiba, cache race és flag-szinkron hiba. A felhasználó egy 12 másodperces `toast.warning` (vagy hibánál `toast.error`) üzenetben pontkurzoros listával látja az okokat — pl. „• ALL UID search sikertelen — nem tudtuk verifikálni a cache-t: …" — így nem kell a logfájlt megnyitni a leggyakoribb problémákért.

## [1.27.0] – 2026-04-30

### Új
- **Hibanapló mentése gomb** a bal oldali menüben (Beállítások / App frissítése alatt). Egy kattintásra letölt egy `cozy-email-pad-debug-<idő>.log` fájlt, ami időrendben tartalmazza a renderer és az Electron main process legutóbbi kb. 2000 releváns log-bejegyzését — `[loadMessages]`, `[cache.read]`, `[cache.write]`, `[syncMailbox]`, `[loadOlder]`, `[ipc cache:…]`, `[smtp]` stb. — pontos ezredmásodperces időbélyegekkel és szinttel (LOG/WARN/ERROR). Így a „nem tölti be a leveleket” / „eltűnnek a levelek” hibák utólag is rekonstruálhatók a részletes logolásból.

## [1.26.3] – 2026-04-30

### Változás
- **Részletes diagnosztikai logolás a levélbetöltés körül.** Cache hit/miss (méret, `lastUid`, `oldestUid`, `updatedAt` + életkor), cache-írás eredménye és időtartama, `syncMailbox` minden lényegi lépése (mailbox feloldás, `UIDVALIDITY` változás, üres szerver-mailbox, inkrementális/`ALL` search eredmény, fetch range és db, race-detektálás a merge előtt), valamint a `cache:syncMailbox` / `cache:loadOlder` / `cache:read` IPC handlerek be- és kimenete. A frontend `loadMessages` is logolja a cache vs. sync visszatérést, és figyelmeztet, ha üres listát kap. Ez segít beazonosítani, miért tűnik el időnként a beérkezett mappa.

## [1.26.2] – 2026-04-30

### Javítás
- **Az email lista újra megbízhatóan betölt.** Az aszinkron cache-írás után a main process több ponton azonnal visszaolvasta a fájlt, ami versenyhelyzetben üres vagy régi levéllistát adhatott vissza a UI-nak. A szinkron és a „régebbi levelek” betöltése most közvetlenül a friss memóriabeli eredményt adja vissza, és csak visszaesésként olvas a cache-ből.

## [1.26.1] – 2026-04-30

### Javítás
- **Levelek nem tűnnek el már a beérkezett mappából.** Per-mailbox sync lock került a `syncMailbox`-ba: ugyanarra a (fiók, mappa) párra egyszerre csak egy IMAP szinkron futhat. A korábbi viselkedés race-t okozott — két konkurens szinkron felülírta egymás cache-írását, és a frissen letöltött levelek „eltűntek". A merge előtt a state-et is újraolvassuk a diszkről, hogy közbejövő flag-állítások se vesszenek el.
- **Konzervatívabb cache reset.** Csak akkor dobjuk el a teljes cache-t, ha az `ALL` UID search **sikeresen** futott és tényleg jelentős eltérést talált. Korábban tranziens IMAP hiba is reset-et okozhatott.
- **Drafts szinkron nem ütközik az INBOX-szal.** Fiókváltáskor csak a Drafts mappát szinkronizáljuk háttérben — az aktív mappát úgyis a `loadMessages` kezeli, így nincs duplikált IMAP kör.
- **SMTP küldés megbízhatóbb.** Ellenőrizzük, hogy van-e SMTP felhasználónév és jelszó (érthető hibaüzenet, ha hiányzik). 587-es portnál automatikus STARTTLS (`requireTLS`). Hosszabb timeoutok (30s connect / 60s socket) lassú szervereknél. SMTP hibák részletesen logolva (kód + szerver-válasz) és érthetően jelennek meg a felhasználónak.

## [1.26.0] – 2026-04-30

### Új
- **Csatolmányok érkeznek a levelekkel.** A teljes body letöltésekor a melléklet-lista (név, méret, MIME-típus, base64 tartalom, inline `cid` jelölés) most bekerül a levélbe, így megjeleníthetők és letölthetők.

### Változás
- **Gyorsabb szinkron.** A mappanév-feloldás (Sent / Drafts / Archive…) per-fiók memóriában cache-elődik, így nincs felesleges IMAP körút. A fiók-szinkron (`syncAccount`) az INBOX-ot és a Drafts-et párhuzamosan húzza le. A flag-visszaszinkron (csillag/olvasott állapot más kliensből) csak akkor fut, ha tényleg új levél jött, vagy 10+ perce nem volt szinkron.
- **Cache írás nem blokkol.** A lokális JSON cache mentése aszinkron lett (`fs.writeFile`), így a main process event loop-ja nem akad meg nagy mappáknál.

### Javítás
- **Auto-sync listener megbízható leiratkozás.** Az `onAutoSync` cleanup `active` flag-gel kezeli a régi listener késő válaszait — fiókváltás után nem írja felül a friss listát egy korábbi szinkron eredménye.

## [1.25.1] – 2026-04-29

### Javítás
- **A levéltest teljes magassága újra helyesen látszik.** Egyes HTML leveleknél az iframe túl korán mérte le a tartalom magasságát, ezért úgy tűnt, mintha csak egy kis ablakban látnád a levelet. A magasságmérés most a teljes dokumentumot figyeli, ismételten újramér betöltés után, és a később érkező képek / layout-változások esetén is követi a tényleges méretet.

## [1.25.2] – 2026-04-30

### Javítás
- **A böngészős preview-ban a HTML levél már nem csak keskeny sávként látszik.** Az email iframe sandbox beállítása eddig megakadályozta, hogy a szülő oldal minden környezetben hozzáférjen a `srcDoc` dokumentum tényleges méretéhez, ezért a frame a kezdeti alacsony magasságon ragadt. A sandbox most úgy van szűkítve, hogy továbbra se fusson script vagy aktív tartalom, viszont a magasságmérés megbízhatóan működjön.

## [1.25.3] – 2026-04-30

### Javítás
- **A rövid HTML levelek sem „egy sávként” jelennek meg a jobb oldalon.** Ha a levél tartalma alacsony volt, a jobb oldali panel sötét üres háttérrel túl kicsinek hatott. A levéltest konténere most legalább a teljes olvasópanel-magasságot kitölti, és az iframe újraméri magát ablakméret-váltáskor is.

## [1.25.4] – 2026-04-30

### Javítás
- **Apple Mail-szerűbb tipográfia a levélnézetben.** A felület és a levéltest most SF Pro / rendszerfont alapú, finomabb méretskálával és súlyokkal jelenik meg, hogy közelebb álljon a mellékelt referencia kinézetéhez.

## [1.25.0] – 2026-04-29

### Új
- **A levéllista sortávolsága (sűrűsége) most állítható.** A lista címsorán új sor-ikon menüből választhatsz három mód közül: **Tömör**, **Kényelmes** (alapértelmezett), **Tágas**.
- A választás a tárolóban megmarad — a `listWidth`-hez hasonlóan újraindítás után is ugyanúgy fog kinézni a lista.

## [1.24.0] – 2026-04-29

### Új
- **Csatolmány-lista a levél nézet alján.** Minden levélhez tartozó (nem-inline) csatolmány külön kártyán jelenik meg típus-ikonnal, fájlnévvel, MIME-típussal és mérettel.
- **Külön „Letöltés" gomb minden csatolmányhoz** — egy kattintással menthető a fájl, függetlenül attól, hogy van-e előnézet.
- **Beépített előnézet** a támogatott típusokhoz, modális ablakban:
  - **Képek** (JPG, PNG, WebP, GIF, SVG…) — méretarányosan, a teljes ablakra igazítva.
  - **PDF** — natív böngésző-PDF-megjelenítővel (zoom, lapozás, keresés a böngészőből).
  - **Szöveg / JSON / CSV** — formázott, görgethető, monospace nézet UTF-8 dekódolással.
- Az előnézet ablakban szintén elérhető a **Letöltés** gomb, így nem kell bezárni a csatolmányhoz tartozó letöltéshez.
- A nem-támogatott típusoknál (pl. ZIP, DOCX, audio) az ikon és a Letöltés gomb akkor is megjelenik — az előnézet gomb ilyenkor el van rejtve.

### Technikai
- Új `MailAttachment` típus a `mailBridge.ts`-ben (`filename`, `contentType`, `size`, base64 `data`, opcionális `cid` / `inline` jelzés). A natív/Electron oldal töltheti ki a body-val együtt; a UI azonnal feldolgozza, amint az adatmező megjelenik.
- A bináris adatból Blob URL képződik, amit a komponens unmountkor `URL.revokeObjectURL`-lal felszabadít — nincs memória-szivárgás hosszú listáknál sem.

## [1.23.0] – 2026-04-29

### Új
- **Levél mentése PDF-ként.** Az üzenet-nézet eszköztárán új **PDF** gomb jelent meg. Rákattintva megnyílik a böngésző natív nyomtatási ablaka az adott levél formázott előnézetével — itt válaszd a **„PDF-ként mentés"** opciót (Cél: „Mentés PDF-ként" / „Save as PDF") a fájl letöltéséhez.
- A PDF tartalmazza a levél fejlécét (Tárgy, Feladó, Címzett, Másolat, Dátum) **és** az **eredeti HTML formázást** (színek, betűtípusok, beágyazott képek, táblázatok, idézet-blokkok), nyomtatás-barát A4-es elrendezésben (18×16 mm margó).
- A javasolt fájlnév automatikusan a levél tárgya alapján generálódik — a fájlrendszer számára veszélyes karaktereket (`/ \ : * ? " < > |`) aláhúzásra cseréli.
- A megoldás külső függőség nélkül készült (a böngésző renderelő motorja állítja elő a PDF-et), így a formázás 1:1 megegyezik azzal, amit az alkalmazásban látsz.

## [1.22.0] – 2026-04-29

### Új
- **Sötét mód.** A Sidebar alján új „Téma" gomb jelent meg, ahol választhatsz a **Világos**, **Sötét** és **Rendszer szerint** opciók közül.
- A „Rendszer szerint" mód automatikusan követi az operációs rendszer beállítását (macOS automatikus est, Windows téma-váltás), és élőben átáll, ha közben módosítod azt.
- A választott téma a tárolóban megmarad, és már a betöltés *előtt* alkalmazódik, így nem villan be a világos háttér indításkor.
- A natív űrlap-elemek (input, scrollbar) is sötét sémára váltanak (`color-scheme` állítása), így a beviteli mezők és görgetősávok is illeszkednek a témához.

## [1.21.0] – 2026-04-29

### Új
- **A levéllista és az üzenet-nézet közötti válaszfal mostantól húzható.** Egérkurzort a két oszlop közé víve a kurzor `↔` ikonra vált; bal/jobb húzással szabadon átméretezhető a középső lista (260 és 720 pixel között).
- **Dupla kattintás** a válaszfalon visszaállítja a 340 pixeles alapértelmezett szélességet.
- A beállított szélesség a böngésző tárolójában (localStorage) megmarad, így újraindításkor is ugyanazt a layoutot látod.

## [1.20.1] – 2026-04-29

### Javítás
- **Egymásba ágyazott idézetek esetén az aláírás mostantól a *legfelső, legkülső* idézet fölé kerül.** Ha pl. továbbküldesz egy olyan választ, ami már tartalmazott egy korábbi reply-quote-ot, eddig előfordulhatott, hogy az aláírás egy belső, ágyazott `<blockquote>` elé csúszott — ezzel kettéhasítva az idézett szálat. Mostantól DOM-szinten kiszűrjük a top-level quote-blokkot (azt, aminek nincs `data-mwquote` őse), és kifejezetten AZ ELÉ szúrjuk az aláírást. Az idézett szál belső struktúrája érintetlen marad.
- A „valós idejű aláírás-előnézet" sáv (v1.20.0) ezt a viselkedést is helyesen tükrözi: **Tartalom → Aláírás → Idézett előzmény**, akkor is, ha az idézet több szintű.

## [1.20.0] – 2026-04-29

### Új
- **Valós idejű aláírás-előnézet a levélkompozitorban.** A szerkesztő fölött egy kompakt sáv folyamatosan mutatja a levél tényleges felépítését — pl. válaszlevélnél: **Tartalom → Aláírás (név) → Idézett előzmény** —, így minden pillanatban pontosan látod, hol fog megjelenni az aláírásod a végső, elküldött levélben.
- A sáv színkódolva jelzi a blokkokat (aláírás → kiemelt, idézet → halvány), és élőben követi a változásokat: ha másik aláírást választasz, vagy átszerkeszted a sorrendet a szerkesztőben, az előnézet azonnal frissül.
- Ha az aláírást felismeri (egyezik egy mentett aláírással), a nevét is kiírja zárójelben — így nem kell „kitalálnod", melyik aláírást szúrtad be.

## [1.19.5] – 2026-04-29

### Javítás
- **A piszkozat mentési állapota most láthatóan végigfut a három fázison**: „Mentés…" (forgó ikon), „Mentve" (zöld pipa-ikon, 2 mp-ig), majd vissza a „Piszkozat mentve · X perce" időbélyegre. Korábban a React batchelése miatt a „Mentés…" fázis sosem villant fel — most `requestAnimationFrame` választja szét a két állapotot, így a felhasználó valódi visszajelzést kap a háttérmentésről.
- Hiba esetén a státusz-sáv pirosra vált és „Mentés sikertelen" felirat jelenik meg, valamint toast-üzenet is megy a részletes hibaüzenettel.

## [1.19.4] – 2026-04-29

### Javítás
- **A felsorolás és számozott lista gomb most minden környezetben megbízhatóan működik.** Korábban a gomb gyakran „nem csinált semmit" — főleg válaszlevélben (idézett blokk után), aláírás közelében, vagy ha a kurzor egy speciális blokkban (kódblokk, idézet) volt. Mostantól a hivatalos TipTap `toggleList` parancsot használjuk, ami egyetlen lépésben kapcsol át a két lista típus között, és ha a környezet blokkolná, automatikus `clearNodes()` előkészítéssel állítja vissza paragrafussá, majd alkalmazza a listát.
- **Hozzáadtuk a hivatalos TipTap `ListKeymap` extensiont.** Ennek köszönhetően:
  - **Tab** behúzza a kurzor alatti lista-elemet (almenü szint).
  - **Shift+Tab** kihúzza egy szintet.
  - **Backspace** üres listaelemen kilép a listából (a korábbi „beragadás" helyett).
  - **Dupla Enter** záró üres listaelemen szintén kilép a listából — ez a megszokott szövegszerkesztő-viselkedés.

## [1.19.3] – 2026-04-29

### Javítás
- **Dupla kattintással megnyitott levél most már akkor is betöltődik, ha még nincs a cache-ben.** Korábban az új ablak csak a lokális cache-ben keresett, és ha ott nem találta a levelet (frissen érkezett, másik mappa, vagy törölt-újrafutott szinkron után), azonnal „A levél nem található" üzenetet írt ki. Mostantól ilyenkor automatikusan letölti a levelet a szervertől UID alapján — header és body együtt érkezik egy `mail:fetchBody` hívással —, és normálisan megnyitja.
- A `mail:fetchBody` IPC mostantól a fejléc-mezőket is visszaadja (`from`, `to`, `cc`, `subject`, `date`), nemcsak a body-t. Így a hívó akkor is fel tud építeni egy teljes nézetet, ha nincs előzetes header-cache.

## [1.19.2] – 2026-04-29

### Javítás
- **A beérkező levelek formázása megmarad.** Korábban sok formázott levél (HTML hírlevelek, számlák, kampányok, táblázatos layoutok) „puszta szövegként" jelent meg, mert a levél HTML-jét közvetlenül a Tailwind `prose` osztály alá ágyaztuk be — a `prose` reset és a Tailwind utility-k pedig csendben felülírták a levél saját szövegszínét, méretét, listáit, link-stílusát. Mostantól a beérkező leveleket egy izolált `<iframe srcDoc>`-ba rendereljük (sandbox=""), pont mint az Apple Mail vagy a Gmail. A levél saját CSS-e érvényesül, az alkalmazás stílusai nem szivárognak be — a layout torzítatlan marad.
- A frame magassága a levél tartalmához igazodik (ResizeObserver + képek `load` eseménye), így nincs belső görgetősáv: az egész nézet együtt görgethető, ahogy eddig.

### Biztonság
- A frame `sandbox=""` attribútummal indul: a levélben lévő scriptek nem futnak, formok nem küldődnek, a frame nem éri el az alkalmazás cookie-jait, ablakát vagy IPC-jét.
- A linkek `target="_blank"` alá nyílnak (a `<base>` tag állítja be), így a rendelő ablak nem kerül ismeretlen oldalra.

## [1.19.1] – 2026-04-29

### Javítás
- **A sablonok (és aláírások) most már megőrzik a beágyazott képeket.** Korábban a HTML-tisztító (DOMPurify) alapból nem engedte át a `data:image/...;base64,…` URL-eket, ezért a sablonba helyezett, beillesztett vagy drag-droppal bedobott képek `<img>` tagjei `src` nélkül maradtak — mentés/újratöltés után üres ikonok jelentek meg. A sanitizer mostantól kifejezetten engedélyezi a `data:image/*` URL-eket az `<img>` tagra (és csak arra), így a sablonok teljes vizuális tartalma megmarad. A `data:text/html` és `javascript:` továbbra is tilos.

## [1.19.0] – 2026-04-29

### Új
- **Kép drag-and-drop**: a Finderből vagy bármely más alkalmazásból egyszerűen ráhúzhatsz egy (vagy több) képet a levélszerkesztőre — base64 data URL-ként beágyazódik pontosan oda, ahova ejted. Mehet egyszerre több kép is.
- **Vágólapról beillesztés (paste)**: Cmd+Shift+4-gyel készített képernyőkép, vagy bármely képen jobbklikk → „Kép másolása" után **Cmd+V** közvetlenül a szerkesztőbe szúrja be a képet, anélkül hogy előbb fájlba mentenéd. A beillesztett képeken ugyanúgy működik a mérete­zés / igazítás lebegő eszköztár (v1.18.0).

## [1.18.0] – 2026-04-29

### Új
- **Kép méretezés és igazítás** a levélszerkesztőben. Beillesztett (vagy meglévő) képre kattintva egy lebegő eszköztár jelenik meg a kép fölött:
  - **Méret**: S (200 px), M (400 px), L (640 px), 100% (teljes szélesség), Auto (eredeti).
  - **Igazítás**: balra / középre / jobbra.
  - **Törlés** gomb.
  - A kijelölt képet kék keret jelzi.
- A beállítások **inline style** és `data-align` attribútumként mentődnek, így a címzett oldalán Apple Mailben, Gmailben, Outlookban is helyesen jelennek meg — nem csak a saját szerkesztőben.

## [1.17.0] – 2026-04-29

### Változás
- **Az aláírás okos pozícionálása**: új levélnél továbbra is a levél legvégén jelenik meg, **válasznál és továbbításnál viszont az idézett előző üzenet FÖLÉ** kerül — pont oda, ahova a válaszodat is gépeled. Így a címzett a sajátt aláírásodat közvetlenül a válaszod után látja, és csak utána jön a korábbi levelezés (ahogy az Apple Mail / Gmail / Outlook is csinálja).
- Az `applySignatureToBody` mostantól megkeresi a `data-mwquote="1"` jelölésű idézett blokkot, és a szöveget **a blokk elé** szúrja be. A reply / forward HTML-ek megkapták ezt a jelölőt, és a sanitizer is megőrzi.

## [1.16.6] – 2026-04-29

### Javítás
- **Piszkozat mentése most már működik** (`TypeError: isDate is not a function`). A `node-imap` `append()` hívásban átadott `date: new Date()` opció miatt a könyvtár belső formázója egy `util.isDate` helpert keresett, ami az újabb Node verziókban már nem létezik, ezért a Drafts mappába mentés mindig elhasalt. A `date` mezőt eltávolítottuk; piszkozatnál a szerver a saját aktuális idejét használja, ami megfelelő.

## [1.16.5] – 2026-04-29

### Javítás
- **A formázó gombok (lista, link, kép, idézet, kódblokk stb.) most már az aláírás- és sablon-szerkesztőben is működnek.** A szerkesztők Radix `Dialog`-ban élnek, és a Dialog `pointerdown`-listenere visszavette a fókuszt a Dialog content root-jára, mielőtt a TipTap parancs lefutott — emiatt a kattintás "nem csinált semmit". Mostantól a toolbar gombok `pointerDown` szinten is leállítják az eseményt (preventDefault + stopPropagation), így a Dialog focus-trap nem zavarja az editor szelekcióját. A Link popover bezáráskor explicit visszafókuszál az editorra. A kép-fájlválasztó input mostantól a DOM-hoz csatolva nyílik, mert Electron Dialog alól a detached input `.click()`-je néma maradt.

## [1.16.4] – 2026-04-29

### Javítás
- **Link beszúrása a levélszerkesztőben most már működik.** A korábbi `window.prompt`-os megoldás Electron alatt nem volt megbízható (sokszor azonnal becsukódott vagy nem fókuszált vissza az editorra). Mostantól a Link gomb egy beépített popover űrlapot nyit URL mezővel, **Beszúrás**, **Mégse** és — meglévő linknél — **Eltávolítás** gombokkal. Enter = beszúrás, Esc = bezárás. A kijelölt szöveg megmarad, mert a popover nem veszi el az editor szelekcióját.

## [1.16.3] – 2026-04-29

### Javítás
- **Kép beillesztése a levélszerkesztőben most már működik.** Korábban a gomb egy URL-t kérő `prompt` ablakot dobott fel, ami Electron alatt sok esetben azonnal becsukódott vagy nem fogadta el a beírt címet, ezért gyakorlatilag használhatatlan volt. Mostantól a gomb natív fájlválasztót nyit meg: a kiválasztott képet base64 data URL-ként ágyazza be a levélbe, így a címzettnél is megjelenik küldés után, külön képhost nélkül.

## [1.16.2] – 2026-04-29

### Javítás
- **A számozott lista gomb most már akkor is működik, ha a kurzor épp sima felsorolásban van vagy abból váltanál át.** Korábban a `toggleOrderedList()` egyes listás kontextusokban némán `false`-t adott vissza, ezért a gomb úgy tűnt, mintha nem reagálna. Most a váltás először megpróbálja lezárni az aktuális listatípust, szükség esetén kiemeli a list itemet, és csak végső fallbackként törli a blokk-környezetet.

## [1.16.1] – 2026-04-29

### Javítás
- **Felsorolás / számozott lista gomb most már mindig működik** a levélszerkesztőben. A korábbi viselkedés: ha a kurzor egy idézet (`blockquote`) vagy aláírás-blokk belsejében volt — ami reply/forward után tipikus —, a TipTap `toggleBulletList` parancs csendben false-t adott vissza, és a gomb úgy tűnt, mintha nem reagálna. Mostantól, ha az első hívás nem sikerül, a szerkesztő először `clearNodes`-szal egyszerű paragraph-okká alakítja a szelekciót, és úgy alkalmazza a listát. Ugyanez az „önjavító" logika él már az **Idézet** és **Kód blokk** gombokra is.

## [1.16.0] – 2026-04-29

### Új
- **Header-only szinkron**: a lista letöltésekor már csak a fejléceket (feladó, címzett, tárgy, dátum, flag-ek) húzzuk le a szerverről, nem a teljes levelet. Tipikusan **5–10× gyorsabb** szinkron, főleg sok új levél és nagy üzenetek esetén.
- **Lazy body-betöltés**: a teljes szöveg/HTML akkor töltődik le, amikor megnyitsz egy levelet (olvasópanel vagy új ablak). Egy „Levél tartalmának betöltése…" felirat jelzi a betöltést, ami általában <1 mp.
- **Fiókok párhuzamos szinkronizálása**: az 5 perces háttér-poll mostantól minden fiókot **egyszerre** szinkronizál, nem sorban. Több fiókkal arányosan gyorsabb a teljes ciklus.

### Változás
- A `mail:fetchBody` IPC végpont és a `mailAPI.mail.fetchBody` bridge-metódus új. A `MailMessage` típus kiegészült a `bodyLoaded?: boolean` mezővel — `false`, ha még csak fejléc van a cache-ben, `true`, ha a teljes body letöltődött (a sikeres body-fetch után tartósan a cache-ben marad).

## [1.15.0] – 2026-04-29

### Új
- **Lista szűrők**: a kereső alatt három chip jelent meg — **Összes**, **Olvasatlan**, **Csillagos** — mindegyiken a darabszámmal. Kattintásra a lista azonnal szűkül; ugyanarra a chipre újra kattintva visszavált „Összes"-re.
- A **Csillagos** szűrő aktív állapotban sárga, az **Olvasatlan** kék kiemelést kap, így messziről látszik az aktuális mód.
- Üres találatnál szűrő-specifikus üzenet („Nincs olvasatlan levél" / „Nincs megjelölt levél").
- Mappaváltáskor a szűrő automatikusan visszaáll **Összes**-re, így nem lehet véletlenül „beragadni" üres listán másik mappában.

## [1.14.0] – 2026-04-29

### Új
- **Kétirányú flag-szinkron**: a csillag (`\Flagged`) és olvasott (`\Seen`) állapot mostantól **mindkét irányba** szinkronizálódik a szerverrel. Ha más kliensben (Mail.app, Gmail web, mobil) megjelölsz vagy elolvasol egy levelet, a változás a következő szinkronnál (5 percenkénti auto-poll vagy manuális frissítés) automatikusan megjelenik a Cozy-ban is.
- A háttér-szinkron a kiválasztott mappa cache-elt UID-jainak teljes flag-listáját lekéri egy gyors `UID FETCH FLAGS` hívással (body nélkül, így nem lassul a sync), és csak a ténylegesen változott üzeneteket frissíti a cache-ben.
- A nyitott mappa listája csendben (toast nélkül) is frissül, ha csak flag-változás történt — így a csillag/olvasott állapot azonnal naprakész.

### Változás
- Új `fetchFlagsByUidRange` (main process) és `applyFlagUpdates` (cache modul) helperek.
- Az auto-sync event mostantól minden lefutáskor szól a renderernek (`added=0` esetén csendes UI-frissítés flag-szinkronhoz).

## [1.13.0] – 2026-04-29

### Új
- **Csillag (\\Flagged) és olvasott/olvasatlan (\\Seen) megjelölés** mostantól látszik és állítható:
  - **Listában**: olvasatlan leveleknél kék pötty + vastag betű, csillagozott leveleknél halvány sárga háttér + sárga csillag ikon a sor jobb felső sarkában (kattintásra váltakozik).
  - **Részletes nézet** (és új ablakban nyitott levél) fejlécében: csillag toggle gomb és „Megjelölés olvasatlannak / olvasottnak" gomb.
  - **Kiválasztáskor** a levél automatikusan olvasottá válik a szerveren is.
- A megjelölések valódi IMAP flag-ekként mennek ki a szerverre, így minden más kliensben (Mail.app, Gmail webfelület, mobil) is ugyanúgy látszanak.

### Változás
- Új `mail:setFlag` IPC végpont (`\\Flagged`, `\\Seen` add/del) optimista UI-frissítéssel és cache-szinkronizálással.
- A levelek lehúzásakor a fetch mostantól rögzíti a szerver `attrs.flags` mezőjét → `flagged` és `seen` mezők a `MailMessage`-ben.

## [1.12.0] – 2026-04-29

### Új
- **Levél megnyitása új ablakban** dupla kattintással: a lista bármely sorára duplán kattintva az adott levél külön natív ablakban nyílik meg, ahol ugyanúgy lehet **válaszolni**, **mindenkinek válaszolni**, **továbbítani**, és **piszkozat szerkesztése** gomb is megjelenik a Drafts mappa leveleinél. Több levelet is meg lehet nyitni párhuzamosan.
- Új `/message` útvonal és `MessagePage` a renderelő oldalon, valamint új `window:openMessage` IPC végpont a main processben, ami egy önálló BrowserWindow-t indít a kiválasztott levél paramétereivel (accountId, mailbox, seqno, uid).
- Az új ablak címe automatikusan a levél tárgya lesz.

## [1.11.0] – 2026-04-29

### Új
- **Automatikus IMAP szinkron a háttérben**: az alkalmazás mostantól **5 percenként** magától lekéri minden mentett fiók **INBOX**-át, így az új levelek manuális frissítés nélkül is megjelennek. Az első automatikus futás az indulás után 30 másodperccel történik, hogy ne lassítsa az UI betöltését.
- **Új levél értesítés**: ha az automatikus szinkron új levelet talál, diszkrét toast jelenik meg (`"N új levél (fiók címke)"`). Ha pont az érintett fiók/mappa van nyitva, a lista azonnal frissül a háttérben — nem kell semmit klikkelni.
- A háttér-szinkron egyszerre csak egyszer fut (mutex), így nem ütközik a manuális „Szinkronizálás" gombbal vagy a fiókváltáskori auto-frissítéssel.

## [1.10.4] – 2026-04-29

### Javítás
- **Legfrissebb levelek szinkronja** megbízhatóbb lett: az IMAP fetch eddig hamarabb adhatott vissza eredményt, mint ahogy a levelek parserelése ténylegesen befejeződött, ezért az újonnan érkezett üzenetek néha kimaradtak a frissítésből. Most a szinkron megvárja, hogy minden letöltött levél teljesen feldolgozódjon, és csak utána írja a cache-be és küldi vissza a listát a felületnek.

## [1.10.3] – 2026-04-29

### Változás
- **Lazy-load visszajelzés**: amikor a lista aljára görgetsz és a régebbi leveleket tölti, mostantól egy jól látható **forgó spinner** és „Régebbi levelek betöltése…" felirat jelenik meg a lista alján, így egyértelmű, hogy folyamatban van a letöltés. Ha kifogytak a régebbi levelek, a „Nincs több régebbi levél" üzenet látszik.

## [1.10.2] – 2026-04-29

### Javítás
- **Régebbi levelek letöltése** nem működött rendesen: a lazy-load egy egyszerű `lower:upper` UID-tartományt kért, de a UID-ok nem összefüggőek (a törölt levelek hézagokat hagynak), így gyakran üres választ kapott vagy beragadt ugyanazon a ponton. Mostantól `UID SEARCH`-csel kérdezzük le a szervertől, mely UID-ok léteznek `oldestUid` alatt, és csak a tényleg meglévőket fetcheljük lapokban (200/oldal).
- A „nincs több régebbi levél" jelzés mostantól pontos: csak akkor jelenik meg, ha a szerver szerint tényleg nincs több régebbi UID.

## [1.10.1] – 2026-04-29

### Javítás
- **Friss e-mailek nem töltődtek le** néhány mappában (pl. ahol egy korábbi szinkron miatt a cache-elt `lastUid` magasabb volt, mint a szerver legnagyobb UID-ja). A szinkron mostantól a szervertől **UID SEARCH**-csel kérdezi meg, mely UID-ok újak — így nem ragad be hibás cache-állapot esetén.
- Ha a szerver legnagyobb UID-ja kisebb, mint a lokális `lastUid` (rejtett UIDVALIDITY váltás vagy mailbox visszaállítás), a cache automatikusan **resetel** és újratölti a legutóbbi 200 levelet.

## [1.10.0] – 2026-04-29

### Új
- **Visszavonás / Újra (Undo / Redo)** működő gombok a levélíró és aláírás/sablon szerkesztők eszköztárán. A gombok automatikusan **letiltódnak**, ha nincs mit visszavonni vagy újra-csinálni, és valós időben követik az editor előzmény-állapotát. Billentyűparancsok továbbra is: ⌘Z / ⌘⇧Z (Ctrl+Z / Ctrl+Shift+Z).

### Javítás
- A formázó gombok aktív (kiemelt) állapota mostantól minden kurzormozgás és tranzakció után azonnal frissül — eddig csak az editor példány cseréjekor rajzolódott újra a toolbar.

## [1.9.0] – 2026-04-29

### Új
- **Kapcsolatok** menü az oldalsávon (Users ikon): automatikusan összegyűjti az összes egyedi e-mail címet a fogadott és elküldött leveleidből (INBOX, Sent, Drafts, Archive, Spam mappákból, minden fiókon át). Mindegyiknél látszik a név, hányszor szerepelt, és mikor volt utoljára. Keresés név vagy e-mail alapján, „Saját rejtve" kapcsoló a saját fiókcímek elrejtéséhez.
- A kapcsolatok listájából egy kattintással **másolható** az e-mail cím, vagy **új levél** indítható az adott partnernek (a Címzett mező előre kitöltve, „Név <email>" formátumban).

## [1.8.0] – 2026-04-29

### Új
- **Piszkozat mentése a szerverre** — a levélíró ablakban új „Mentés piszkozatként" gomb. Az üzenet a fiók IMAP **Drafts** mappájába kerül `\Draft` flag-gel, így más kliensekben (Gmail web, Mail.app, Outlook stb.) is megjelenik, és a saját appodban a Piszkozatok mappa azonnal frissül.
- Fiókváltáskor háttérben már nem csak az **INBOX**, hanem a **Drafts** mappa is automatikusan szinkronizálódik, így a Piszkozatok mappára kattintva azonnal látod a szerveren tárolt piszkozatokat.

### Változás
- A Piszkozatok mappára kattintáskor a meglévő inkrementális szinkron hozza le a szerverről az új piszkozatokat (a 200-as lazy-load oldalakkal — régebbiekért lejjebb görgess).

## [1.7.1] – 2026-04-29

### Javítás
- A rich text szerkesztő (üzenet szerkesztő, sablonok, aláírások) gombjai (H1/H2/H3, felsorolás, számozott lista, link, kép, idézet, kód blokk, vízszintes vonal) most ténylegesen működnek. Két ok együtt akadályozta őket:
  1. A toolbar gombokra való kattintáskor a `mousedown` elvette az editor fókuszát — a kattintás-handler `chain().focus().toggleX()` futott, de a parent rögtön újrarenderelt és a `value` prop visszaírta az editor tartalmát, eltüntetve a hatást. **Megoldás:** minden gombra `onMouseDown={preventDefault}`, így a szelekció és fókusz megmarad.
  2. A külső `value` prop minden parent-state-változáskor felülírta az editor tartalmát. **Megoldás:** egy `lastEmittedRef`-fel követjük, mit küldtünk ki utoljára `onUpdate`-ben, és csak akkor állítjuk vissza a tartalmat, ha valóban kívülről jött új érték (pl. „Sablon beszúrása" vagy új levél megnyitása).

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
