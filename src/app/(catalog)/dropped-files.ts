"use client";

/**
 * Whatever was dropped on a drop zone, as files: the files themselves, and every file inside any
 * folder dropped, however deep. A browser gives a dropped folder as one entry that has to be
 * walked; this walks it, leaves out the hidden housekeeping files a folder carries (.DS_Store,
 * Thumbs.db), and stops at a sensible number. The desktop app is the same browser engine, so a
 * folder dragged out of Finder or Explorer onto it comes through here too.
 */

const MAX_FILES = 2000;
const HIDDEN = /^(\.|thumbs\.db$|desktop\.ini$|~\$)/i;

type Entry = FileSystemEntry & { createReader?: () => FileSystemDirectoryReader; file?: (ok: (f: File) => void, bad: (e: unknown) => void) => void };

async function walk(entry: Entry, into: File[]): Promise<void> {
  if (into.length >= MAX_FILES) return;
  if (entry.isFile && entry.file) {
    if (HIDDEN.test(entry.name)) return;
    const file = await new Promise<File | null>((resolve) => entry.file!((f) => resolve(f), () => resolve(null)));
    if (file) into.push(file);
    return;
  }
  if (entry.isDirectory && entry.createReader) {
    if (HIDDEN.test(entry.name)) return;
    const reader = entry.createReader();
    // A reader hands back a folder's entries in batches; an empty batch is the end.
    for (;;) {
      const batch = await new Promise<Entry[]>((resolve) => reader.readEntries((es) => resolve(es as Entry[]), () => resolve([])));
      if (!batch.length) break;
      for (const e of batch) await walk(e, into);
      if (into.length >= MAX_FILES) break;
    }
  }
}

/** The files in a drop, folders opened. Falls back to the plain file list where the browser gives no entries. */
export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const items = Array.from(dt.items ?? []);
  const entries = items.map((i) => (typeof i.webkitGetAsEntry === "function" ? (i.webkitGetAsEntry() as Entry | null) : null));
  if (!entries.some(Boolean)) return Array.from(dt.files).filter((f) => !HIDDEN.test(f.name));
  const out: File[] = [];
  for (const e of entries) if (e) await walk(e, out);
  return out;
}

/** The files a folder picker gave (an input with webkitdirectory), without the folder's housekeeping files. */
export function filesFromPicker(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter((f) => !HIDDEN.test(f.name)).slice(0, MAX_FILES);
}

/** Whether a drag carries a folder, so a drop zone can say so. */
export function dragHasFolder(dt: DataTransfer): boolean {
  return Array.from(dt.items ?? []).some((i) => typeof i.webkitGetAsEntry === "function" && i.webkitGetAsEntry()?.isDirectory);
}
