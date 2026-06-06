export interface BillingProduct {
  code: string;
  domain: string;
  displayName: string;
  metadataJson?: string | null;
  active: boolean;
  createdAtUtc: number;
  updatedAtUtc: number;
}

export interface RegisterProductInput {
  code: string;
  domain: string;
  displayName: string;
  metadataJson?: string | null;
}

export interface UpdateProductInput {
  displayName?: string;
  metadataJson?: string | null;
}
