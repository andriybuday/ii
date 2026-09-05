import type { Tool } from "./types.js";
import type { ClientResponse, ModelClient, NeutralMessage } from "./clients.js";
import { AnthropicClient, AuthError } from "./clients.js";
import { defaultModel } from "./models.js";

export class Agent {
  private history: NeutralMessage[] = [];
  private readonly MAX_ITERATIONS = 50;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private pendingAuth: string | null = null;

  constructor(
    private systemPrompt: string,
    private tools: Tool[] = [],
    private client: ModelClient = new AnthropicClient(),
    private model: string = defaultModel.id,
    private apiKey: string = ""
  ) {}

  setClient(client: ModelClient, model: string, apiKey: string) {
    this.client = client;
    this.model = model;
    this.apiKey = apiKey;
    this.pendingAuth = null;
  }

  /** Provider name when the last turn failed on credentials, else null. */
  consumeAuthFailure(): string | null {
    const p = this.pendingAuth;
    this.pendingAuth = null;
    return p;
  }

  async prompt(userMessage: string, onText?: (delta: string) => void): Promise<string> {
    this.history.push({ role: "user", text: userMessage });

    for (let i = 0; i < this.MAX_ITERATIONS; i++) {
      let response: ClientResponse;
      try {
        response = await this.client.complete({
          model: this.model, key: this.apiKey, system: this.systemPrompt,
          history: this.history, tools: this.tools, maxTokens: 8096,
        });
      } catch (e) {
        if (e instanceof AuthError) this.pendingAuth = e.provider;
        const errorMsg = `API Error: ${(e as Error).message}`;
        this.history.push({ role: "assistant", text: errorMsg });
        onText?.(errorMsg);
        return errorMsg;
      }

      this.totalInputTokens += response.usage.input;
      this.totalOutputTokens += response.usage.output;
      console.error(`[tokens] input: ${response.usage.input}, output: ${response.usage.output}, total: ${this.totalInputTokens + this.totalOutputTokens}`);

      this.history.push({ role: "assistant", text: response.text, toolUses: response.toolUses });
      if (response.text) onText?.(response.text);
      if (response.stop === "end_turn") return response.text;

      const toolResults = await Promise.all(
        response.toolUses.map(async (block) => {
          const tool = this.tools.find((t) => t.name === block.name);
          if (!tool) {
            return { type: "tool_result" as const, tool_use_id: block.id, content: `Tool "${block.name}" not found`, is_error: true };
          }
          try {
            return { type: "tool_result" as const, tool_use_id: block.id, content: await tool.execute(block.input as never) };
          } catch (e) {
            return { type: "tool_result" as const, tool_use_id: block.id, content: `Tool execution error: ${(e as Error).message}`, is_error: true };
          }
        })
      );
      this.history.push({ role: "user", toolResults });
    }

    throw new Error(`Agent exceeded maximum iterations (${this.MAX_ITERATIONS}). The model may be stuck in a loop.`);
  }

  clearHistory() {
    this.history = [];
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.pendingAuth = null;
  }

  getTokenUsage() {
    return { inputTokens: this.totalInputTokens, outputTokens: this.totalOutputTokens, totalTokens: this.totalInputTokens + this.totalOutputTokens };
  }
}
