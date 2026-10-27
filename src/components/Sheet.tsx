'use client';

import { clsx } from './ui';

/**
 * One white page on the dark backdrop — the PDF-viewer look. `ratio` is the
 * page's width/height so a sheet keeps its real proportions.
 *
 * `padded` switches it to the typed-text layout: the 20 mm margin the text PDF
 * export uses (≈9.5% of the page width), and a page that is *at least* a sheet
 * tall but grows if the text runs longer — held up by a floated spacer, since a
 * percentage min-height would have nothing to resolve against.
 */
export function Sheet({
  ratio, padded, children,
}: { ratio: number; padded?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={clsx(
        'w-full rounded-[2px] bg-white',
        'shadow-[0_0_0_1px_rgba(255,255,255,.08),0_30px_70px_-32px_rgba(0,0,0,.95)]',
        padded ? 'px-[9.5%] py-[8%]' : 'overflow-hidden',
      )}
      style={padded ? undefined : { aspectRatio: ratio }}
    >
      {padded && (
        <div
          className="float-left w-0"
          // % padding resolves against the content box, so discount the sheet's
          // own 9.5% side and 8% top/bottom padding to land on a true page height.
          style={{ paddingTop: `${((1 / ratio - 0.16) / 0.81) * 100}%` }}
          aria-hidden="true"
        />
      )}
      {children}
      {padded && <div className="clear-both" />}
    </div>
  );
}
