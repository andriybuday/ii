// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Tool<TInput = any> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: TInput) => Promise<string>;
}
