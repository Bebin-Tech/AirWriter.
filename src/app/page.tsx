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

      <main className="grid flex-1 items-start gap-3.5 p-3.5
                       xl:grid-cols-[minmax(320px,0.95fr)_minmax(380px,1.15fr)_290px]">
        <div className="grid gap-3.5">
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
