import { readFileSync } from 'node:fs';
import { generateSpeech, transcribe } from 'ai';
import { describe, expect, it } from 'vitest';
import { createYoob } from '../src/index.js';

const wav = new Uint8Array(readFileSync(new URL('./speech.wav', import.meta.url)));

/** A fetch that records the request and answers with `reply`. */
function fakeFetch(reply: () => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return reply();
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

describe('offline', () => {
  it('transcription sends the file, model and options, and maps the verbose answer', async () => {
    const { fetch, calls } = fakeFetch(
      () =>
        new Response(
          JSON.stringify({
            text: 'He hoped there would be stew.',
            language: 'english',
            duration: 4,
            segments: [{ start: 0, end: 2.5, text: 'He hoped there would be stew.', caption: 'He hoped [sigh] there would be stew.', emotion: 'calm', tags: ['sigh'] }],
            speaker: { gender: 'male' },
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    );
    const yoob = createYoob({ apiKey: 'k', fetch });
    const r = await transcribe({
      model: yoob.transcription('yoob-asr-pro-v1'),
      audio: wav,
      providerOptions: { yoob: { language: 'en', emotion: true } },
    });
    expect(calls[0].url).toBe('https://tts-api.yoob.com/v1/audio/transcriptions');
    expect(new Headers(calls[0].init.headers).get('authorization')).toBe('Bearer k');
    const form = calls[0].init.body as FormData;
    expect(form.get('model')).toBe('yoob-asr-pro-v1');
    expect(form.get('response_format')).toBe('verbose_json');
    expect(form.get('language')).toBe('en');
    expect(form.get('file')).toBeInstanceOf(File);
    expect(r.text).toBe('He hoped there would be stew.');
    expect(r.language).toBe('en');
    expect(r.durationInSeconds).toBe(4);
    expect(r.segments).toEqual([{ text: 'He hoped there would be stew.', startSecond: 0, endSecond: 2.5 }]);
    expect((r.providerMetadata?.yoob as any).segments[0]).toMatchObject({ emotion: 'calm', tags: ['sigh'] });
  });

  it('speech posts JSON and returns the audio', async () => {
    const { fetch, calls } = fakeFetch(
      () => new Response(new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3]), { headers: { 'content-type': 'audio/mpeg' } }),
    );
    const yoob = createYoob({ apiKey: 'k', fetch });
    const r = await generateSpeech({
      model: yoob.speech(),
      text: '[laughing] That is so funny.',
      voice: 'w1371',
      speed: 1.1,
      instructions: 'warm, softly spoken',
      providerOptions: { yoob: { quality: 'fast', seed: 7 } },
    });
    expect(calls[0].url).toBe('https://tts-api.yoob.com/v1/audio/speech');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      model: 'yoob-tts-1',
      voice: 'w1371',
      input: '[laughing] That is so funny.',
      response_format: 'mp3',
      speed: 1.1,
      instructions: 'warm, softly spoken',
      quality: 'fast',
      seed: 7,
    });
    expect(r.audio.uint8Array.length).toBe(6);
  });

  it('API errors keep their message and code', async () => {
    const { fetch } = fakeFetch(
      () =>
        new Response(JSON.stringify({ error: { message: 'Unknown voice.', type: 'invalid_request_error', param: 'voice', code: 'invalid_voice' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const yoob = createYoob({ apiKey: 'k', fetch });
    await expect(generateSpeech({ model: yoob.speech(), text: 'Hi.', voice: 'nope' })).rejects.toThrow('Unknown voice. (invalid_voice)');
  });

  it('a missing key is reported before any request', async () => {
    const saved = process.env.YOOB_API_KEY;
    delete process.env.YOOB_API_KEY;
    try {
      const { fetch, calls } = fakeFetch(() => new Response(''));
      const yoob = createYoob({ fetch });
      await expect(transcribe({ model: yoob.transcription(), audio: wav })).rejects.toThrow(/YOOB_API_KEY/);
      expect(calls.length).toBe(0);
    } finally {
      if (saved != null) process.env.YOOB_API_KEY = saved;
    }
  });
});

describe.skipIf(!process.env.YOOB_API_KEY)('live API', () => {
  const yoob = createYoob();

  it('Turbo and Pro transcribe real speech', async () => {
    for (const id of ['yoob-asr-turbo-v1', 'yoob-asr-pro-v1']) {
      const r = await transcribe({ model: yoob.transcription(id), audio: wav, providerOptions: { yoob: { language: 'en' } } });
      expect(r.text.toLowerCase()).toContain('stew for dinner');
      expect(r.language).toBe('en');
      expect(r.segments.length).toBeGreaterThan(0);
    }
  }, 60_000);

  it('speech comes back as audio in each format', async () => {
    for (const [fmt, magic] of [['mp3', null], ['wav', 'RIFF'], ['flac', 'fLaC']] as const) {
      const r = await generateSpeech({ model: yoob.speech(), text: 'Hello there, nice to meet you.', outputFormat: fmt });
      expect(r.audio.uint8Array.length).toBeGreaterThan(5000);
      if (magic) expect(new TextDecoder().decode(r.audio.uint8Array.slice(0, 4))).toBe(magic);
    }
  }, 60_000);

  it('speech round-trips through transcription', async () => {
    const s = await generateSpeech({ model: yoob.speech(), text: 'The quick brown fox jumps over the lazy dog.', outputFormat: 'wav' });
    const t = await transcribe({ model: yoob.transcription(), audio: s.audio.uint8Array });
    expect(t.text.toLowerCase()).toContain('quick brown fox');
  }, 60_000);
});
