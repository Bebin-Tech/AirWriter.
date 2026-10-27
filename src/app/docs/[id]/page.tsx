'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogoTile } from '@/components/Logo';
import { Sheet } from '@/components/Sheet';
import { Button, Segmented, clsx } from '@/components/ui';
import {
  getDoc, renameDoc, requestOpen, setTranscript, subscribe, type Doc,
} from '@/lib/library';
import { PAGE_SIZES, pageThumbnail } from '@/lib/notebook';
import { exportPdf, exportTextPdf } from '@/lib/pdf';
import { transcribePages, type PageTranscript } from '@/lib/transcribe';

type View = 'handwriting' | 'typed';

export default function DocReaderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [doc, setDoc] = useState<Doc | null | undefined>(undefined); // undefined = still loading
  const [view, setView] = useState<View>('handwriting');
  const [draft, setDraft] = useState<PageTranscript[] | null>(null);
  const [busy, setBusy] = useState<null | 'reading' | 'exporting'>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const sync = () => setDoc(getDoc(id) ?? null);
    sync();
    const off = subscribe(sync);
    return () => { off(); abort.current?.abort(); };
  }, [id]);

  // The doc's stored transcript seeds the editable draft the first time it lands.
  useEffect(() => {
    if (doc?.transcript && !draft) setDraft(doc.transcript);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.transcript]);

  const pages = useMemo(
    () => (doc ? doc.pages.map((p) => pageThumbnail(p, doc.sizeKey, doc.paper, 1400)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc?.id, doc?.updatedAt],
  );

  if (doc === undefined) return <Shell><p className="text-[13px] text-mute">Opening…</p></Shell>;
  if (doc === null) {
    return (
      <Shell>
        <p className="text-[13.5px] font-medium">That doc isn&apos;t in your library.</p>
        <Link href="/docs" className="mt-4"><Button variant="primary" size="md">Back to docs</Button></Link>
      </Shell>
    );
  }

  const ratio = PAGE_SIZES[doc.sizeKey].w / PAGE_SIZES[doc.sizeKey].h;
  const inked = doc.pages.filter((p) => p.length).length;

  const transcribe = async () => {
    setError(null);
    setBusy('reading');
    abort.current = new AbortController();
    try {
      const result = await transcribePages(doc.pages, doc.sizeKey, abort.current.signal);
      setDraft(result);
      setTranscript(doc.id, result);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const editPage = (i: number, text: string) => {
    setDraft((prev) => {
      const next = (prev ?? []).map((p, k) => (k === i ? { ...p, text } : p));
      return next;
    });
  };

  /** Edits are committed on blur so every keystroke doesn't hit localStorage. */
  const commit = () => { if (draft) setTranscript(doc.id, draft); };

  const download = async () => {
    setError(null);
    setBusy('exporting');
    try {
      if (view === 'typed' && draft) {
        await exportTextPdf(draft, { sizeKey: doc.sizeKey, filename: `${safe(doc.title)}.pdf` });
      } else {
        await exportPdf(doc, { filename: `${safe(doc.title)}.pdf`, paper: doc.paper });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const backToEditor = () => { requestOpen(doc.id); router.push('/'); };

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-white/[.07]
                         bg-ink-950/80 px-4 py-2.5 backdrop-blur-xl">
        <Link href="/docs" className="flex items-center gap-2.5" title="All docs">
          <LogoTile />
        </Link>

        <div className="min-w-0">
          {renaming ? (
            <input
              autoFocus
              defaultValue={doc.title}
              onBlur={(e) => { renameDoc(doc.id, e.target.value); setRenaming(false); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setRenaming(false);
              }}
              className="w-[240px] rounded-md border border-accent/60 bg-black/30 px-1.5 py-1 text-[13.5px]
                         font-semibold text-white outline-none"
            />
          ) : (
            <button
              type="button" onClick={() => setRenaming(true)} title="Rename"
              className="block max-w-[280px] truncate text-left text-[13.5px] font-semibold tracking-tight
                         hover:text-accent"
            >
              {doc.title}
            </button>
          )}
          <div className="num text-[10.5px] text-mute">
            {doc.pages.length} {doc.pages.length === 1 ? 'page' : 'pages'} · {view === 'typed' ? 'typed text' : 'handwriting'}
          </div>
        </div>

        <div className="w-[220px]">
          <Segmented<View>
            value={view}
            onChange={setView}
            options={[
              { value: 'handwriting', label: 'Handwriting' },
              { value: 'typed', label: 'Typed text' },
            ]}
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button onClick={download} disabled={busy !== null || (view === 'typed' && !draft)}>
            {busy === 'exporting' ? 'Exporting…' : 'Export PDF'}
          </Button>
          <Button variant="primary" size="md" onClick={backToEditor} title="Reopen this doc in the notebook">
            ← Back to editor
          </Button>
        </div>
      </header>

      <main className="flex-1 bg-black/35 px-4 py-7">
        {error && (
          <p className="mx-auto mb-4 max-w-[820px] rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2
                        text-[12px] text-red-300">
            {error}
          </p>
        )}

        {view === 'handwriting' ? (
          <div className="mx-auto flex max-w-[820px] flex-col items-center gap-7">
            {pages.map((src, i) => (
              <figure key={i} className="w-full">
                <Sheet ratio={ratio}>
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt={`Page ${i + 1}`} className="block h-full w-full object-contain" />
                  ) : (
                    <span className="grid h-full place-items-center text-[12px] text-neutral-400">blank page</span>
                  )}
                </Sheet>
                <figcaption className="num mt-2 text-center text-[11px] text-mute">Page {i + 1}</figcaption>
              </figure>
            ))}
          </div>
        ) : draft ? (
          <div className="mx-auto flex max-w-[820px] flex-col items-center gap-7">
            <div className="flex w-full items-center gap-2 px-1">
              <p className="text-[11.5px] text-mute">
                Read by Claude{doc.transcribedAt ? ` · ${new Date(doc.transcribedAt).toLocaleString()}` : ''} · click to edit
              </p>
              <Button variant="ghost" className="ml-auto" onClick={transcribe} disabled={busy !== null}>
                {busy === 'reading' ? 'Reading…' : 'Re-read'}
              </Button>
            </div>
            {draft.map((t, i) => (
              <figure key={t.index} className="w-full">
                <Sheet ratio={ratio} padded>
                  <AutoTextarea
                    value={t.text}
                    onChange={(text) => editPage(i, text)}
                    onBlur={commit}
                    placeholder="Nothing legible on this page."
                  />
                </Sheet>
                <figcaption className="num mt-2 text-center text-[11px] text-mute">
                  Page {t.index + 1}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <div className="mx-auto max-w-[820px]">
            <Sheet ratio={ratio}>
              <div className="grid h-full place-items-center px-10 text-center">
                <div>
                  <p className="text-[15px] font-semibold text-neutral-800">Read this doc as typed text</p>
                  <p className="mx-auto mt-1.5 max-w-[380px] text-[12.5px] leading-relaxed text-neutral-500">
                    Claude reads each written page and lays it out as real text you can edit here and
                    export as a selectable, searchable PDF.
                  </p>
                  <div className="mt-5 flex justify-center gap-2">
                    <button
                      type="button" onClick={transcribe} disabled={busy !== null || !inked}
                      className={clsx(
                        'rounded-lg px-4 py-2 text-[13px] font-medium text-white transition',
                        'bg-[#232559] hover:bg-[#2e3172] disabled:opacity-40',
                      )}
                    >
                      {busy === 'reading' ? 'Reading your handwriting…' : 'Transcribe with Claude'}
                    </button>
                  </div>
                  {!inked && (
                    <p className="mt-3 text-[11.5px] text-neutral-400">This doc has no writing on it yet.</p>
                  )}
                </div>
              </div>
            </Sheet>
          </div>
        )}
      </main>
    </div>
  );
}

/** Grows with its content so a page never scrolls inside itself. */
function AutoTextarea({
  value, onChange, onBlur, placeholder,
}: { value: string; onChange: (v: string) => void; onBlur: () => void; placeholder: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      spellCheck={false}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      className="block w-full resize-none border-0 bg-transparent font-serif text-[15px] leading-[1.7]
                 text-neutral-900 outline-none placeholder:text-neutral-300"
    />
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative z-10 grid min-h-dvh place-items-center p-6 text-center">
      <div className="grid justify-items-center">{children}</div>
    </div>
  );
}

function safe(title: string) {
  return title.replace(/[^\w\-. ]+/g, '').trim() || 'airwrite';
}
