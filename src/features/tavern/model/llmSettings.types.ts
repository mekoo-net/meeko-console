import { z } from 'zod';

import { epochMillisSchema } from '@/shared/lib/epoch';

export const llmPipelinePurposeSchema = z.enum(['chat', 'vision', 'embedding', 'ranking']);
export type LlmPipelinePurpose = z.infer<typeof llmPipelinePurposeSchema>;

export const llmPipelineAdminSchema = z.object({
  id: z.string(),
  label: z.string(),
  hint: z.string(),
  purpose: llmPipelinePurposeSchema,
  configured: z.string().nullable(),
  effective: z.string().nullable(),
  candidates: z.array(z.string()),
});

export type LlmPipelineAdmin = z.infer<typeof llmPipelineAdminSchema>;

export const llmPlatformModelOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  modalities: z.array(z.string()),
});

export type LlmPlatformModelOption = z.infer<typeof llmPlatformModelOptionSchema>;

export const llmPlatformSettingsAdminSchema = z.object({
  pipelines: z.array(llmPipelineAdminSchema),
  models: z.array(llmPlatformModelOptionSchema),
  updatedAtUtc: epochMillisSchema,
});

export type LlmPlatformSettingsAdmin = z.infer<typeof llmPlatformSettingsAdminSchema>;

export const updateLlmPlatformSettingsSchema = z.object({
  pipelines: z.record(z.string(), z.string().nullable()),
});

export type UpdateLlmPlatformSettingsInput = z.infer<typeof updateLlmPlatformSettingsSchema>;
