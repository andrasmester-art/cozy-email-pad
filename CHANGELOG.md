# Változások (Changelog)

A formátum: minden verzió saját szakaszt kap `## [verzió] – dátum` címmel.
A bejegyzések kategóriái: **Új**, **Javítás**, **Változás**.

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
