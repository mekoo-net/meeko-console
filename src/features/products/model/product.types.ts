export interface BillingProduct {
  code: string;
  domain: string;
  displayName: string;
  metadataJson?: string | null;
  active: boolean;
  createdAtUtc: number;
  updatedAtUtc: number;
}

export interface DiscoveredProduct {
  code: string;
  domain: string;
  suggestedDisplayName: string;
  alreadyRegistered: boolean;
  serviceName: string;
}

export interface RegisterProductInput {
  code: string;
  displayName?: string;
}

export interface UpdateProductInput {
  displayName?: string;
  metadataJson?: string | null;
}
