import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
// A ListKeymap a TipTap hivatalos megoldása a megbízható lista-kezelésre:
// Tab/Shift-Tab indent, Backspace üres listaelemen kilép a listából,
// Enter dupla nyomás záró elemen kilép. Enélkül a felsorolás "ragad" és
// több környezetben (signature, blockquote után) használhatatlan.
import ListKeymap from "@tiptap/extension-list-keymap";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Bold, Italic, Strikethrough, Code, List, ListOrdered, Quote,
  Heading1, Heading2, Heading3, Link as LinkIcon, Image as ImageIcon,
  Undo2, Redo2, Minus, CodeSquare,
  AlignLeft, AlignCenter, AlignRight, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Bővített kép extension: width (pl. "320px" / "50%") + igazítás
// (`data-align="left|center|right"`). Inline style-okat írunk ki, mert az
// email-kliensek (Apple Mail, Gmail, Outlook) megbízhatóan csak ezt értik —
// CSS osztályok többségét stripelik. A renderHTML függvény gondoskodik róla,
// hogy a `<img>` köré (igazításnál) egy block-szintű `<p style="text-align">`
// kerüljön, így az igazítás a küldött levélben is látszik.
const ResizableImage = Image.extend({
  // Block-szintű kép, hogy a paragrafus text-align öröklődjön rá.
  inline: false,
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => {
          const style = el.getAttribute("style") || "";
          const m = style.match(/width:\s*([^;]+)/i);
          return (m && m[1].trim()) || el.getAttribute("width") || null;
        },
        renderHTML: (attrs) => {
          if (!attrs.width) return {};
          // A width-et stílusban adjuk vissza — height: auto megőrzi az
          // arányt minden klienseknél.
          return { style: `width: ${attrs.width}; height: auto; max-width: 100%;` };
        },
      },
      align: {
        default: "left",
        parseHTML: (el) => el.getAttribute("data-align") || "left",
        renderHTML: (attrs) => {
          const a = attrs.align || "left";
          // A data-attr-t megtartjuk, hogy a sanitizer ne dobja el (ezt a
          // sanitizeHtml allowlist explicit megengedi). A vizuális
          // igazítást a szerkesztőben CSS-szel oldjuk meg (lásd index.css /
          // alábbi inline class), levélben pedig a wrapper text-align-je
          // gondoskodik róla — lásd alább a setImageAlign helpert, ami a
          // szülő paragrafusra teszi rá.
          return {
            "data-align": a,
            class: `mw-img mw-img-${a}`,
          };
        },
      },
    };
  },
});

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
};

const ToolbarBtn = ({
  active, disabled, onClick, children, title,
}: { active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode; title: string }) => (
  <Button
    type="button"
    variant="ghost"
    size="sm"
    title={title}
    disabled={disabled}
    // FONTOS: a mousedown alapértelmezett viselkedése elvenné a fókuszt az
    // editorról, mire a kattintás-handler lefut. Ettől a chain().focus()
    // hívás új szelekcióval vagy hibásan futna, és pl. a H1/lista/link
    // formázás "nem csinálna semmit". A preventDefault megőrzi az editor
    // szelekcióját és fókuszát.
    //
    // Radix Dialog-on belül (pl. Aláírások / Sablonok szerkesztő) a Dialog
    // saját pointerdown-listenere a fókuszt a Dialog content root-jára
    // viszi vissza, ami szintén ki tudja lőni a TipTap szelekciót. Ezért a
    // pointerDown-on is preventDefault-ot hívunk + stopPropagation-t, hogy
    // a Dialog ne lássa az eseményt.
    onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    className={cn("h-8 w-8 p-0", active && "bg-accent text-accent-foreground")}
  >
    {children}
  </Button>
);

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  // A felsorolás/számozott lista bekapcsolásához mindig ugyanazt a stratégiát
  // követjük: ha már aktív → kikapcs; ha másik lista típusban van → átvált
  // (toggle a régit, toggle az újat); ha bármelyik nem-paragrafus blokkban
  // (idézet, signature, code) van a kurzor, előbb `clearNodes()` alapra
  // hozza a környezetet, majd alkalmazza a listát. Ez biztosítja, hogy a
  // gomb minden környezetben látható eredményt ad — a korábbi „némán false"
  // ágak helyett. (TipTap forum: ez a hivatalosan ajánlott pattern.)
  const toggleListReliably = (kind: "bulletList" | "orderedList") => {
    const other = kind === "bulletList" ? "orderedList" : "bulletList";
    const chain = editor.chain().focus();
    if (editor.isActive(kind)) {
      chain.toggleList(kind, "listItem").run();
      return;
    }
    if (editor.isActive(other)) {
      // Átváltás másik lista-típusra a hivatalos toggleList paranccsal.
      editor.chain().focus().toggleList(kind, "listItem").run();
      return;
    }
    if (editor.chain().focus().toggleList(kind, "listItem").run()) return;
    // Fallback: ha a környezet (signature/blockquote/code) blokkolja,
    // előbb visszaalakítjuk paragraph-okká.
    editor.chain().focus().clearNodes().toggleList(kind, "listItem").run();
  };
  const toggleBulletListSafely = () => toggleListReliably("bulletList");
  const toggleOrderedListSafely = () => toggleListReliably("orderedList");
  // A link szerkesztését popoverrel oldjuk meg, mert a `window.prompt`
  // Electron alatt sok esetben nem fókuszál vissza az editorra (vagy
  // azonnal becsukódik), ezért a Link gomb gyakorlatilag nem működött.
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const openLinkEditor = () => {
    const prev = (editor.getAttributes("link").href as string) || "";
    setLinkUrl(prev || "https://");
    setLinkOpen(true);
  };
  const applyLink = () => {
    const url = linkUrl.trim();
    if (!url || url === "https://") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
    setLinkOpen(false);
  };
  const removeLink = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkOpen(false);
  };
  const insertImage = () => {
    // Fájl választó: base64 data URL-ként ágyazzuk be a képet, így az
    // email küldéskor is megjelenik a címzettnél (nem szükséges külső host).
    //
    // FONTOS: az inputot CSATOLJUK a DOM-hoz (off-screen), mert Radix Dialog
    // belsejéből hívva (Aláírások/Sablonok szerkesztő) a detached input
    // .click()-je Electronban néma marad — a Dialog focus-trap-je elnyeli
    // az eseményt. A document.body-hoz csatolva ez nem fordul elő.
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.top = "-9999px";
    input.style.opacity = "0";
    document.body.appendChild(input);
    const cleanup = () => { try { document.body.removeChild(input); } catch {} };
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { cleanup(); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const src = reader.result as string;
        if (src) editor.chain().focus().setImage({ src }).run();
        cleanup();
      };
      reader.onerror = cleanup;
      reader.readAsDataURL(file);
    };
    // Ha a felhasználó Mégse-t nyom, az onchange nem fut le — takarítsunk
    // valamikor utána, hogy ne maradjon árva input a DOM-ban.
    setTimeout(() => { if (!input.files || input.files.length === 0) cleanup(); }, 60_000);
    input.click();
  };
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1.5 bg-surface-elevated rounded-t-md">
      <ToolbarBtn
        title="Visszavonás (⌘Z)"
        disabled={!editor.can().chain().focus().undo().run()}
        onClick={() => editor.chain().focus().undo().run()}
      ><Undo2 className="h-4 w-4" /></ToolbarBtn>
      <ToolbarBtn
        title="Újra (⌘⇧Z)"
        disabled={!editor.can().chain().focus().redo().run()}
        onClick={() => editor.chain().focus().redo().run()}
      ><Redo2 className="h-4 w-4" /></ToolbarBtn>
      <Separator orientation="vertical" className="h-5 mx-1" />
      <ToolbarBtn title="H1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 className="h-4 w-4" /></ToolbarBtn>
      <ToolbarBtn title="H2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></ToolbarBtn>
      <ToolbarBtn title="H3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="h-4 w-4" /></ToolbarBtn>
      <Separator orientation="vertical" className="h-5 mx-1" />
      <ToolbarBtn title="Félkövér (⌘B)" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></ToolbarBtn>
      <ToolbarBtn title="Dőlt (⌘I)" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></ToolbarBtn>
      <ToolbarBtn title="Áthúzott" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></ToolbarBtn>
      <ToolbarBtn title="Inline kód" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}><Code className="h-4 w-4" /></ToolbarBtn>
      <Separator orientation="vertical" className="h-5 mx-1" />
      {/* Listák/idézet/kódblokk: a `lift`/`toggle` parancsok némán false-t adnak,
          ha a szelekció olyan blokkban van (pl. blockquote idézet, signature),
          ahol a célblokk nem váltható közvetlenül. Ezért előbb `liftEmptyBlock`
          és — ha még akkor sem aktiválható — `clearNodes`-szal visszaalakítjuk
          a környezetet egyszerű paragraph-okká, és úgy hívjuk meg a toggle-t.
          Ez teszi megbízhatóvá a felsorolás gombot reply/forward után is. */}
      <ToolbarBtn
        title="Felsorolás"
        active={editor.isActive("bulletList")}
        onClick={toggleBulletListSafely}
      ><List className="h-4 w-4" /></ToolbarBtn>
      <ToolbarBtn
        title="Számozott lista"
        active={editor.isActive("orderedList")}
        onClick={toggleOrderedListSafely}
      ><ListOrdered className="h-4 w-4" /></ToolbarBtn>
      <ToolbarBtn
        title="Idézet"
        active={editor.isActive("blockquote")}
        onClick={() => {
          if (!editor.chain().focus().toggleBlockquote().run()) {
            editor.chain().focus().clearNodes().toggleBlockquote().run();
          }
        }}
      ><Quote className="h-4 w-4" /></ToolbarBtn>
      <ToolbarBtn
        title="Kód blokk"
        active={editor.isActive("codeBlock")}
        onClick={() => {
          if (!editor.chain().focus().toggleCodeBlock().run()) {
            editor.chain().focus().clearNodes().toggleCodeBlock().run();
          }
        }}
      ><CodeSquare className="h-4 w-4" /></ToolbarBtn>
      <ToolbarBtn title="Vízszintes vonal" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus className="h-4 w-4" /></ToolbarBtn>
      <Separator orientation="vertical" className="h-5 mx-1" />
      <Popover open={linkOpen} onOpenChange={setLinkOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            title="Link"
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={openLinkEditor}
            className={cn("h-8 w-8 p-0", editor.isActive("link") && "bg-accent text-accent-foreground")}
          >
            <LinkIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-80 p-3"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => {
            // Ne hagyjuk, hogy a Popover/Dialog visszadobja a fókuszt a
            // trigger gombra — ehelyett magunk fókuszálunk az editorra,
            // hogy a beszúrt link/szöveg után rögtön gépelhetőek legyünk.
            e.preventDefault();
            requestAnimationFrame(() => editor?.commands.focus());
          }}
        >
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Link URL</label>
            <Input
              autoFocus
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); applyLink(); }
                if (e.key === "Escape") { e.preventDefault(); setLinkOpen(false); }
              }}
              placeholder="https://example.com"
            />
            <div className="flex justify-between gap-2 pt-1">
              {editor.isActive("link") ? (
                <Button type="button" variant="ghost" size="sm" onClick={removeLink}>Eltávolítás</Button>
              ) : <span />}
              <div className="flex gap-2 ml-auto">
                <Button type="button" variant="outline" size="sm" onClick={() => setLinkOpen(false)}>Mégse</Button>
                <Button type="button" size="sm" onClick={applyLink}>Beszúrás</Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <ToolbarBtn title="Kép beszúrása" onClick={insertImage}><ImageIcon className="h-4 w-4" /></ToolbarBtn>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lebegő kép-eszköztár: csak akkor jelenik meg, ha a kijelölés egy képen
// van. Méretezés (kis/közepes/nagy/teljes szélesség), igazítás és törlés.
// A pozíciót a kiválasztott `<img>` `getBoundingClientRect()` alapján a
// szülő (relative) konténerhez képest számoljuk — így scrollolásnál és
// resize-nál is helyén marad.
function ImageBubbleMenu({
  editor,
  containerRef,
}: {
  editor: Editor;
  containerRef: React.RefObject<HTMLDivElement>;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const isImage = editor.isActive("image");
  const currentWidth = (editor.getAttributes("image").width as string) || "";
  const currentAlign = (editor.getAttributes("image").align as string) || "left";

  useLayoutEffect(() => {
    if (!isImage || !containerRef.current) {
      setPos(null);
      return;
    }
    const update = () => {
      const { state, view } = editor;
      const { from } = state.selection;
      const dom = view.nodeDOM(from) as HTMLElement | null;
      const img = dom?.tagName === "IMG" ? (dom as HTMLImageElement) : (dom?.querySelector?.("img") as HTMLImageElement | null);
      if (!img || !containerRef.current) { setPos(null); return; }
      const cRect = containerRef.current.getBoundingClientRect();
      const iRect = img.getBoundingClientRect();
      // A toolbar a kép FELETT — ha nem fér ki, a kép alá ugrik.
      const wantTop = iRect.top - cRect.top - 44;
      const top = wantTop < 4 ? iRect.bottom - cRect.top + 8 : wantTop;
      const left = Math.max(8, iRect.left - cRect.left);
      setPos({ top, left });
    };
    update();
    const scroller = containerRef.current.querySelector(".overflow-auto") || window;
    scroller.addEventListener("scroll", update, { passive: true } as any);
    window.addEventListener("resize", update);
    return () => {
      scroller.removeEventListener("scroll", update as any);
      window.removeEventListener("resize", update);
    };
  }, [isImage, editor, containerRef, currentWidth, currentAlign]);

  if (!isImage || !pos) return null;

  const setWidth = (w: string | null) => {
    editor.chain().focus().updateAttributes("image", { width: w }).run();
  };
  const setAlign = (a: "left" | "center" | "right") => {
    // Az igazítást két szinten alkalmazzuk:
    //  1) a `data-align` attribútumon (perzisztens, exporthoz),
    //  2) a szülő paragrafus `text-align`-jén (vizuálisan és az emailben is
    //     megfelelő — az img block-szintű, így a parent text-align mozgatja).
    editor
      .chain()
      .focus()
      .updateAttributes("image", { align: a })
      .updateAttributes("paragraph", { textAlign: a } as any) // ártalmatlan, ha nincs textAlign attr
      .run();
    // Fallback: kézzel állítjuk a szülő `<p>` text-align stílusát, mert
    // alap StarterKit paragraph-on nincs textAlign extension. Ez biztos
    // megoldás, és a sanitizer az inline style-t engedi.
    requestAnimationFrame(() => {
      const { state, view } = editor;
      const { from } = state.selection;
      const dom = view.nodeDOM(from) as HTMLElement | null;
      const img = dom?.tagName === "IMG" ? dom : (dom?.querySelector?.("img") as HTMLElement | null);
      const p = img?.closest("p, div");
      if (p instanceof HTMLElement) p.style.textAlign = a;
    });
  };
  const removeImage = () => editor.chain().focus().deleteSelection().run();

  const Btn = ({
    active, onClick, title, children,
  }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) => (
    <button
      type="button"
      title={title}
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "h-7 px-2 text-xs rounded inline-flex items-center gap-1 hover:bg-accent",
        active && "bg-accent text-accent-foreground",
      )}
    >{children}</button>
  );

  return (
    <div
      style={{ top: pos.top, left: pos.left }}
      className="absolute z-20 flex items-center gap-1 rounded-md border border-border bg-popover shadow-md px-1.5 py-1"
      // A kattintás ne mozdítsa el az ProseMirror szelekciót.
      onMouseDown={(e) => e.preventDefault()}
    >
      <Btn title="Kicsi (200 px)" active={currentWidth === "200px"} onClick={() => setWidth("200px")}>S</Btn>
      <Btn title="Közepes (400 px)" active={currentWidth === "400px"} onClick={() => setWidth("400px")}>M</Btn>
      <Btn title="Nagy (640 px)" active={currentWidth === "640px"} onClick={() => setWidth("640px")}>L</Btn>
      <Btn title="Teljes szélesség" active={currentWidth === "100%"} onClick={() => setWidth("100%")}>100%</Btn>
      <Btn title="Eredeti méret" active={!currentWidth} onClick={() => setWidth(null)}>Auto</Btn>
      <Separator orientation="vertical" className="h-5 mx-1" />
      <Btn title="Balra" active={currentAlign === "left"} onClick={() => setAlign("left")}>
        <AlignLeft className="h-3.5 w-3.5" />
      </Btn>
      <Btn title="Középre" active={currentAlign === "center"} onClick={() => setAlign("center")}>
        <AlignCenter className="h-3.5 w-3.5" />
      </Btn>
      <Btn title="Jobbra" active={currentAlign === "right"} onClick={() => setAlign("right")}>
        <AlignRight className="h-3.5 w-3.5" />
      </Btn>
      <Separator orientation="vertical" className="h-5 mx-1" />
      <Btn title="Kép törlése" onClick={removeImage}>
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      </Btn>
    </div>
  );
}

export function RichTextEditor({ value, onChange, placeholder, className }: Props) {
  // A legutóbb kibocsátott (saját) HTML — így meg tudjuk különböztetni a
  // belső (gépelés/formázás) és külső (parent által szándékosan adott)
  // értékváltozást. Belsőre nem nyúlunk az editor-hoz.
  const lastEmittedRef = useRef<string>(value || "");

  const editor = useEditor({
    extensions: [
      // Tiptap v3 StarterKit már tartalmazza a Link-et és az Underline-t.
      // A Link-et kikapcsoljuk a StarterKit-ben, hogy a saját, konfigurált
      // példányunkat használhassuk (openOnClick: false, biztonságos rel),
      // különben "Duplicate extension names" figyelmeztetést kapnánk és a
      // setLink parancs ütközne.
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      ResizableImage.configure({ allowBase64: true }),
      Typography,
      Placeholder.configure({ placeholder: placeholder || "Írj ide…" }),
      // Hivatalos TipTap lista-keymap: Tab indent / Shift-Tab outdent /
      // Backspace üres `<li>`-n kilépés / dupla Enter záró elemen kilépés.
      // Ez teszi a felsorolást valóban használhatóvá emailszerkesztésnél.
      ListKeymap,
    ],
    content: value,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      lastEmittedRef.current = html;
      onChange(html);
    },
    editorProps: {
      attributes: {
        class: "px-4 py-3 min-h-[260px] focus:outline-none",
      },
      // Drag-and-drop: ha a beejtett DataTransfer-ben van kép fájl,
      // base64 data URL-ként beágyazzuk a leveles editorba (ahogy a
      // toolbar Kép gombja is). Több kép esetén egymás után kerülnek be.
      // A drop pozíció az ejtés helyén lesz (posAtCoords).
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false; // belső node-mozgatás (pl. kép áthelyezés) — hagyjuk
        const dt = (event as DragEvent).dataTransfer;
        const files = dt?.files ? Array.from(dt.files).filter((f) => f.type.startsWith("image/")) : [];
        if (files.length === 0) return false;
        event.preventDefault();
        const coords = { left: (event as DragEvent).clientX, top: (event as DragEvent).clientY };
        const posInfo = view.posAtCoords(coords);
        const dropPos = posInfo ? posInfo.pos : view.state.selection.from;
        files.forEach((file) => {
          const reader = new FileReader();
          reader.onload = () => {
            const src = reader.result as string;
            if (!src) return;
            const node = view.state.schema.nodes.image?.create({ src });
            if (!node) return;
            const tr = view.state.tr.insert(dropPos, node);
            view.dispatch(tr);
          };
          reader.readAsDataURL(file);
        });
        return true;
      },
      // Paste: vágólapra másolt képet (Cmd+Shift+4 screenshot, böngésző
      // „Kép másolása", stb.) base64-ként szúrunk be a kurzor helyére.
      // Ha van „normál" szöveg/HTML a vágólapon, azt nem zavarjuk —
      // csak akkor kapcsolunk be, ha a clipboardItems között valódi
      // kép-fájl van.
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        const imageFiles: File[] = [];
        for (const it of Array.from(items)) {
          if (it.kind === "file" && it.type.startsWith("image/")) {
            const f = it.getAsFile();
            if (f) imageFiles.push(f);
          }
        }
        if (imageFiles.length === 0) return false;
        event.preventDefault();
        imageFiles.forEach((file) => {
          const reader = new FileReader();
          reader.onload = () => {
            const src = reader.result as string;
            if (!src) return;
            const node = view.state.schema.nodes.image?.create({ src });
            if (!node) return;
            const tr = view.state.tr.replaceSelectionWith(node);
            view.dispatch(tr);
          };
          reader.readAsDataURL(file);
        });
        return true;
      },
    },
  });

  // A toolbar gombok (undo/redo disabled, aktív formázás) állapota az editor
  // tranzakcióitól függ. A useEditor hook alapból csak akkor triggerel
  // re-rendert, ha az editor példány maga változik. Ezért feliratkozunk a
  // transaction/selectionUpdate eseményekre, és egy számláló növelésével
  // kényszerítjük a komponens újrarajzolását.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const rerender = () => setTick((t) => t + 1);
    editor.on("transaction", rerender);
    editor.on("selectionUpdate", rerender);
    return () => {
      editor.off("transaction", rerender);
      editor.off("selectionUpdate", rerender);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const incoming = value || "";
    // Csak akkor reseteljük az editor tartalmát, ha a kívülről jövő érték
    // tényleg eltér attól, amit mi legutóbb kiküldtünk. Így a parent által
    // visszahívott setBody(html) → újrarender → ugyanaz a value NEM fogja
    // a kurzort és a formázási szelekciót szétlőni — emiatt nem működtek
    // korábban a H1/H2, listák, link/kép gombok.
    if (incoming === lastEmittedRef.current) return;
    if (incoming === editor.getHTML()) return;
    lastEmittedRef.current = incoming;
    editor.commands.setContent(incoming, { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className={cn("border border-border rounded-md bg-surface flex flex-col relative", className)}
    >
      <Toolbar editor={editor} />
      <div className="flex-1 overflow-auto">
        <EditorContent editor={editor} />
      </div>
      {editor && <ImageBubbleMenu editor={editor} containerRef={containerRef} />}
    </div>
  );
}
