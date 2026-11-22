# Yoob provider for the Vercel AI SDK

[Yoob](https://yoob.com) speech-to-text and expressive text-to-speech for the [AI SDK](https://ai-sdk.dev).

- **Transcription:** `yoob-asr-turbo-v1` (25 languages, fastest) and `yoob-asr-pro-v1` (47 languages, most accurate). Each segment also carries emotion, sounds such as laughs and sighs, and speaker traits in `providerMetadata.yoob`.
- **Speech:** `yoob-tts-1`. Inline tags such as `[laughing]`, `[sigh]` or `[whisper] ... [/whisper]` are performed, not read out.

## Install

```bash
npm install yoob-ai-sdk-provider ai
```

Set `YOOB_API_KEY` (get a key at [app.yoob.com](https://app.yoob.com)), or pass `apiKey` to `createYoob()`.

## Transcribe

```ts
import { transcribe } from 'ai';
import { yoob } from 'yoob-ai-sdk-provider';
import { readFile } from 'node:fs/promises';

const result = await transcribe({
  model: yoob.transcription('yoob-asr-pro-v1'),
  audio: await readFile('call.mp3'),
  providerOptions: { yoob: { language: 'en' } },
});

console.log(result.text);
console.log(result.providerMetadata?.yoob.segments); // emotion and sound tags per segment
```

Provider options (`providerOptions.yoob`): `language` (a code such as `de`, a regional tag such as `de-DE`, or an English name), `vocabulary` (words and names to favour, comma separated), `emotion` (default `true`).

## Speak

```ts
import { generateSpeech } from 'ai';
import { yoob } from 'yoob-ai-sdk-provider';

const { audio } = await generateSpeech({
  model: yoob.speech(),
  text: "[laughing] Oh, that's brilliant. [whisper] Don't tell anyone. [/whisper]",
  voice: 'w1243',
  outputFormat: 'mp3', // mp3, wav, pcm, flac, opus, aac
  instructions: 'warm, softly spoken',
});
```

Provider options: `quality` (`best`, default, or `fast` for a quicker first sound) and `seed` (repeatable renders). Voices: `GET https://tts-api.yoob.com/v1/voices`, including your cloned voices.

## Settings

`createYoob({ apiKey, baseURL, headers, fetch })`. `baseURL` defaults to `https://tts-api.yoob.com/v1`.

## Tests

```bash
npm test                      # offline tests
YOOB_API_KEY=... npm test     # plus the live API tests
```

Tested with `ai` 7.0.179.
