'use client';

import { useEffect, useState } from 'react';
import { useAirNotebook } from '@/hooks/useAirNotebook';
import { PaperCamera, SideCamera } from '@/components/CameraStage';
import { ControlPanel } from '@/components/ControlPanel';
import { PagePreview } from '@/components/PagePreview';
import { TopBar } from '@/components/TopBar';
import { ExportDialog } from '@/components/ExportDialog';
import { SaveToDocsDialog } from '@/components/SaveToDocsDialog';
import { takeOpenRequest, type Doc } from '@/lib/library';

export default function Page() {
  const nb = useAirNotebook();
  const { settings, setSettings, runtime, refs } = nb;
  const [exportOpen, setExportOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  // The library doc this notebook came from, so "Save to docs" updates it.
  const [current, setCurrent] = useState<{ id: string; title: string; sectionId: string | null } | null>(null);

  // A doc opened from /docs hands itself over through localStorage; the hook's
  // own effects have already created the notebook by the time this runs.
  useEffect(() => {
    const doc = takeOpenRequest();
    if (!doc) return;
    nb.notebookRef.current?.load(doc.pages);
    setSettings({ sizeKey: doc.sizeKey, paper: doc.paper });
    setCurrent({ id: doc.id, title: doc.title, sectionId: doc.sectionId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSaved = (doc: Doc) =>
    setCurrent({ id: doc.id, title: doc.title, sectionId: doc.sectionId });

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <TopBar runtime={runtime} onStart={nb.start} onStop={nb.stop} />

      <div className="mx-auto w-full max-w-[1800px] px-4 pt-6 sm:px-6">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="label mb-2 text-accent">Your digital writing studio</p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Make room for your ideas.</h1>
            <p className="mt-2 text-sm text-mute">From a movement of your finger to a page worth keeping.</p>
          </div>
          <span className="hidden rounded-full border border-white/10 px-3 py-1.5 text-xs text-mute-bright sm:block">Camera tracking · Vector PDF</span>
        </div>
        <section aria-label="Getting started" className="studio-intro mb-6 grid gap-5 rounded-[20px] border border-white/10 p-5 lg:grid-cols-[1fr_2fr]">
          <div>
            <p className="text-sm font-semibold text-white">A little setup. A lot of possibility.</p>
            <p className="mt-1 text-xs leading-relaxed text-mute">Your handwriting, captured in real time.</p>
          </div>
          <ol className="grid gap-4 sm:grid-cols-3">
            {[
              ['01', 'Connect your camera', 'Start cameras and choose your devices.'],
              ['02', 'Frame your paper', 'Fit the four corners to your sheet.'],
              ['03', 'Write. Save. Share.', 'Capture your ideas and export a PDF.'],
            ].map(([number, title, detail]) => (
              <li key={number} className="flex gap-3">
                <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-accent/20 bg-accent/10 text-xs text-accent">{number}</span>
                <div><p className="text-xs font-semibold text-white">{title}</p><p className="mt-1 text-[11px] leading-relaxed text-mute">{detail}</p></div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <main className="mx-auto grid w-full max-w-[1800px] flex-1 items-start gap-5 px-4 pb-6 sm:px-6
                       xl:grid-cols-[minmax(300px,0.9fr)_minmax(460px,1.35fr)_280px]">
        <div className="grid min-w-0 gap-5">
          <PaperCamera
            videoRef={refs.topVideo}
            canvasRef={refs.topOverlay}
            quad={nb.quad}
            setQuad={nb.setQuad}
            hoverRef={nb.hoverRef}
            editing={nb.editingBox}
            setEditing={nb.setEditingBox}
            onReset={nb.resetQuad}
            rotation={settings.rotation}
            onRotate={nb.rotatePage}
            device={settings.topDevice}
            devices={nb.devices}
            onDevice={(topDevice) => setSettings({ topDevice })}
            mirror={settings.topMirror}
            onMirror={(topMirror) => setSettings({ topMirror })}
            penDown={runtime.penDown}
            active={runtime.phase === 'live'}
          />
          <SideCamera
            videoRef={refs.sideVideo}
            canvasRef={refs.sideOverlay}
            deskY={settings.deskY}
            setDeskY={(deskY) => setSettings({ deskY })}
            draggingRef={nb.draggingDeskRef}
            onCalibrate={nb.calibrateDesk}
            hasCamera={nb.hasSideCamera}
            device={settings.sideDevice}
            devices={nb.devices}
            onDevice={(sideDevice) => setSettings({ sideDevice })}
            mirror={settings.sideMirror}
            onMirror={(sideMirror) => setSettings({ sideMirror })}
            lift={runtime.lift}
          />
        </div>

        <PagePreview
          canvasRef={refs.pageCanvas}
          pageIndex={runtime.pageIndex}
          pageCount={runtime.pageCount}
          strokeCount={runtime.strokeCount}
          penDown={runtime.penDown}
          onPrev={() => nb.goTo(runtime.pageIndex - 1)}
          onNext={() => nb.goTo(runtime.pageIndex + 1)}
          onAdd={nb.addPage}
          onUndo={nb.undo}
          onClear={nb.clearPage}
          onExport={() => setExportOpen(true)}
          onSave={() => setSaveOpen(true)}
          docTitle={current?.title ?? null}
        />

        <ControlPanel
          settings={settings}
          setSettings={setSettings}
          hasSideCamera={nb.hasSideCamera}
          onCalibrateDesk={nb.calibrateDesk}
        />
      </main>

      <footer className="mx-auto flex w-full max-w-[1800px] flex-wrap justify-between gap-2 px-6 pb-6 text-[11px] text-mute">
        <span>AirWrite Studio · A new space for your thoughts.</span>
        <span>Camera processing stays on your device. Typed transcription uses AI.</span>
      </footer>

      {exportOpen && nb.notebookRef.current && (
        <ExportDialog
          notebook={nb.notebookRef.current}
          settings={settings}
          onClose={() => setExportOpen(false)}
        />
      )}

      {saveOpen && nb.notebookRef.current && (
        <SaveToDocsDialog
          notebook={nb.notebookRef.current}
          sizeKey={settings.sizeKey}
          paper={settings.paper}
          current={current}
          onSaved={onSaved}
          onClose={() => setSaveOpen(false)}
        />
      )}
    </div>
  );
}
