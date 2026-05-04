// Csatolmány-lista a levél nézet alján. Mindegyik csatolmányhoz külön
// LETÖLTÉS gomb tartozik (mindig látszik), és — kép / PDF / szöveg típusú
// csatolmánynál — egy ELŐNÉZET gomb is, ami egy modális dialógusban
// jeleníti meg a tartalmat:
//   - kép → <img>
//   - PDF → <iframe> (a böngésző natív PDF-megjelenítője)
//   - szöveg/JSON/CSV → <pre> formázott
//
// A csatolmány bináris adatát base64-ben tároljuk a `MailAttachment.data`
// mezőben — ebből a böngészőben Blob URL-t (`URL.createObjectURL`) képezünk
// a megjelenítéshez és letöltéshez. A Blob URL-eket a komponens unmountkor
// felszabadítja, hogy ne maradjon memória-szivárgás.
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Download, Eye, FileText, FileImage, FileType2, File as FileIcon, Paperclip,
} from "lucide-react";
import type { MailAttachment } from "@/lib/mailBridge";
import { toast } from "sonner";

type Props = {
  attachments: MailAttachment[];
};

function humanSize(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function iconFor(ct: string) {
  if (ct.startsWith("image/")) return FileImage;
  if (ct === "application/pdf") return FileType2;
  if (ct.startsWith("text/") || ct === "application/json") return FileText;
  return FileIcon;
}

function isPreviewable(ct: string): "image" | "pdf" | "text" | null {
  if (ct.startsWith("image/")) return "image"; // svg, png, jpg, webp, gif mind ide esik
  if (ct === "application/pdf") return "pdf";
  if (ct.startsWith("text/") || ct === "application/json") return "text";
  return null;
}

/** Base64 → Uint8Array (atob alapú, böngésző-kompatibilis). */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function makeBlobUrl(att: MailAttachment): string | null {
  if (!att.data) return null;
  try {
    const blob = new Blob([base64ToBytes(att.data).buffer as ArrayBuffer], { type: att.contentType || "application/octet-stream" });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export function AttachmentList({ attachments }: Props) {
  // A csatolmányok közül azokat mutatjuk, amelyek a felhasználó számára
  // önállóan értelmezhetők. Az inline ágyazott KÉPEKET is megjelenítjük — a
  // HTML-ben már láthatók ugyan, de a user gyakran szeretné külön elmenteni
  // őket.
  //
  // Szűrési szabályok:
  //   • image/* inline kép → MINDIG mutatjuk (akkor is, ha még tölt és nincs
  //     se filename, se data — a sor maga jelzi, hogy érkezik csatolmány,
  //     a Letöltés gomb pedig disabled marad amíg a `data` meg nem jön).
  //   • egyéb inline rész (pl. multipart/related text/html, üres cid-ref) →
  //     elrejtjük: a user számára nincs önálló értelme.
  //   • nem-inline csatolmány → mutatjuk, ha van neve, mérete vagy tartalma.
  const visible = useMemo(
    () => (attachments || []).filter((a) => {
      const ct = (a.contentType || "").toLowerCase();
      if (a.inline) return ct.startsWith("image/");
      const hasName = !!(a.filename && a.filename !== "melléklet");
      const hasSize = (a.size || 0) > 0;
      const hasData = !!a.data;
      return hasName || hasSize || hasData;
    }),
    [attachments],
  );

  // Blob URL-ek cache-elése csatolmányonként, hogy ne képezzünk újat minden
  // előnézet-megnyitáskor. Unmount/lista-csere esetén felszabadítjuk őket.
  const [urls, setUrls] = useState<Record<number, string>>({});
  useEffect(() => {
    const next: Record<number, string> = {};
    visible.forEach((att, i) => {
      const u = makeBlobUrl(att);
      if (u) next[i] = u;
    });
    setUrls(next);
    return () => {
      Object.values(next).forEach((u) => {
        try { URL.revokeObjectURL(u); } catch {}
      });
    };
  }, [visible]);

  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  // Szöveges előnézet tartalma (lazy: csak megnyitáskor dekódoljuk).
  const [textPreview, setTextPreview] = useState<string>("");

  const openPreview = (i: number) => {
    const att = visible[i];
    const kind = isPreviewable(att.contentType);
    if (!kind) return;
    if (kind === "text" && att.data) {
      try {
        const bytes = base64ToBytes(att.data);
        setTextPreview(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
      } catch {
        setTextPreview("(A szöveg dekódolása sikertelen.)");
      }
    } else {
      setTextPreview("");
    }
    setPreviewIdx(i);
  };

  const download = (i: number) => {
    const att = visible[i];
    const url = urls[i];
    if (!url) {
      toast.error("A csatolmány tartalma nem érhető el", {
        description: "Lehet, hogy a levél törzse még nem töltődött le teljesen.",
      });
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = att.filename || "csatolmany";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  if (visible.length === 0) return null;

  const previewAtt = previewIdx !== null ? visible[previewIdx] : null;
  const previewKind = previewAtt ? isPreviewable(previewAtt.contentType) : null;
  const previewUrl = previewIdx !== null ? urls[previewIdx] : null;

  return (
    <div className="border-t border-border bg-surface-elevated/40 px-8 py-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
        <Paperclip className="h-3.5 w-3.5" />
        {visible.length} csatolmány
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {visible.map((att, i) => {
          const Icon = iconFor(att.contentType);
          const canPreview = !!isPreviewable(att.contentType) && !!urls[i];
          const canDownload = !!urls[i];
          return (
            <li
              key={`${att.filename}-${i}`}
              className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2"
            >
              <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div
                  className="text-sm font-medium truncate max-w-[180px]"
                  title={att.filename}
                >
                  {att.filename || "(névtelen)"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {att.contentType || "ismeretlen típus"} · {humanSize(att.size)}
                  {!att.data && (
                    <span className="text-amber-500"> · tartalom betöltés alatt</span>
                  )}
                </div>
              </div>
              {canPreview && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => openPreview(i)}
                  title="Előnézet"
                >
                  <Eye className="h-4 w-4 mr-1" /> Előnézet
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => download(i)}
                disabled={!canDownload}
                title="Letöltés"
              >
                <Download className="h-4 w-4 mr-1" /> Letöltés
              </Button>
            </li>
          );
        })}
      </ul>

      <Dialog open={previewIdx !== null} onOpenChange={(o) => !o && setPreviewIdx(null)}>
        <DialogContent className="max-w-5xl w-[90vw] h-[85vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
            <DialogTitle className="truncate text-base">
              {previewAtt?.filename || "Előnézet"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 bg-muted/30 overflow-auto">
            {previewKind === "image" && previewUrl && (
              <div className="w-full h-full flex items-center justify-center p-4">
                <img
                  src={previewUrl}
                  alt={previewAtt?.filename || ""}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            )}
            {previewKind === "pdf" && previewUrl && (
              <iframe
                src={previewUrl}
                title={previewAtt?.filename || "PDF"}
                className="w-full h-full border-0 bg-background"
              />
            )}
            {previewKind === "text" && (
              <pre className="w-full h-full overflow-auto whitespace-pre-wrap font-mono text-xs p-4 bg-background">
                {textPreview || "(üres)"}
              </pre>
            )}
          </div>
          <div className="px-4 py-3 border-t border-border flex justify-end shrink-0">
            <Button
              size="sm"
              onClick={() => previewIdx !== null && download(previewIdx)}
              disabled={!previewUrl}
            >
              <Download className="h-4 w-4 mr-1.5" /> Letöltés
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
