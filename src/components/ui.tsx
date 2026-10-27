'use client';

import type { ReactNode } from 'react';

export function clsx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

/* ------------------------------------------------------------------ button */

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'outline' | 'danger';
  size?: 'sm' | 'md';
  disabled?: boolean;
  title?: string;
  className?: string;
};

export function Button({
  children, onClick, variant = 'outline', size = 'sm', disabled, title, className,
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition ' +
    'disabled:opacity-40 disabled:pointer-events-none select-none whitespace-nowrap ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
  const sizes = { sm: 'h-8 px-3 text-[12.5px]', md: 'h-10 px-4 text-sm' }[size];
  const variants = {
    primary:
      'bg-accent text-ink-950 shadow-[0_4px_16px_-6px_rgba(118,228,205,.3)] hover:bg-emerald-200 active:scale-[.98]',
    outline:
      'border border-white/10 bg-white/[.03] text-mute-bright hover:bg-white/[.07] hover:text-white active:scale-[.98]',
    ghost: 'text-mute hover:text-white hover:bg-white/[.06]',
    danger: 'border border-red-500/25 bg-red-500/10 text-red-300 hover:bg-red-500/20',
  }[variant];
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick}
      className={clsx(base, sizes, variants, className)}>
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------- panel */

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-white/[.06] px-4 py-3.5 first:border-t-0">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="label">{title}</h3>
        {aside}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] text-mute-bright">{label}</span>
        {hint && <span className="num text-[11px] text-mute">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

/* ------------------------------------------------------------------ inputs */

export function Slider({
  value, min, max, step, onChange,
}: { value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range" min={min} max={max} step={step} value={value}
      style={{ ['--pct' as string]: `${pct}%` }}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

export function Segmented<T extends string>({
  value, options, onChange, full = true,
}: {
  value: T;
  options: { value: T; label: string; title?: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  full?: boolean;
}) {
  return (
    <div className={clsx('flex gap-1 rounded-xl border border-white/[.07] bg-ink-950/60 p-1', full && 'w-full')}>
      {options.map((o) => (
        <button
          key={o.value} type="button" title={o.title} disabled={o.disabled}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'flex-1 rounded-md px-2 py-1.5 text-[12px] font-medium transition disabled:opacity-35',
            value === o.value
              ? 'bg-accent/15 text-accent shadow-[0_1px_0_rgba(255,255,255,.08)_inset]'
              : 'text-mute hover:text-mute-bright',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select<T extends string>({
  value, onChange, options, placeholder,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; placeholder?: string }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full appearance-none rounded-lg border border-white/[.08] bg-black/30 px-2.5 py-1.5 pr-7
                   text-[12.5px] text-mute-bright outline-none transition hover:border-white/20
                   focus:border-accent focus:text-white"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-ink-800">{o.label}</option>
        ))}
      </select>
      <svg viewBox="0 0 12 12" className="pointer-events-none absolute right-2.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 fill-mute">
        <path d="M6 8.5 1.5 4h9z" />
      </svg>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 text-[12.5px] text-mute-bright hover:text-white"
    >
      <span>{label}</span>
      <span className={clsx(
        'relative h-[18px] w-[32px] shrink-0 rounded-full transition',
        checked ? 'bg-accent-deep' : 'bg-white/12',
      )}>
        <span className={clsx(
          'absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all',
          checked ? 'left-[16px]' : 'left-[2px]',
        )} />
      </span>
    </button>
  );
}

export function Swatches({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inks = ['#14161c', '#1d4ed8', '#b91c1c', '#047857', '#7c3aed', '#c2410c'];
  return (
    <div className="flex items-center gap-1.5">
      {inks.map((c) => (
        <button
          key={c} type="button" onClick={() => onChange(c)} title={c}
          className={clsx(
            'h-6 w-6 rounded-md border transition',
            value.toLowerCase() === c ? 'border-white scale-110' : 'border-white/15 hover:border-white/40',
          )}
          style={{ background: c }}
        />
      ))}
      <span className="ml-auto h-6 w-9 overflow-hidden rounded-md border border-white/15">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------- misc */

export function StatusDot({ tone }: { tone: 'idle' | 'busy' | 'live' | 'down' | 'error' }) {
  const color = {
    idle: 'bg-white/25', busy: 'bg-amber-400', live: 'bg-live', down: 'bg-live', error: 'bg-red-400',
  }[tone];
  return <span className={clsx('h-1.5 w-1.5 rounded-full', color, tone === 'down' && 'pulse')} />;
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: 'live' | 'desk' | 'mute' }) {
  const color = tone === 'live' ? 'text-live' : tone === 'desk' ? 'text-desk' : 'text-mute-bright';
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className={clsx('num text-[13px]', color)}>{value}</span>
      <span className="label text-[9px]">{label}</span>
    </div>
  );
}
