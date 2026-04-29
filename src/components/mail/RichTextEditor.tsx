import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Bold, Italic, Strikethrough, Code, List, ListOrdered, Quote,
  Heading1, Heading2, Heading3, Link as LinkIcon, Image as ImageIcon,
  Undo2, Redo2, Minus, CodeSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    className={cn("h-8 w-8 p-0", active && "bg-accent text-accent-foreground")}
  >
    {children}
  </Button>
);

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  const setLink = () => {
    const prev = editor.getAttributes("link").href;
    const url = window.prompt("URL", prev || "https://");
    if (url === null) return;
    if (url === "") return editor.chain().focus().extendMarkRange("link").unsetLink().run();
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };
  const insertImage = () => {
    const url = window.prompt("Kép URL");
    if (url) editor.chain().focus().setImage({ src: url }).run();
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
        onClick={() => {
          if (editor.isActive("bulletList")) {
            editor.chain().focus().toggleBulletList().run();
          } else if (!editor.chain().focus().toggleBulletList().run()) {
            editor.chain().focus().clearNodes().toggleBulletList().run();
          }
        }}
      ><List className="h-4 w-4" /></ToolbarBtn>
      <ToolbarBtn
        title="Számozott lista"
        active={editor.isActive("orderedList")}
        onClick={() => {
          if (editor.isActive("orderedList")) {
            editor.chain().focus().toggleOrderedList().run();
          } else if (!editor.chain().focus().toggleOrderedList().run()) {
            editor.chain().focus().clearNodes().toggleOrderedList().run();
          }
        }}
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
      <ToolbarBtn title="Link" active={editor.isActive("link")} onClick={setLink}><LinkIcon className="h-4 w-4" /></ToolbarBtn>
      <ToolbarBtn title="Kép beszúrása" onClick={insertImage}><ImageIcon className="h-4 w-4" /></ToolbarBtn>
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
      Image.configure({ inline: false, allowBase64: true }),
      Typography,
      Placeholder.configure({ placeholder: placeholder || "Írj ide…" }),
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

  return (
    <div className={cn("border border-border rounded-md bg-surface flex flex-col", className)}>
      <Toolbar editor={editor} />
      <div className="flex-1 overflow-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
