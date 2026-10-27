'use client';

import { useState } from 'react';
import { createSection, deleteSection, renameSection, type Doc, type Section } from '@/lib/library';
import { Button, clsx } from './ui';

/** `null` = Unfiled, `'*'` = every doc. */
export type Scope = string | null | '*';

export function DocsSidebar({
  sections, docs, scope, onScope,
}: {
  sections: Section[];
  docs: Doc[];
  scope: Scope;
  onScope: (s: Scope) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  const countIn = (id: string | null) => docs.filter((d) => d.sectionId === id).length;

  const add = () => {
    if (!name.trim()) { setAdding(false); return; }
    const s = createSection(name);
    setName('');
    setAdding(false);
    onScope(s.id);
  };

  const remove = (s: Section) => {
    const n = countIn(s.id);
    const ok = confirm(
      n ? `Delete “${s.name}”? Its ${n} ${n === 1 ? 'doc moves' : 'docs move'} to Unfiled.` : `Delete “${s.name}”?`,
    );
    if (!ok) return;
    deleteSection(s.id);
    if (scope === s.id) onScope('*');
  };

  return (
    <aside className="card flex h-full min-h-0 w-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-white/[.06] px-3.5 py-3">
        <h2 className="label">Sections</h2>
        <Button variant="ghost" onClick={() => setAdding(true)} title="New section">+</Button>
      </header>

      <nav className="scroll-thin flex-1 space-y-0.5 overflow-y-auto p-2">
        <Item
          label="All docs" count={docs.length}
          active={scope === '*'} onClick={() => onScope('*')}
        />
        <Item
          label="Unfiled" count={countIn(null)}
          active={scope === null} onClick={() => onScope(null)}
        />

        <div className="my-2 border-t border-white/[.06]" />

        {sections.map((s) =>
          editing === s.id ? (
            <input
              key={s.id}
              autoFocus
              defaultValue={s.name}
              onBlur={(e) => { renameSection(s.id, e.target.value); setEditing(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setEditing(null);
              }}
              className="w-full rounded-lg border border-accent/60 bg-black/30 px-2.5 py-1.5 text-[13px]
                         text-white outline-none"
            />
          ) : (
            <Item
              key={s.id}
              label={s.name}
              count={countIn(s.id)}
              active={scope === s.id}
              onClick={() => onScope(s.id)}
              onRename={() => setEditing(s.id)}
              onDelete={() => remove(s)}
            />
          ),
        )}

        {adding ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={add}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add();
              if (e.key === 'Escape') { setName(''); setAdding(false); }
            }}
            placeholder="AP Bio"
            className="w-full rounded-lg border border-accent/60 bg-black/30 px-2.5 py-1.5 text-[13px]
                       text-white outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="w-full rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-mute transition hover:text-white"
          >
            + New section
          </button>
        )}

        {!sections.length && !adding && (
          <p className="px-2.5 py-3 text-[11.5px] leading-relaxed text-mute">
            Make a section per class or project — AP Bio, AP Gov, Business, Content — and file docs
            into it when you save.
          </p>
        )}
      </nav>
    </aside>
  );
}

function Item({
  label, count, active, onClick, onRename, onDelete,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={clsx(
        'group flex items-center gap-1 rounded-lg pr-1 transition',
        active ? 'bg-white/[.09]' : 'hover:bg-white/[.05]',
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className={clsx(
          'flex-1 truncate px-2.5 py-1.5 text-left text-[12.5px]',
          active ? 'font-medium text-white' : 'text-mute-bright',
        )}
      >
        {label}
      </button>
      <span className="num shrink-0 text-[11px] text-mute">{count}</span>
      {onRename && (
        <span className="flex shrink-0 opacity-0 transition group-hover:opacity-100">
          <IconBtn title="Rename" onClick={onRename}>✎</IconBtn>
          <IconBtn title="Delete section" onClick={onDelete!}>✕</IconBtn>
        </span>
      )}
    </div>
  );
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" title={title} onClick={onClick}
      className="grid h-6 w-6 place-items-center rounded-md text-[11px] text-mute transition hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  );
}
