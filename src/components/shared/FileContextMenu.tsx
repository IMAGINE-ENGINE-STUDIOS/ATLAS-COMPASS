import { ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Copy, Scissors, ClipboardPaste, Share2, Link2, Pencil, Trash2, FilePlus2 } from "lucide-react";
import { toast } from "sonner";
import {
  copyToClipboard,
  cutToClipboard,
  getClipboard,
  type FileClipboardEntry,
  type FileClipboardKind,
} from "@/lib/fileClipboard";

export interface FileLike {
  kind: FileClipboardKind;
  name: string;
  payload: unknown;
  sourceId?: string;
  sourceTable?: string;
  thumbnailUrl?: string;
}

export interface FileContextMenuProps {
  children: ReactNode;
  file?: FileLike;
  onPaste?: (entry: FileClipboardEntry) => void;
  onDuplicate?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onShare?: (file: FileLike) => void;
  onOpen?: () => void;
  extraItems?: ReactNode;
}

export default function FileContextMenu({
  children,
  file,
  onPaste,
  onDuplicate,
  onRename,
  onDelete,
  onShare,
  onOpen,
  extraItems,
}: FileContextMenuProps) {
  const handleCopy = () => {
    if (!file) return;
    copyToClipboard(file);
    toast.success(`Copied "${file.name}"`);
  };
  const handleCut = () => {
    if (!file) return;
    cutToClipboard(file);
    toast.success(`Cut "${file.name}"`);
  };
  const handlePaste = () => {
    const cb = getClipboard();
    if (!cb) {
      toast.info("Clipboard is empty");
      return;
    }
    onPaste?.(cb);
  };
  const handleLink = async () => {
    if (!file?.sourceId) {
      toast.info("No share link available yet");
      return;
    }
    const url = `${window.location.origin}/files?ref=${file.kind}:${file.sourceId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied");
    } catch {
      toast.error("Couldn't copy link");
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {onOpen && (
          <>
            <ContextMenuItem onClick={onOpen}>
              <FilePlus2 className="mr-2 h-4 w-4" /> Open
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onClick={handleCopy} disabled={!file}>
          <Copy className="mr-2 h-4 w-4" /> Copy
        </ContextMenuItem>
        <ContextMenuItem onClick={handleCut} disabled={!file}>
          <Scissors className="mr-2 h-4 w-4" /> Cut
        </ContextMenuItem>
        <ContextMenuItem onClick={handlePaste} disabled={!onPaste}>
          <ClipboardPaste className="mr-2 h-4 w-4" /> Paste
        </ContextMenuItem>
        {onDuplicate && (
          <ContextMenuItem onClick={onDuplicate}>
            <Copy className="mr-2 h-4 w-4" /> Duplicate
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => file && onShare?.(file)} disabled={!file || !onShare}>
          <Share2 className="mr-2 h-4 w-4" /> Share to user…
        </ContextMenuItem>
        <ContextMenuItem onClick={handleLink} disabled={!file}>
          <Link2 className="mr-2 h-4 w-4" /> Copy share link
        </ContextMenuItem>
        {(onRename || onDelete || extraItems) && <ContextMenuSeparator />}
        {onRename && (
          <ContextMenuItem onClick={onRename}>
            <Pencil className="mr-2 h-4 w-4" /> Rename
          </ContextMenuItem>
        )}
        {onDelete && (
          <ContextMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </ContextMenuItem>
        )}
        {extraItems}
      </ContextMenuContent>
    </ContextMenu>
  );
}