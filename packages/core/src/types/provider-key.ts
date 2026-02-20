export type ProviderKeyAuthType = "api_key" | "oauth" | "local";

export interface ProviderKeyEntry {
  id: string;
  provider: string;
  label: string;
  model: string;
  isDefault: boolean;
  proxyBaseUrl?: string | null;
  authType?: ProviderKeyAuthType;
  /** Per-key endpoint URL. Used by local providers (e.g. Ollama) where the
   *  base URL is user-configurable rather than fixed per provider. */
  baseUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}
