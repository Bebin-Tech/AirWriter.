'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Notebook } from '@/lib/notebook';
import { createSection, readLibrary, saveDoc, type Doc } from '@/lib/library';
import { Button, Row, clsx } from './ui';

const UNFILED = '__unfiled__';
const NEW = '__new__';

/**
 * "Save to docs" — names the current notebook and files it under a section
 * (or leaves it unfiled). Sections can be created right here so you never have
 * to leave the writing view to make one.
 */
export function SaveToDocsDialog({
  notebook, sizeKey, paper, current, onSaved, onClose,
}: {
  notebook: Notebook;
  sizeKey: Doc['sizeKey'];
  paper: Doc['paper'];
  /** The doc this notebook came from, if it was opened from the library. */
  current: { id: string; title: string; sectionId: string | null } | null;
  onSaved: (doc: Doc) => void;
  onClose: () => void;
}) {
  const sections = useMemo(() => readLibrary().sections, []);
  const [title, setTitle] = useState(() => current?.title ?? defaultTitle());
  const [choice, setChoice] = useState<string>(
    current ? current.sectionId ?? UNFILED : sections[0]?.id ?? UNFILED,
  );
  const [newName, setNewName] = useState('');
  const [asCopy, setAsCopy] = useState(false);
  const [saved, setSaved] = useState<Doc | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [onClose]);

  const strokes = notebook.strokeCount;
  const pages = notebook.inkedPages().length;
  const needsName = choice === NEW && !newName.trim();

  const save = () => {
    let sectionId: string | null = null;
    if (choice === NEW) sectionId = createSection(newName).id;
    else if (choice !== UNFILED) sectionId = choice;

    const doc = saveDoc({
      id: current && !asCopy ? current.id : undefined,
      title,
      sectionId,
      sizeKey,
      paper,
      pages: notebook.snapshot(),
    });
    setSaved(doc);
    onSaved(doc);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="card relative w-full max-w-[440px] overflow-hidden">
        <header className="flex items-center gap-3 border-b border-white/[.06] px-4 py-3">
          <h2 className="text-[14px] font-semibold">
            {saved ? 'Saved to docs' : current && !asCopy ? 'Update doc' : 'Save to docs'}
          </h2>
          <span className="num text-[11px] text-mute">
            {pages} {pages === 1 ? 'page' : 'pages'} · {strokes} strokes
          </span>
          <button onClick={onClose} className="ml-auto text-mute transition hover:text-white" aria-label="Close">✕</button>
        </header>

        {saved ? (
          <div className="px-4 py-5 text-center">
            <p className="text-[13px] text-mute-bright">
              <span className="font-semibold text-white">{saved.title}</span> is in your library.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button onClick={onClose}>Keep writing</Button>
              <Link href="/docs">
                <Button variant="primary" size="md">Open docs</Button>
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-3.5 px-4 py-4">
              <Row label="Title">
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !needsName) save(); }}
                  placeholder="Untitled doc"
                  className="w-full rounded-lg border border-white/[.08] bg-black/30 px-2.5 py-2 text-[13px]
                             text-white outline-none transition focus:border-accent"
                />
              </Row>

              <Row label="Section">
                <div className="grid gap-1.5">
                  {sections.map((s) => (
                    <Choice key={s.id} active={choice === s.id} onClick={() => setChoice(s.id)} label={s.name} />
                  ))}
                  <Choice
                    active={choice === UNFILED}
                    onClick={() => setChoice(UNFILED)}
                    label="No section"
                    hint="lands in Unfiled"
                  />
                  <Choice active={choice === NEW} onClick={() => setChoice(NEW)} label="+ New section" />
                  {choice === NEW && (
                    <input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) save(); }}
                      placeholder="AP Bio, Business, Content…"
                      className="rounded-lg border border-white/[.08] bg-black/30 px-2.5 py-2 text-[13px]
                                 text-white outline-none transition focus:border-accent"
                    />
                  )}
                </div>
              </Row>
              {current && (
                <label className="flex items-center gap-2 text-[12px] text-mute-bright">
                  <input
                    type="checkbox"
                    checked={asCopy}
                    onChange={(e) => setAsCopy(e.target.checked)}
                    className="accent-[var(--color-accent-deep)]"
                  />
                  Save as a new doc instead of updating “{current.title}”
                </label>
              )}
            </div>

            <footer className="flex items-center gap-2 border-t border-white/[.06] px-4 py-3">
              <p className="text-[11px] text-mute">Saved in this browser</p>
              <div className="ml-auto flex gap-2">
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="primary" size="md" onClick={save} disabled={!strokes || needsName}>
                  {current && !asCopy ? 'Update' : 'Save'}
                </Button>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

function Choice({
  active, onClick, label, hint,
}: { active: boolean; onClick: () => void; label: string; hint?: string }) {
  return (
    <button
      type="button" onClick={onClick}
      className={clsx(
        'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[12.5px] transition',
        active
          ? 'border-accent/60 bg-accent/[.08] text-white'
          : 'border-white/[.08] bg-white/[.02] text-mute-bright hover:border-white/20',
      )}
    >
      <span className={clsx('h-1.5 w-1.5 rounded-full', active ? 'bg-accent' : 'bg-white/20')} />
      {label}
      {hint && <span className="ml-auto text-[11px] text-mute">{hint}</span>}
    </button>
  );
}

function defaultTitle() {
  const now = new Date();
  return `Notes — ${now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}
