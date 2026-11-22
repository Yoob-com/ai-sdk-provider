import { NoSuchModelError, type ProviderV4, type SpeechModelV4, type TranscriptionModelV4 } from '@ai-sdk/provider';
import {
  loadApiKey,
  resolveWith,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { YoobSpeechModel, type YoobSpeechModelId } from './yoob-speech-model.js';
import { YoobTranscriptionModel, type YoobTranscriptionModelId } from './yoob-transcription-model.js';
import { VERSION } from './version.js';

export interface YoobProvider extends ProviderV4 {
  /** A transcription model: `yoob-asr-turbo-v1` (default) or `yoob-asr-pro-v1`. */
  transcription(modelId?: YoobTranscriptionModelId): TranscriptionModelV4;
  /** A speech model: `yoob-tts-1`. */
  speech(modelId?: YoobSpeechModelId): SpeechModelV4;
}

export interface YoobProviderSettings {
  /** Defaults to the YOOB_API_KEY environment variable. Keys come from https://app.yoob.com. */
  apiKey?: Resolvable<string>;
  /** Defaults to https://tts-api.yoob.com/v1. */
  baseURL?: string;
  /** Extra headers for every request. */
  headers?: Record<string, string>;
  /** A custom fetch, e.g. for testing or a proxy. */
  fetch?: FetchFunction;
}

/** Create a Yoob provider instance. */
export function createYoob(options: YoobProviderSettings = {}): YoobProvider {
  const baseURL = withoutTrailingSlash(options.baseURL) ?? 'https://tts-api.yoob.com/v1';
  const headers = () =>
    resolveWith(options.apiKey, apiKey =>
      withUserAgentSuffix(
        {
          Authorization: `Bearer ${loadApiKey({ apiKey, environmentVariableName: 'YOOB_API_KEY', description: 'Yoob' })}`,
          ...options.headers,
        },
        `ai-sdk-yoob/${VERSION}`,
      ),
    );
  const url = (path: string) => `${baseURL}${path}`;

  const transcription = (modelId: YoobTranscriptionModelId = 'yoob-asr-turbo-v1') =>
    new YoobTranscriptionModel(modelId, { provider: 'yoob.transcription', url, headers, fetch: options.fetch });
  const speech = (modelId: YoobSpeechModelId = 'yoob-tts-1') =>
    new YoobSpeechModel(modelId, { provider: 'yoob.speech', url, headers, fetch: options.fetch });

  const unsupported = (modelType: 'languageModel' | 'embeddingModel' | 'imageModel') => (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType, message: `Yoob does not provide ${modelType}s` });
  };

  return {
    specificationVersion: 'v4',
    transcription,
    transcriptionModel: transcription,
    speech,
    speechModel: speech,
    languageModel: unsupported('languageModel'),
    embeddingModel: unsupported('embeddingModel'),
    imageModel: unsupported('imageModel'),
  } as unknown as YoobProvider;
}

/** The default provider: the key from YOOB_API_KEY. */
export const yoob = createYoob();
