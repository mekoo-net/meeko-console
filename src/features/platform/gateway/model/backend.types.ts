import { z } from 'zod';

export const issueBackendInputSchema = z.object({
  name: z.string().min(1, '鍚嶇О蹇呭～'),
  scopes: z.array(z.string()).optional(),
});

export type IssueBackendInput = z.infer<typeof issueBackendInputSchema>;

export const issuedBackendCredentialsSchema = z.object({
  backendId: z.union([z.string(), z.number()]).transform(String).optional(),
  clientId: z.string(),
  clientSecret: z.string(),
});

export type IssuedBackendCredentials = z.infer<typeof issuedBackendCredentialsSchema>;