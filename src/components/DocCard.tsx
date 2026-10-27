'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { pageThumbnail } from '@/lib/notebook';
import { exportPdf } from '@/lib/pdf';
import {
  deleteDoc, docStrokeCount, moveDoc, renameDoc, requestOpen, type Doc, type Section,
} from '@/lib/library';
import { Button, clsx } from './ui';

export function DocCard({ doc, sections }: { doc: Doc; sections: Section[] }) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);

  // Thumbnails are canvas work, so only redo them when the doc actually changes.
  const thumb = useMemo(
    () => pageThumbnail(doc.pages[0] ?? [], doc.sizeKey, doc.paper),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc.id, doc.updatedAt],
  );

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    addEventListener('click', close);
    return () => removeEventListener('click', close);
  }, [menu]);

  const read = () => router.push(`/docs/${doc.id}`);
  const openInApp = () => { requestOpen(doc.id); router.push('/'); };

  const download = async () => {
    setBusy(true);
    try {
      await exportPdf(doc, { filename: `${safe(doc.title)}.pdf`, paper: doc.paper });
    } finally {
      setBusy(false);
    }
  };

  const strokes = docStrokeCount(doc);

  return (
    <div className="card group flex flex-col overflow-hidden transition hover:border-white/20">
      <button
        type="button" onClick={read} title="Open this doc"
        className="relative block bg-black/35 p-3"
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="mx-auto block max-h-[190px] w-auto rounded-[2px]
                                             shadow-[0_10px_30px_-16px_rgba(0,0,0,.95)]" />
        ) : (
          <div className="grid h-[190px] place-items-center text-[12px] text-mute">empty</div>
        )}
        {doc.pages.length > 1 && (
          <span className="num absolute bottom-4 right-4 rounded-md bg-black/70 px-1.5 py-0.5 text-[10.5px] text-mute-bright">
            {doc.pages.length} pages
          </span>
        )}
      </button>

      <div className="flex items-start gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              autoFocus
              defaultValue={doc.title}
              onBlur={(e) => { renameDoc(doc.id, e.target.value); setRenaming(false); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setRenaming(false);
              }}
              className="w-full rounded-md border border-accent/60 bg-black/30 px-1.5 py-1 text-[13px]
                         text-white outline-none"
            />
          ) : (
            <button
              type="button" onClick={() => setRenaming(true)} title="Rename"
              className="block max-w-full truncate text-left text-[13px] font-medium text-white hover:text-accent"
            >
              {doc.title}
            </button>
          )}
          <p className="num mt-0.5 text-[10.5px] text-mute">
            {strokes} strokes · {when(doc.updatedAt)}
            {doc.transcript && <span className="ml-1.5 text-accent">· transcribed</span>}
          </p>
        </div>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMenu((m) => !m); }}
            className="grid h-7 w-7 place-items-center rounded-md text-mute transition hover:bg-white/10 hover:text-white"
            title="More"
          >
            ⋯
          </button>
          {menu && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="card absolute right-0 top-8 z-30 w-[190px] overflow-hidden p-1 text-[12.5px]"
            >
              <MenuItem onClick={() => { setMenu(false); read(); }}>Open doc</MenuItem>
              <MenuItem onClick={() => { setMenu(false); openInApp(); }}>Edit in notebook</MenuItem>
              <MenuItem onClick={() => { setMenu(false); setRenaming(true); }}>Rename</MenuItem>
              <div className="my-1 border-t border-white/[.06]" />
              <p className="label px-2 py-1">Move to</p>
              <MenuItem active={doc.sectionId === null} onClick={() => { moveDoc(doc.id, null); setMenu(false); }}>
                Unfiled
              </MenuItem>
              {sections.map((s) => (
                <MenuItem
                  key={s.id} active={doc.sectionId === s.id}
                  onClick={() => { moveDoc(doc.id, s.id); setMenu(false); }}
                >
                  {s.name}
                </MenuItem>
              ))}
              <div className="my-1 border-t border-white/[.06]" />
              <MenuItem
                danger
                onClick={() => {
                  setMenu(false);
                  if (confirm(`Delete “${doc.title}”? This can't be undone.`)) deleteDoc(doc.id);
                }}
              >
                Delete doc
              </MenuItem>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-1.5 border-t border-white/[.06] px-3 py-2">
        <Button onClick={read} title="Read it as a page, or transcribe it">Open</Button>
        <Button variant="ghost" onClick={openInApp} title="Keep writing on it">Edit</Button>
        <Button variant="primary" onClick={download} disabled={busy || !strokes} className="ml-auto">
          {busy ? 'Exporting…' : 'Export PDF'}
        </Button>
      </div>
    </div>
  );
}

function MenuItem({
  children, onClick, active, danger,
}: { children: React.ReactNode; onClick: () => void; active?: boolean; danger?: boolean }) {
  return (
    <button
      type="button" onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-2 truncate rounded-md px-2 py-1.5 text-left transition',
        danger ? 'text-red-300 hover:bg-red-500/15' : 'text-mute-bright hover:bg-white/[.07] hover:text-white',
      )}
    >
      {active && <span className="text-accent">✓</span>}
      <span className="truncate">{children}</span>
    </button>
  );
}

function safe(title: string) {
  return title.replace(/[^\w\-. ]+/g, '').trim() || 'airwrite';
}

function when(ts: number) {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
