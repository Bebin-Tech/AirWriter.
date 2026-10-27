import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MODEL = 'claude-opus-5';

const SYSTEM = `You transcribe handwriting from a digital notebook page.

The image is a page of handwriting captured by finger-tracking, so strokes can be
shaky, letters may be malformed, and spacing is often irregular. Read it as
handwriting, not as a clean scan.

Rules:
- Output ONLY the transcribed text. No preamble, no commentary, no markdown fences.
- Preserve line and paragraph breaks as they appear on the page.
- Preserve the writer's spelling and wording. Do not correct, rephrase, or complete.
- Where a word is genuinely illegible, write [?] in its place rather than guessing.
- If the page has no writing at all, output nothing.`;

type Body = { pages?: string[] };

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server.' },
      { status: 501 },
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
  }

  const pages = body.pages ?? [];
  if (!pages.length) return NextResponse.json({ error: 'No pages supplied.' }, { status: 400 });
  if (pages.length > 40) return NextResponse.json({ error: 'Too many pages (max 40).' }, { status: 400 });

  const client = new Anthropic();

  try {
    // Pages are independent, so transcribe them concurrently.
    const texts = await Promise.all(pages.map((dataUrl) => transcribePage(client, dataUrl)));
    return NextResponse.json({ pages: texts });
  } catch (err) {
    return NextResponse.json({ error: describe(err) }, { status: statusOf(err) });
  }
}

async function transcribePage(client: Anthropic, dataUrl: string): Promise<string> {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s.exec(dataUrl);
  if (!match) throw new Error('Page image was not a base64 PNG/JPEG/WebP.');
  const [, mediaType, data] = match;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/png', data } },
          { type: 'text', text: 'Transcribe this page.' },
        ],
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error(`Transcription declined: ${response.stop_details?.explanation ?? 'no reason given'}`);
  }

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

function describe(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'ANTHROPIC_API_KEY was rejected.';
  if (err instanceof Anthropic.RateLimitError) return 'Rate limited by the API — try again in a moment.';
  if (err instanceof Anthropic.BadRequestError) return `Bad request: ${err.message}`;
  if (err instanceof Anthropic.APIError) return `API error ${err.status}: ${err.message}`;
  return err instanceof Error ? err.message : 'Transcription failed.';
}

function statusOf(err: unknown) {
  return err instanceof Anthropic.APIError && err.status ? err.status : 500;
}
