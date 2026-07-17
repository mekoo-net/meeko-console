import { z } from 'zod';

export {
  issueBackendInputSchema,
  issuedBackendCredentialsSchema,
  type IssueBackendInput,
  type IssuedBackendCredentials,
} from '@/features/demux/model/backend.types';

export const issueTavernBackendInputSchema = z.object({
  name: z.string().optional(),
});

export type IssueTavernBackendInput = z.infer<typeof issueTavernBackendInputSchema>;
