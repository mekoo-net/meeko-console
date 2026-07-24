import { z } from 'zod';

export {
  issuedBackendCredentialsSchema,
  type IssuedBackendCredentials,
} from '@/features/platform/gateway/model/backend.types';

export const issueTavernBackendInputSchema = z.object({
  name: z.string().optional(),
});

export type IssueTavernBackendInput = z.infer<typeof issueTavernBackendInputSchema>;