import type { RateBody } from '@demux/common';

/**
 * 与后端 RateJsonScaler 同语义：只缩放价格字段，size / quality / min|maxSeconds 原样。
 * 渠道定价预览 = 价格表 × 渠道倍率，走这一份，不要前端另写一套乘法。
 */
export function scaleRateBody(body: RateBody, factor: number): RateBody {
  const mul = (v: number | undefined): number | undefined =>
    v == null ? undefined : Math.round(v * factor * 1e6) / 1e6;
  const strip = <T extends object>(o: T): T =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

  switch (body.billingType) {
    case 'per_token':
      return {
        billingType: 'per_token',
        rate: {
          input: strip({
            perMToken: mul(body.rate.input.perMToken)!,
            cachedRead: mul(body.rate.input.cachedRead),
            cachedWrite: mul(body.rate.input.cachedWrite),
            audio: mul(body.rate.input.audio),
          }),
          output: strip({
            perMToken: mul(body.rate.output.perMToken)!,
            reasoning: mul(body.rate.output.reasoning),
            audio: mul(body.rate.output.audio),
          }),
        },
      };
    case 'per_call':
      return {
        billingType: 'per_call',
        rate: strip({ pricePerCall: mul(body.rate.pricePerCall)! }),
      };
    case 'per_image':
      return {
        billingType: 'per_image',
        rate: { tiers: body.rate.tiers.map((t) => ({ ...t, pricePerImage: mul(t.pricePerImage)! })) },
      };
    case 'per_video':
      return {
        billingType: 'per_video',
        rate: {
          ...body.rate,
          tiers: body.rate.tiers.map((t) => ({ ...t, pricePerSecond: mul(t.pricePerSecond)! })),
        },
      };
    case 'per_audio_minute':
      return {
        billingType: 'per_audio_minute',
        rate: { pricePerMinute: mul(body.rate.pricePerMinute)! },
      };
    case 'per_character':
      return {
        billingType: 'per_character',
        rate: { pricePerKChar: mul(body.rate.pricePerKChar)! },
      };
  }
}
