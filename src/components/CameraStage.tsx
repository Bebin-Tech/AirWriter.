'use client';

import { type ReactNode, type RefObject, useRef } from 'react';
import { clamp, pointInQuad, type Point, type Quad } from '@/lib/geometry';
import { nearestCorner } from '@/lib/overlay';
import { Button, Select, clsx } from './ui';
import type { CameraDevice } from '@/lib/cameras';

function StageFrame({
  title, badge, device, devices, onDevice, mirror, onMirror, children, footer, allowNone,
}: {
  title: string;
  badge: ReactNode;
  device: string;
  devices: CameraDevice[];
  onDevice: (id: string) => void;
  mirror: boolean;
  onMirror: (v: boolean) => void;
  children: ReactNode;
  footer: ReactNode;
  allowNone?: boolean;
}) {
  return (
    <div className="card overflow-hidden">
      <header className="flex items-center gap-2 border-b border-white/[.06] px-3 py-2">
        <span className="label">{title}</span>
        {badge}
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-[132px]">
            <Select
              value={device}
              onChange={onDevice}
              placeholder={allowNone ? '— none —' : undefined}
              options={devices.map((d) => ({ value: d.deviceId, label: d.label }))}
            />
          </div>
          <Button variant={mirror ? 'primary' : 'outline'} onClick={() => onMirror(!mirror)} title="Mirror the image">
            <MirrorIcon />
          </Button>
        </div>
      </header>
      <div className="relative aspect-[4/3] bg-black">{children}</div>
      <footer className="flex items-center gap-2 border-t border-white/[.06] px-3 py-2">{footer}</footer>
    </div>
  );
}

/* ------------------------------------------------------ overhead / paper cam */

export function PaperCamera({
  videoRef, canvasRef, quad, setQuad, hoverRef, editing, setEditing, onReset,
  rotation, onRotate, device, devices, onDevice, mirror, onMirror, penDown,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  quad: Quad;
  setQuad: (q: Quad) => void;
  hoverRef: RefObject<number>;
  editing: boolean;
  setEditing: (v: boolean) => void;
  onReset: () => void;
  rotation: number;
  onRotate: (delta: number) => void;
  device: string;
  devices: CameraDevice[];
  onDevice: (id: string) => void;
  mirror: boolean;
  onMirror: (v: boolean) => void;
  penDown: boolean;
}) {
  const drag = useRef<{ kind: 'corner'; i: number } | { kind: 'move'; from: Point; start: Quad } | null>(null);

  const at = (e: React.PointerEvent): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  };

  const onDown = (e: React.PointerEvent) => {
    if (!editing) return;
    const p = at(e);
    const r = e.currentTarget.getBoundingClientRect();
    const i = nearestCorner(quad, p, 26 / Math.min(r.width, r.height));
    if (i >= 0) drag.current = { kind: 'corner', i };
    else if (pointInQuad(quad, p)) drag.current = { kind: 'move', from: p, start: quad.map((q) => ({ ...q })) as Quad };
    else return;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const p = at(e);
    const r = e.currentTarget.getBoundingClientRect();
    if (!drag.current) {
      hoverRef.current = editing ? nearestCorner(quad, p, 26 / Math.min(r.width, r.height)) : -1;
      return;
    }
    if (drag.current.kind === 'corner') {
      const { i } = drag.current;
      setQuad(quad.map((q, k) => (k === i ? p : q)) as Quad);
    } else {
      const { from, start } = drag.current;
      const dx = p.x - from.x;
      const dy = p.y - from.y;
      setQuad(start.map((q) => ({ x: clamp(q.x + dx), y: clamp(q.y + dy) })) as Quad);
    }
  };

  const onUp = () => { drag.current = null; };

  return (
    <StageFrame
      title="Overhead · paper"
      badge={<Badge tone={penDown ? 'live' : 'idle'}>{penDown ? 'writing' : 'tracking'}</Badge>}
      device={device} devices={devices} onDevice={onDevice} mirror={mirror} onMirror={onMirror}
      footer={
        <>
          <Button variant={editing ? 'primary' : 'outline'} onClick={() => setEditing(!editing)}>
            {editing ? 'Lock box' : 'Fit box to paper'}
          </Button>
          <Button variant="ghost" onClick={onReset}>Reset</Button>
          <Button
            onClick={() => onRotate(90)}
            title="Rotate the page mapping a quarter turn — use it if the writing comes out sideways or upside down"
          >
            <RotateIcon />
            {rotation ? `${rotation}°` : 'Rotate'}
          </Button>
          <p className="ml-auto text-[11px] text-mute">
            {editing ? 'Drag the corners onto the paper; labels show the page corner.' : 'Box locked'}
          </p>
        </>
      }
    >
      <video ref={videoRef} playsInline muted
        className={clsx('absolute inset-0 h-full w-full object-cover', mirror && 'scale-x-[-1]')} />
      <canvas
        ref={canvasRef}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onPointerLeave={() => { hoverRef.current = -1; }}
        className={clsx('absolute inset-0 h-full w-full touch-none', editing ? 'cursor-crosshair' : 'pointer-events-none')}
      />
    </StageFrame>
  );
}

/* ---------------------------------------------------------------- side cam */

export function SideCamera({
  videoRef, canvasRef, deskY, setDeskY, draggingRef, onCalibrate, hasCamera,
  device, devices, onDevice, mirror, onMirror, lift,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  deskY: number;
  setDeskY: (y: number) => void;
  draggingRef: RefObject<boolean>;
  onCalibrate: () => void;
  hasCamera: boolean;
  device: string;
  devices: CameraDevice[];
  onDevice: (id: string) => void;
  mirror: boolean;
  onMirror: (v: boolean) => void;
  lift: number | null;
}) {
  const yAt = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return clamp((e.clientY - r.top) / r.height);
  };

  return (
    <StageFrame
      title="Side · height"
      badge={
        <Badge tone={lift === null ? 'idle' : lift < 0.03 ? 'live' : 'desk'}>
          {lift === null ? 'no finger' : `lift ${lift.toFixed(3)}`}
        </Badge>
      }
      device={device} devices={devices} onDevice={onDevice} mirror={mirror} onMirror={onMirror} allowNone
      footer={
        <>
          <Button onClick={onCalibrate} disabled={!hasCamera}>Set desk line from finger</Button>
          <p className="ml-auto text-[11px] text-mute">Drag the amber line to the paper surface.</p>
        </>
      }
    >
      <video ref={videoRef} playsInline muted
        className={clsx('absolute inset-0 h-full w-full object-cover', mirror && 'scale-x-[-1]')} />
      <canvas
        ref={canvasRef}
        onPointerDown={(e) => {
          if (Math.abs(yAt(e) - deskY) > 0.07) return;
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => { if (draggingRef.current) setDeskY(yAt(e)); }}
        onPointerUp={() => { draggingRef.current = false; }}
        onPointerCancel={() => { draggingRef.current = false; }}
        className="absolute inset-0 h-full w-full cursor-ns-resize touch-none"
      />
      {!hasCamera && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink-950/80 text-center">
          <p className="text-[13px] text-mute-bright">No side camera selected</p>
          <p className="max-w-[26ch] text-[11px] leading-relaxed text-mute">
            Pick one above for height-based pen detection, or use the pinch trigger.
          </p>
        </div>
      )}
    </StageFrame>
  );
}

/* ------------------------------------------------------------------ pieces */

function Badge({ tone, children }: { tone: 'idle' | 'live' | 'desk'; children: ReactNode }) {
  const cls = {
    idle: 'border-white/10 text-mute',
    live: 'border-live/40 text-live',
    desk: 'border-desk/40 text-desk',
  }[tone];
  return (
    <span className={clsx('num rounded-full border px-2 py-[1px] text-[10px]', cls)}>{children}</span>
  );
}

function RotateIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor"
         strokeWidth="1.5" strokeLinecap="round">
      <path d="M13.5 8a5.5 5.5 0 1 1-1.9-4.16" />
      <path d="M13.5 1.5V4H11" />
    </svg>
  );
}

function MirrorIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M8 1.5v13" strokeDasharray="2 2" />
      <path d="M6 4 2.5 8 6 12z" />
      <path d="M10 4 13.5 8 10 12z" opacity=".5" />
    </svg>
  );
}
