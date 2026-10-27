import { clsx } from './ui';

/* Brand colours, sampled from the AirWrite logo. */
export const BRAND = { navy: '#232559', amber: '#F0A22F' } as const;

/**
 * The AirWrite mark: a camera frame with a pencil drawing a stroke inside it.
 * `frame` recolours the brackets so the mark also reads on a dark surface —
 * the pencil stays brand amber either way.
 */
export function LogoMark({ className, frame = BRAND.navy }: { className?: string; frame?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <g fill="none" stroke={frame} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 21V13a5 5 0 0 1 5-5h8" />
        <path d="M43 8h8a5 5 0 0 1 5 5v8" />
        <path d="M56 43v8a5 5 0 0 1-5 5h-8" />
        <path d="M21 56h-8a5 5 0 0 1-5-5v-8" />
      </g>
      <g transform="translate(36.5 24) rotate(45) scale(.86)">
        <path d="M-5.5 -18a5.5 5.5 0 0 1 11 0V6l-5.5 11L-5.5 6Z" fill={BRAND.amber} />
        <path d="M-5.5 6h11" fill="none" stroke="#fff" strokeWidth="1.6" />
        <path d="M-2.2 -13.5h4.4v11h-4.4z" fill="#fff" />
      </g>
      <path
        d="M27 38c-3.4-1.4-6.8.2-6.2 2.4.6 2.2 5.6 2.6 10.2.9 4.6-1.7 7.8-1.6 8.6.4"
        fill="none" stroke={BRAND.amber} strokeWidth="3.4" strokeLinecap="round"
      />
      <circle cx="45.5" cy="43.5" r="4" fill={BRAND.amber} />
    </svg>
  );
}

/** The mark on its white app-icon tile — how it sits in the dark chrome. */
export function LogoTile({ className }: { className?: string }) {
  return (
    <span className={clsx(
      'grid shrink-0 place-items-center rounded-[10px] bg-white p-[3px]',
      'shadow-[0_6px_18px_-8px_rgba(35,37,89,.9)]',
      className ?? 'h-8 w-8',
    )}>
      <LogoMark className="h-full w-full" />
    </span>
  );
}

/** Tile plus wordmark — the header lockup. */
export function Logo({ tagline }: { tagline?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoTile />
      <div className="leading-none">
        <div className="text-[13.5px] font-semibold tracking-tight">AirWrite</div>
        {tagline && <div className="text-[10.5px] text-mute">{tagline}</div>}
      </div>
    </div>
  );
}
