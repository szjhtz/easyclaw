import { useState, useEffect } from "react";
import { getModelsForProvider } from "@easyclaw/core";
import type { LLMProvider } from "@easyclaw/core";
import { fetchModelCatalog } from "../api.js";
import type { CatalogModelEntry } from "../api.js";

// Module-level cache so all ModelSelect instances share one fetch
let cachedCatalog: Record<string, CatalogModelEntry[]> | null = null;
let fetchPromise: Promise<Record<string, CatalogModelEntry[]>> | null = null;

function loadCatalog(): Promise<Record<string, CatalogModelEntry[]>> {
  if (cachedCatalog) return Promise.resolve(cachedCatalog);
  if (fetchPromise) return fetchPromise;
  fetchPromise = fetchModelCatalog()
    .then((catalog) => {
      cachedCatalog = catalog;
      fetchPromise = null;
      return catalog;
    })
    .catch(() => {
      fetchPromise = null;
      return {};
    });
  return fetchPromise;
}

export function ModelSelect({
  provider,
  value,
  onChange,
}: {
  provider: string;
  value: string;
  onChange: (modelId: string) => void;
}) {
  const [catalog, setCatalog] = useState<Record<string, CatalogModelEntry[]>>(
    cachedCatalog ?? {},
  );

  useEffect(() => {
    loadCatalog().then(setCatalog);
  }, []);

  // Prefer dynamic catalog from gateway; fall back to static KNOWN_MODELS
  const dynamicModels = catalog[provider];
  const models: Array<{ modelId: string; displayName: string }> = dynamicModels
    ? dynamicModels.map((m) => ({ modelId: m.id, displayName: m.name }))
    : getModelsForProvider(provider as LLMProvider).map((m) => ({
        modelId: m.modelId,
        displayName: m.displayName,
      }));

  // Ensure the current value is always in the list (e.g. a custom model ID)
  if (value && !models.some((m) => m.modelId === value)) {
    models.push({ modelId: value, displayName: value });
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: 8,
        borderRadius: 4,
        border: "1px solid #e0e0e0",
        fontSize: 13,
        backgroundColor: "#fff",
        cursor: "pointer",
      }}
    >
      {models.map((m) => (
        <option key={m.modelId} value={m.modelId}>
          {m.displayName}
        </option>
      ))}
    </select>
  );
}
