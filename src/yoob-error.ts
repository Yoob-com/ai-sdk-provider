import { z } from 'zod/v4';
import { createJsonErrorResponseHandler, lazySchema, zodSchema } from '@ai-sdk/provider-utils';

/** Yoob errors are OpenAI-shaped: {"error": {"message", "type", "param", "code"}}. */
export const yoobErrorDataSchema = lazySchema(() =>
  zodSchema(
    z.object({
      error: z
        .object({
          message: z.string(),
          type: z.string().nullish(),
          param: z.string().nullish(),
          code: z.string().nullish(),
          status: z.number().nullish(),
        })
        .loose(),
    }),
  ),
);

export const yoobFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: yoobErrorDataSchema,
  errorToMessage: data =>
    data.error.code != null ? `${data.error.message} (${data.error.code})` : data.error.message,
});
