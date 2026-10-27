'use client';

import Link from 'next/link';
import type { Runtime } from '@/hooks/useAirNotebook';
import { Logo } from './Logo';
import { Button, Stat, StatusDot, clsx } from './ui';

const TONE: Record<Runtime['phase'], 'idle' | 'busy' | 'live' | 'error'> = {
  idle: 'idle', starting: 'busy', loading: 'busy', live: 'live', error: 'error',
};

export function TopBar({ runtime, onStart, onStop }: { runtime: Runtime; onStart: () => void; onStop: () => void }) {
  const running = runtime.phase === 'live';
  const busy = runtime.phase === 'starting' || runtime.phase === 'loading';
  const tone = runtime.penDown ? 'down' : TONE[runtime.phase];

  return (
    <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-white/[.07]
                       bg-ink-950/80 px-4 py-2.5 backdrop-blur-xl">
      <Logo tagline="finger → paper → PDF" />

      <div className={clsx(
        'flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11.5px]',
        runtime.penDown ? 'border-live/40 text-live' :
        runtime.phase === 'live' ? 'border-live/25 text-live' :
        runtime.phase === 'error' ? 'border-red-400/40 text-red-300' : 'border-white/10 text-mute',
      )}>
        <StatusDot tone={tone} />
        {runtime.penDown ? 'writing' : runtime.phase}
      </div>

      <p className="hidden truncate text-[12px] text-mute lg:block">{runtime.message}</p>

      <div className="ml-auto flex items-center gap-5">
        <Stat label="fps" value={runtime.fps ? runtime.fps.toFixed(0) : '—'} />
        <Stat
          label="lift"
          value={runtime.lift === null ? '—' : runtime.lift.toFixed(3)}
          tone={runtime.lift !== null && runtime.penDown ? 'live' : 'desk'}
        />
        <Stat label="strokes" value={String(runtime.strokeCount)} />
        <Link href="/docs" title="Your saved documents">
          <Button variant="outline" size="md">Docs</Button>
        </Link>
        <Button
          variant={running ? 'outline' : 'primary'}
          size="md"
          onClick={running ? onStop : onStart}
          disabled={busy}
        >
          {busy ? 'Starting…' : running ? 'Stop' : 'Start cameras'}
        </Button>
      </div>
    </header>
  );
}
