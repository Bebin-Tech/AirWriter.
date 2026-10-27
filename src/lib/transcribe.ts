import { pageImage, type Notebook, type PageSizeKey, type Stroke } from './notebook';

export type PageTranscript = { index: number; text: string };

/**
 * Sends page PNGs to /api/transcribe and returns the text for each.
 * Images go to the server only for this call — handwriting export never leaves
 * the browser.
 */
async function post(images: string[], signal?: AbortSignal): Promise<string[]> {
  const res = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pages: images }),
    signal,
  });

  const payload = (await res.json().catch(() => ({}))) as { pages?: string[]; error?: string };
  if (!res.ok) throw new Error(payload.error ?? `Transcription failed (${res.status}).`);
  return payload.pages ?? [];
}

/** Transcribe the live notebook. */
export async function transcribeNotebook(notebook: Notebook, signal?: AbortSignal): Promise<PageTranscript[]> {
  const indices = notebook.inkedPages();
  if (!indices.length) throw new Error('Nothing written yet.');

  const images = indices.map((i) => notebook.pageImage(i)).filter((x): x is string => !!x);
  const text = await post(images, signal);
  return indices.map((index, k) => ({ index, text: text[k] ?? '' }));
}

/** Transcribe a saved doc's pages, with no Notebook instance involved. */
export async function transcribePages(
  pages: Stroke[][],
  sizeKey: PageSizeKey,
  signal?: AbortSignal,
): Promise<PageTranscript[]> {
  const indices = pages.map((p, i) => (p.length ? i : -1)).filter((i) => i >= 0);
  if (!indices.length) throw new Error('This doc has no writing on it.');

  const images = indices.map((i) => pageImage(pages[i], sizeKey)).filter((x): x is string => !!x);
  const text = await post(images, signal);
  return indices.map((index, k) => ({ index, text: text[k] ?? '' }));
}
