/** Model registry: the models `/model` can select. Add a row for a future model. */
export interface ModelEntry {
  id: string;
  label: string;
  provider: "anthropic" | "meta";
  default: boolean;
}

export const models: ModelEntry[] = [
  { id: "claude-sonnet-4-5", label: "Anthropic Claude Sonnet (default)", provider: "anthropic", default: true },
  { id: "muse-spark-1.3", label: "Meta Muse Spark 1.3", provider: "meta", default: false },
];

export const defaultModel: ModelEntry = models.find((m) => m.default) ?? models[0];

export function findModel(id: string): ModelEntry | undefined {
  return models.find((m) => m.id === id);
}
