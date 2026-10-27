'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DocCard } from '@/components/DocCard';
import { DocsSidebar, type Scope } from '@/components/DocsSidebar';
import { readLibrary, subscribe, type Library } from '@/lib/library';
import { Button } from '@/components/ui';
import { LogoTile } from '@/components/Logo';

const EMPTY: Library = { sections: [], docs: [] };

export default function DocsPage() {
  // localStorage isn't available during the server render, so start empty and
  // fill in on mount; every mutation pushes a fresh snapshot through subscribe.
  const [lib, setLib] = useState<Library>(EMPTY);
  const [scope, setScope] = useState<Scope>('*');
  const [query, setQuery] = useState('');

  useEffect(() => {
    setLib(readLibrary());
    return subscribe(setLib);
  }, []);

  const sections = useMemo(
    () => [...lib.sections].sort((a, b) => a.name.localeCompare(b.name)),
    [lib.sections],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lib.docs
      .filter((d) => (scope === '*' ? true : d.sectionId === scope))
      .filter((d) => (q ? d.title.toLowerCase().includes(q) : true))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [lib.docs, scope, query]);

  const heading =
    scope === '*' ? 'All docs'
    : scope === null ? 'Unfiled'
    : sections.find((s) => s.id === scope)?.name ?? 'Docs';

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-white/[.07]
                         bg-ink-950/80 px-4 py-2.5 backdrop-blur-xl">
        <Link href="/" className="flex items-center gap-2.5" title="Back to AirWrite">
          <LogoTile />
          <div className="leading-none">
            <div className="text-[13.5px] font-semibold tracking-tight">AirWrite Docs</div>
            <div className="text-[10.5px] text-mute">your saved notebooks</div>
          </div>
        </Link>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search titles…"
          className="ml-2 hidden w-[220px] rounded-lg border border-white/[.08] bg-black/30 px-2.5 py-1.5
                     text-[12.5px] text-white outline-none transition focus:border-accent sm:block"
        />

        <div className="ml-auto">
          <Link href="/">
            <Button variant="primary" size="md">← Back to writing</Button>
          </Link>
        </div>
      </header>

      <main className="grid flex-1 items-start gap-3.5 p-3.5 lg:grid-cols-[230px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-[70px] lg:h-[calc(100dvh-86px)]">
          <DocsSidebar sections={sections} docs={lib.docs} scope={scope} onScope={setScope} />
        </div>

        <section className="min-w-0">
          <div className="mb-3 flex items-baseline gap-2.5 px-0.5">
            <h1 className="text-[17px] font-semibold tracking-tight">{heading}</h1>
            <span className="num text-[11.5px] text-mute">
              {visible.length} {visible.length === 1 ? 'doc' : 'docs'}
            </span>
          </div>

          {visible.length ? (
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {visible.map((doc) => (
                <DocCard key={doc.id} doc={doc} sections={sections} />
              ))}
            </div>
          ) : (
            <div className="card grid place-items-center px-6 py-16 text-center">
              <p className="text-[13.5px] font-medium">
                {query ? 'Nothing matches that.' : 'No docs here yet.'}
              </p>
              <p className="mt-1 max-w-[380px] text-[12px] leading-relaxed text-mute">
                Write a page, then hit <span className="text-mute-bright">Save to docs</span> in the
                notebook to give it a title and file it under a section.
              </p>
              <Link href="/" className="mt-4">
                <Button variant="primary" size="md">Go write something</Button>
              </Link>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
