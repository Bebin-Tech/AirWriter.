'use client';

import type { PageSizeKey, Paper, Stroke } from './notebook';
import type { PageTranscript } from './transcribe';

/**
 * The saved-document library: sections ("AP Bio", "Business", …) and the docs
 * filed under them. Everything lives in localStorage as plain JSON — the same
 * millimetre stroke arrays the notebook draws — so a saved doc can be reopened
 * in the app, re-exported as a vector PDF, or moved between sections later.
 */

export type Section = { id: string; name: string; createdAt: number };

export type Doc = {
  id: string;
  title: string;
  /** null = loose, shown under "Unfiled". */
  sectionId: string | null;
  sizeKey: PageSizeKey;
  paper: Paper;
  pages: Stroke[][];
  /** Cached Claude transcription, kept so reopening a doc doesn't re-read it. */
  transcript?: PageTranscript[];
  transcribedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type Library = { sections: Section[]; docs: Doc[] };

const KEY = 'airnb.library.v1';
/** Handoff slot: the docs page writes a doc id here, the app picks it up. */
const OPEN_KEY = 'airnb.openDoc';

const emptyLibrary = (): Library => ({ sections: [], docs: [] });

export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/* ------------------------------------------------------------ read / write */

export function readLibrary(): Library {
  if (typeof localStorage === 'undefined') return emptyLibrary();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyLibrary();
    const parsed = JSON.parse(raw) as Partial<Library>;
    return {
      sections: Array.isArray(parsed.sections) ? parsed.sections : [],
      docs: Array.isArray(parsed.docs) ? parsed.docs : [],
    };
  } catch {
    return emptyLibrary();
  }
}

function writeLibrary(lib: Library) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lib));
  } catch {
    /* quota or private mode — the in-memory copy still renders */
  }
  listeners.forEach((fn) => fn(lib));
}

/** Local subscribers plus other tabs, so two open windows stay in step. */
const listeners = new Set<(lib: Library) => void>();

export function subscribe(fn: (lib: Library) => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) fn(readLibrary()); };
  addEventListener('storage', onStorage);
  return () => { listeners.delete(fn); removeEventListener('storage', onStorage); };
}

function update(mutate: (lib: Library) => void) {
  const lib = readLibrary();
  mutate(lib);
  writeLibrary(lib);
  return lib;
}

/* ----------------------------------------------------------------- sections */

export function createSection(name: string): Section {
  const section: Section = { id: newId(), name: name.trim() || 'Untitled section', createdAt: Date.now() };
  update((lib) => { lib.sections.push(section); });
  return section;
}

export function renameSection(id: string, name: string) {
  update((lib) => {
    const s = lib.sections.find((x) => x.id === id);
    if (s) s.name = name.trim() || s.name;
  });
}

/** Deleting a section keeps its docs — they fall back to Unfiled. */
export function deleteSection(id: string) {
  update((lib) => {
    lib.sections = lib.sections.filter((s) => s.id !== id);
    for (const d of lib.docs) if (d.sectionId === id) d.sectionId = null;
  });
}

/* --------------------------------------------------------------------- docs */

export function saveDoc(input: {
  id?: string;
  title: string;
  sectionId: string | null;
  sizeKey: PageSizeKey;
  paper: Paper;
  pages: Stroke[][];
}): Doc {
  const now = Date.now();
  const pages = trimPages(input.pages);
  let saved!: Doc;
  update((lib) => {
    const existing = input.id ? lib.docs.find((d) => d.id === input.id) : undefined;
    if (existing) {
      const inkChanged = JSON.stringify(existing.pages) !== JSON.stringify(pages);
      Object.assign(existing, {
        title: input.title.trim() || existing.title,
        sectionId: input.sectionId,
        sizeKey: input.sizeKey,
        paper: input.paper,
        pages,
        updatedAt: now,
      });
      // New ink makes an old transcription wrong — drop it rather than show it.
      if (inkChanged) { delete existing.transcript; delete existing.transcribedAt; }
      saved = existing;
      return;
    }
    saved = {
      id: input.id ?? newId(),
      title: input.title.trim() || 'Untitled doc',
      sectionId: input.sectionId,
      sizeKey: input.sizeKey,
      paper: input.paper,
      pages,
      createdAt: now,
      updatedAt: now,
    };
    lib.docs.push(saved);
  });
  return saved;
}

export function renameDoc(id: string, title: string) {
  update((lib) => {
    const d = lib.docs.find((x) => x.id === id);
    if (d) { d.title = title.trim() || d.title; d.updatedAt = Date.now(); }
  });
}

export function moveDoc(id: string, sectionId: string | null) {
  update((lib) => {
    const d = lib.docs.find((x) => x.id === id);
    if (d) { d.sectionId = sectionId; d.updatedAt = Date.now(); }
  });
}

export function deleteDoc(id: string) {
  update((lib) => { lib.docs = lib.docs.filter((d) => d.id !== id); });
}

export function setTranscript(id: string, transcript: PageTranscript[]) {
  update((lib) => {
    const d = lib.docs.find((x) => x.id === id);
    if (!d) return;
    d.transcript = transcript;
    d.transcribedAt = Date.now();
  });
}

export function getDoc(id: string): Doc | undefined {
  return readLibrary().docs.find((d) => d.id === id);
}

export function docStrokeCount(doc: Doc) {
  return doc.pages.reduce((n, p) => n + p.length, 0);
}

/**
 * Drop empty trailing pages and round coordinates to 0.01 mm — well below what
 * the tracker resolves, and it roughly halves what goes into localStorage.
 */
function trimPages(pages: Stroke[][]): Stroke[][] {
  const out = pages.map((page) =>
    page
      .filter((st) => st.pts.length > 1)
      .map((st) => ({
        color: st.color,
        width: st.width,
        pts: st.pts.map((p) => ({ x: round(p.x), y: round(p.y) })),
      })),
  );
  while (out.length > 1 && !out[out.length - 1].length) out.pop();
  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ handoff */

export function requestOpen(id: string) {
  try { localStorage.setItem(OPEN_KEY, id); } catch { /* ignore */ }
}

/** Reads and clears the handoff slot, so a reload doesn't reopen the doc. */
export function takeOpenRequest(): Doc | null {
  try {
    const id = localStorage.getItem(OPEN_KEY);
    if (!id) return null;
    localStorage.removeItem(OPEN_KEY);
    return getDoc(id) ?? null;
  } catch {
    return null;
  }
}
