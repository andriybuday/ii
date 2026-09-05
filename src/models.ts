/** Model registry: the models `/model` can select. Add a row for a future model. */
export interface ModelEntry {
  id: string;
  label: string;
  provider: "anthropic" | "meta";
  default: boolean;
}

export const models: ModelEntry[] = [
  { id: "claude-sonnet-4-5", label: "Anthropic Claude Sonnet", provider: "anthropic", default: false },
  { id: "muse-spark-1.3-contributor", label: "Meta Muse Spark 1.3 Contributor (default)", provider: "meta", default: true },
];

export const defaultModel: ModelEntry = models.find((m) => m.default) ?? models[0];

export function findModel(id: string): ModelEntry | undefined {
  return models.find((m) => m.id === id);
}
