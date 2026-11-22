import type { SharedV4Warning, TranscriptionModelV4 } from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  lazySchema,
  mediaTypeToExtension,
  parseProviderOptions,
  postFormDataToApi,
  resolve,
  zodSchema,
  type FetchFunction,
  type InferSchema,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { yoobFailedResponseHandler } from './yoob-error.js';

/** `yoob-asr-turbo-v1` (25 languages, fastest) or `yoob-asr-pro-v1` (47 languages, most accurate). */
export type YoobTranscriptionModelId = 'yoob-asr-turbo-v1' | 'yoob-asr-pro-v1' | (string & {});

export const yoobTranscriptionModelOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      /** Spoken language as a code (`de`), a regional tag (`de-DE`) or an English name (`german`). Sending it is the safest choice. */
      language: z.string().nullish(),
      /** Words and names to favour, comma separated. */
      vocabulary: z.string().nullish(),
      /** Emotion, sounds and speaker traits per segment (returned in providerMetadata.yoob). Default true. */
      emotion: z.boolean().nullish(),
    }),
  ),
);

export type YoobTranscriptionModelOptions = InferSchema<typeof yoobTranscriptionModelOptionsSchema>;

const yoobTranscriptionResponseSchema = lazySchema(() =>
  zodSchema(
    z
      .object({
        text: z.string(),
        language: z.string().nullish(),
        duration: z.number().nullish(),
        segments: z
          .array(
            z
              .object({
                start: z.number(),
                end: z.number(),
                text: z.string(),
                caption: z.string().nullish(),
                emotion: z.string().nullish(),
                tags: z.array(z.string()).nullish(),
              })
              .loose(),
          )
          .nullish(),
        speaker: z.record(z.string(), z.unknown()).nullish(),
      })
      .loose(),
  ),
);

/** English language names the API reports, mapped to ISO-639-1 codes where the API answers with a name. */
const LANGUAGE_CODES: Record<string, string> = {
  english: 'en', german: 'de', spanish: 'es', french: 'fr', italian: 'it', dutch: 'nl', portuguese: 'pt',
  polish: 'pl', russian: 'ru', ukrainian: 'uk', swedish: 'sv', danish: 'da', finnish: 'fi', czech: 'cs',
  slovak: 'sk', slovenian: 'sl', croatian: 'hr', bulgarian: 'bg', romanian: 'ro', hungarian: 'hu',
  greek: 'el', estonian: 'et', latvian: 'lv', lithuanian: 'lt', maltese: 'mt', arabic: 'ar', hebrew: 'he',
  hindi: 'hi', bengali: 'bn', japanese: 'ja', korean: 'ko', chinese: 'zh', thai: 'th', vietnamese: 'vi',
  indonesian: 'id', malay: 'ms', turkish: 'tr', persian: 'fa',
};

export type YoobTranscriptionModelConfig = {
  provider: string;
  url: (path: string) => string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: { currentDate?: () => Date };
};

export class YoobTranscriptionModel implements TranscriptionModelV4 {
  readonly specificationVersion = 'v4';

  constructor(
    readonly modelId: YoobTranscriptionModelId,
    private readonly config: YoobTranscriptionModelConfig,
  ) {}

  get provider(): string {
    return this.config.provider;
  }

  async doGenerate(
    options: Parameters<TranscriptionModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV4['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV4Warning[] = [];
    const yoobOptions = await parseProviderOptions({
      provider: 'yoob',
      providerOptions: options.providerOptions,
      schema: yoobTranscriptionModelOptionsSchema,
    });

    const audio =
      options.audio instanceof Uint8Array ? options.audio : convertBase64ToUint8Array(options.audio);
    const formData = new FormData();
    formData.append(
      'file',
      new File([audio as Uint8Array<ArrayBuffer>], `audio.${mediaTypeToExtension(options.mediaType)}`, {
        type: options.mediaType,
      }),
    );
    formData.append('model', this.modelId);
    formData.append('response_format', 'verbose_json');
    if (yoobOptions?.language != null) formData.append('language', yoobOptions.language);
    if (yoobOptions?.vocabulary != null) formData.append('vocabulary', yoobOptions.vocabulary);
    if (yoobOptions?.emotion != null) formData.append('emotion', String(yoobOptions.emotion));

    const { value: response, responseHeaders, rawValue } = await postFormDataToApi({
      url: this.config.url('/audio/transcriptions'),
      headers: combineHeaders(await resolve(this.config.headers), options.headers),
      formData,
      failedResponseHandler: yoobFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(yoobTranscriptionResponseSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const language = response.language ?? undefined;
    return {
      text: response.text,
      segments: (response.segments ?? []).map(s => ({ text: s.text, startSecond: s.start, endSecond: s.end })),
      language: language != null ? (LANGUAGE_CODES[language.toLowerCase()] ?? language) : undefined,
      durationInSeconds: response.duration ?? undefined,
      warnings,
      response: { timestamp: currentDate, modelId: this.modelId, headers: responseHeaders, body: rawValue },
      providerMetadata: {
        yoob: {
          segments: (response.segments ?? []).map(s => ({
            start: s.start,
            end: s.end,
            caption: s.caption ?? s.text,
            emotion: s.emotion ?? null,
            tags: s.tags ?? [],
          })),
          ...(response.speaker != null ? { speaker: response.speaker } : {}),
        } as Record<string, any>,
      },
    };
  }
}
