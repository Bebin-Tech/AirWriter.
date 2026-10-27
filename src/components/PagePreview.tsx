'use client';

import type { RefObject } from 'react';
import { Button, clsx } from './ui';

export function PagePreview({
  canvasRef, pageIndex, pageCount, penDown, strokeCount,
  onPrev, onNext, onAdd, onUndo, onClear, onExport, onSave, docTitle,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  pageIndex: number;
  pageCount: number;
  penDown: boolean;
  strokeCount: number;
  onPrev: () => void;
  onNext: () => void;
  onAdd: () => void;
  onUndo: () => void;
  onClear: () => void;
  onExport: () => void;
  onSave: () => void;
  /** Title of the library doc this notebook is editing, if any. */
  docTitle: string | null;
}) {
  return (
    <div className="card flex min-h-0 flex-col overflow-hidden">
      <header className="flex items-center gap-1.5 border-b border-white/[.06] px-3 py-2">
        <Button variant="ghost" onClick={onPrev} disabled={pageIndex === 0} title="Previous page">‹</Button>
        <span className="num w-[74px] text-center text-[12px] text-mute-bright">
          {pageIndex + 1} / {pageCount}
        </span>
        <Button variant="ghost" onClick={onNext} disabled={pageIndex >= pageCount - 1} title="Next page">›</Button>
        <Button onClick={onAdd}>+ Page</Button>
        {docTitle && (
          <span className="ml-2 max-w-[160px] truncate text-[12px] text-mute" title={docTitle}>
            {docTitle}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="num mr-1 text-[11px] text-mute">{strokeCount} strokes</span>
          <Button variant="ghost" onClick={onUndo} title="Undo last stroke (⌘Z)">Undo</Button>
          <Button variant="ghost" onClick={onClear}>Clear</Button>
          <Button onClick={onSave} title="Save this notebook to your docs">Save to docs</Button>
          <Button variant="primary" onClick={onExport}>Export PDF</Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center bg-black/35 p-4">
        <div className={clsx(
          'relative rounded-[3px] transition-shadow duration-300',
          penDown
            ? 'shadow-[0_0_0_1px_rgba(52,211,153,.5),0_24px_60px_-24px_rgba(52,211,153,.45)]'
            : 'shadow-[0_0_0_1px_rgba(255,255,255,.08),0_24px_60px_-28px_rgba(0,0,0,.95)]',
        )}>
          <canvas ref={canvasRef} className="block max-h-[calc(100vh-220px)] max-w-full rounded-[3px] bg-white" />
        </div>
      </div>
    </div>
  );
}
