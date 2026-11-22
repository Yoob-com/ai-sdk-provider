import type { SharedV4Warning, SpeechModelV4 } from '@ai-sdk/provider';
import {
  combineHeaders,
  createBinaryResponseHandler,
  lazySchema,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  zodSchema,
  type FetchFunction,
  type InferSchema,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { yoobFailedResponseHandler } from './yoob-error.js';

/** Expressive speech: inline tags such as [laughing], [sigh] or [whisper] ... [/whisper] are performed, not read out. */
export type YoobSpeechModelId = 'yoob-tts-1' | (string & {});

/** A built-in voice id or one of your cloned voices (GET /v1/voices). */
export type YoobSpeechVoiceId = 'w1243' | 'w1371' | (string & {});

const FORMATS = ['mp3', 'wav', 'pcm', 'flac', 'opus', 'aac'] as const;
const MEDIA_TYPES: Record<(typeof FORMATS)[number], string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  pcm: 'audio/pcm',
  flac: 'audio/flac',
  opus: 'audio/ogg',
  aac: 'audio/aac',
};

export const yoobSpeechModelOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      /** `best` (default) or `fast` for a quicker first sound. */
      quality: z.enum(['best', 'fast']).nullish(),
      /** Makes renders repeatable. */
      seed: z.union([z.number().int().nonnegative(), z.string()]).nullish(),
    }),
  ),
);

export type YoobSpeechModelOptions = InferSchema<typeof yoobSpeechModelOptionsSchema>;

export type YoobSpeechModelConfig = {
  provider: string;
  url: (path: string) => string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: { currentDate?: () => Date };
};

export class YoobSpeechModel implements SpeechModelV4 {
  readonly specificationVersion = 'v4';

  constructor(
    readonly modelId: YoobSpeechModelId,
    private readonly config: YoobSpeechModelConfig,
  ) {}

  get provider(): string {
    return this.config.provider;
  }

  async doGenerate(
    options: Parameters<SpeechModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV4['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV4Warning[] = [];
    const { text, voice = 'w1243', outputFormat = 'mp3', instructions, speed, language } = options;
    const yoobOptions = await parseProviderOptions({
      provider: 'yoob',
      providerOptions: options.providerOptions,
      schema: yoobSpeechModelOptionsSchema,
    });

    let format = outputFormat as (typeof FORMATS)[number];
    if (!(FORMATS as readonly string[]).includes(format)) {
      warnings.push({
        type: 'unsupported',
        feature: 'outputFormat',
        details: `Unsupported output format: ${outputFormat}. Using mp3 instead.`,
      });
      format = 'mp3';
    }
    if (language != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'language',
        details: 'Yoob speech reads the language from the text; the language setting is ignored.',
      });
    }

    const body: Record<string, unknown> = { model: this.modelId, voice, input: text, response_format: format };
    if (instructions != null) body.instructions = instructions;
    if (speed != null) body.speed = speed;
    if (yoobOptions?.quality != null) body.quality = yoobOptions.quality;
    if (yoobOptions?.seed != null) body.seed = yoobOptions.seed;

    const { value: audio, responseHeaders, rawValue } = await postJsonToApi({
      url: this.config.url('/audio/speech'),
      headers: combineHeaders(await resolve(this.config.headers), options.headers),
      body,
      failedResponseHandler: yoobFailedResponseHandler,
      successfulResponseHandler: createBinaryResponseHandler(),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return {
      audio,
      warnings,
      request: { body: JSON.stringify(body) },
      response: { timestamp: currentDate, modelId: this.modelId, headers: responseHeaders, body: rawValue },
      providerMetadata: { yoob: { mediaType: MEDIA_TYPES[format] } },
    };
  }
}
