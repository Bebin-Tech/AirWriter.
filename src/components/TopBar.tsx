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
    <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-white/[.07]
                       bg-ink-950/95 px-4 py-4 backdrop-blur-xl sm:gap-5 sm:px-6">
      <Logo tagline="THE WRITING STUDIO" />

      <nav aria-label="Main navigation" className="ml-3 hidden items-center gap-1 md:flex">
        <Link href="/" aria-current="page" className="rounded-lg bg-accent/10 px-4 py-2 text-xs font-medium text-accent">Workspace</Link>
        <Link href="/docs" className="rounded-lg px-4 py-2 text-xs text-mute transition hover:bg-white/5 hover:text-white">My documents</Link>
      </nav>

      <div className={clsx(
        'flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11.5px]',
        runtime.penDown ? 'border-live/40 text-live' :
        runtime.phase === 'live' ? 'border-live/25 text-live' :
        runtime.phase === 'error' ? 'border-red-400/40 text-red-300' : 'border-white/10 text-mute',
      )}>
        <StatusDot tone={tone} />
        {runtime.penDown ? 'Writing' : runtime.phase === 'idle' ? 'Standby' : runtime.phase}
      </div>

      <p role="status" className="order-last w-full truncate text-[11px] text-mute">{runtime.message}</p>

      <div className="ml-auto flex items-center gap-3 sm:gap-5">
        <div className="hidden items-center gap-5 border-r border-white/10 pr-5 lg:flex">
        <Stat label="fps" value={runtime.fps ? runtime.fps.toFixed(0) : '—'} />
        <Stat
          label="lift"
          value={runtime.lift === null ? '—' : runtime.lift.toFixed(3)}
          tone={runtime.lift !== null && runtime.penDown ? 'live' : 'desk'}
        />
        <Stat label="strokes" value={String(runtime.strokeCount)} />
        </div>
        <Link href="/docs" title="Your saved documents" className="rounded-lg border border-white/10 px-3 py-2 text-xs text-mute-bright md:hidden">
          Docs
        </Link>
        <Button
          variant={running ? 'outline' : 'primary'}
          size="md"
          onClick={running || busy ? onStop : onStart}
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10 5-3v10l-5-3"/></svg>
          {busy ? 'Cancel startup' : running ? 'Stop' : 'Start cameras'}
        </Button>
      </div>
    </header>
  );
}
