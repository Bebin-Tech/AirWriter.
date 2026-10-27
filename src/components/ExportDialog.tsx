'use client';

import { useEffect, useRef, useState } from 'react';
import type { Notebook, PageSizeKey } from '@/lib/notebook';
import { exportPdf, exportTextPdf, type TypedFont } from '@/lib/pdf';
import { transcribeNotebook, type PageTranscript } from '@/lib/transcribe';
import type { Settings } from '@/hooks/useAirNotebook';
import { Button, Row, Segmented, Slider, clsx } from './ui';

type Mode = 'handwriting' | 'typed';

export function ExportDialog({
  notebook, settings, onClose,
}: {
  notebook: Notebook;
  settings: Settings;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>('handwriting');
  const [font, setFont] = useState<TypedFont>('times');
  const [fontSize, setFontSize] = useState(12);
  const [transcripts, setTranscripts] = useState<PageTranscript[] | null>(null);
  const [busy, setBusy] = useState<null | 'transcribing' | 'exporting'>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [onClose]);

  // Parent runtime updates replace onClose while cameras are running. Only
  // abort the network request when the dialog actually unmounts.
  useEffect(() => () => abort.current?.abort(), []);

  const inked = notebook.inkedPages().length;

  const transcribe = async () => {
    setError(null);
    setBusy('transcribing');
    abort.current = new AbortController();
    try {
      setTranscripts(await transcribeNotebook(notebook, abort.current.signal));
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const doExport = async () => {
    setError(null);
    setBusy('exporting');
    try {
      if (mode === 'handwriting') {
        await exportPdf(notebook, { paper: settings.paper });
      } else if (transcripts) {
        await exportTextPdf(transcripts, {
          sizeKey: settings.sizeKey as PageSizeKey,
          font,
          fontSize,
        });
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="card relative flex max-h-[86vh] w-full max-w-[620px] flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-white/[.06] px-4 py-3">
          <h2 className="text-[14px] font-semibold">Export PDF</h2>
          <span className="num text-[11px] text-mute">
            {inked} inked {inked === 1 ? 'page' : 'pages'}
          </span>
          <button onClick={onClose} className="ml-auto text-mute transition hover:text-white" aria-label="Close">✕</button>
        </header>

        <div className="scroll-thin flex-1 overflow-y-auto px-4 py-4">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <ModeCard
              active={mode === 'handwriting'}
              onClick={() => setMode('handwriting')}
              title="Your handwriting"
              body="Your strokes exactly as drawn, as vector paths. Stays in the browser."
              sample={<HandwritingSample />}
            />
            <ModeCard
              active={mode === 'typed'}
              onClick={() => setMode('typed')}
              title="Typed text"
              body="Claude reads the page and writes it out as real, selectable text."
              sample={<TypedSample />}
            />
          </div>

          {mode === 'typed' && (
            <div className="mt-4 space-y-3.5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Row label="Font">
                  <Segmented<TypedFont>
                    value={font}
                    onChange={setFont}
                    options={[
                      { value: 'times', label: 'Serif', title: 'Times' },
                      { value: 'helvetica', label: 'Sans', title: 'Helvetica' },
                      { value: 'courier', label: 'Mono', title: 'Courier' },
                    ]}
                  />
                </Row>
                <Row label="Size" hint={`${fontSize} pt`}>
                  <Slider value={fontSize} min={8} max={18} step={0.5} onChange={setFontSize} />
                </Row>
              </div>

              {!transcripts ? (
                <div className="rounded-xl border border-white/[.07] bg-black/25 p-4 text-center">
                  <p className="mb-3 text-[12px] leading-relaxed text-mute">
                    Each inked page is sent to Claude as an image and read back as text.
                    You can correct it before exporting.
                  </p>
                  <Button variant="primary" size="md" onClick={transcribe} disabled={!inked || busy !== null}>
                    {busy === 'transcribing' ? 'Reading your handwriting…' : 'Transcribe with Claude'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="label">Transcription · editable</p>
                    <Button variant="ghost" onClick={transcribe} disabled={busy !== null}>Redo</Button>
                  </div>
                  {transcripts.map((t, i) => (
                    <div key={t.index}>
                      <div className="mb-1 flex items-baseline justify-between">
                        <span className="num text-[10.5px] text-mute">page {t.index + 1}</span>
                        {!t.text.trim() && <span className="text-[10.5px] text-desk">nothing legible</span>}
                      </div>
                      <textarea
                        value={t.text}
                        spellCheck={false}
                        onChange={(e) => {
                          const text = e.target.value;
                          setTranscripts((prev) => prev!.map((p, k) => (k === i ? { ...p, text } : p)));
                        }}
                        className="scroll-thin min-h-[104px] w-full resize-y rounded-lg border border-white/[.08]
                                   bg-black/30 p-2.5 text-[12.5px] leading-relaxed text-mute-bright outline-none
                                   transition focus:border-accent focus:text-white"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
              {error}
            </p>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-white/[.06] px-4 py-3">
          <p className="text-[11px] text-mute">
            {mode === 'handwriting'
              ? 'Vector strokes · nothing leaves your machine'
              : 'Page images are sent to the Claude API'}
          </p>
          <div className="ml-auto flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary" size="md" onClick={doExport}
              disabled={busy !== null || !inked || (mode === 'typed' && !transcripts)}
            >
              {busy === 'exporting' ? 'Exporting…' : 'Export PDF'}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function ModeCard({
  active, onClick, title, body, sample,
}: { active: boolean; onClick: () => void; title: string; body: string; sample: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick}
      className={clsx(
        'rounded-xl border p-3 text-left transition',
        active
          ? 'border-accent/60 bg-accent/[.08] shadow-[0_0_0_1px_rgba(129,140,248,.35)]'
          : 'border-white/[.08] bg-white/[.02] hover:border-white/20',
      )}
    >
      <div className="mb-2 grid h-[62px] place-items-center rounded-lg bg-white">{sample}</div>
      <div className="flex items-center gap-1.5">
        <span className="text-[13px] font-semibold">{title}</span>
        {active && <span className="text-[11px] text-accent">✓</span>}
      </div>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-mute">{body}</p>
    </button>
  );
}

function HandwritingSample() {
  return (
    <svg viewBox="0 0 150 40" className="h-[42px] w-full px-3" fill="none"
         stroke="#14161c" strokeWidth="2" strokeLinecap="round">
      <path d="M12 28c4-14 7-16 9-9s3 12 6 6 4-10 7-4 3 9 6 3" />
      <path d="M48 14v16M48 14c7-3 11 3 5 6-5 2-5 0-5 0M56 30c0-6 2-8 5-8" />
      <path d="M72 30V12M72 22c5-6 10-4 10 2v6" />
      <path d="M92 30c8 0 9-10 2-10s-6 10 2 10" />
      <path d="M112 12v18M120 20c6 0 7 10 0 10-5 0-6-10 0-10" />
    </svg>
  );
}

function TypedSample() {
  return (
    <div className="w-full px-4" style={{ fontFamily: 'Times, serif' }}>
      <div className="h-[3px] w-[76%] rounded bg-neutral-800" />
      <div className="mt-[5px] h-[3px] w-[92%] rounded bg-neutral-500" />
      <div className="mt-[5px] h-[3px] w-[84%] rounded bg-neutral-500" />
      <div className="mt-[5px] h-[3px] w-[52%] rounded bg-neutral-500" />
    </div>
  );
}
