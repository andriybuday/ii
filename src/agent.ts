import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "./types.js";

const MODEL = process.env.II_MODEL || "claude-sonnet-4-5";

// Some API keys are identity-linked (tied to a person across multiple workspaces) rather
// than workspace-scoped, and the API rejects requests from them unless told which
// workspace to act in. The SDK only attaches `anthropic-workspace-id` automatically for
// its OAuth/federation credential chain, not for plain API-key auth, so we forward it
// ourselves when set.
const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;

export class Agent {
  private history: Anthropic.MessageParam[] = [];
  private client = new Anthropic(
    workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {}
  );
  private readonly MAX_ITERATIONS = 50;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;

  constructor(
    private systemPrompt: string,
    private tools: Tool[] = []
  ) {}

  async prompt(
    userMessage: string,
    onText?: (delta: string) => void
  ): Promise<string> {
    this.history.push({ role: "user", content: userMessage });

    for (let i = 0; i < this.MAX_ITERATIONS; i++) {
      let response: Anthropic.Message;
      try {
        response = await this.client.messages.create({
          model: MODEL,
          max_tokens: 8096,
          system: this.systemPrompt,
          messages: this.history,
          tools: this.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
          })),
        });
      } catch (e) {
        const errorMsg = `API Error: ${(e as Error).message}`;
        this.history.push({ role: "assistant", content: errorMsg });
        onText?.(errorMsg);
        return errorMsg;
      }

      // Track token usage
      if (response.usage) {
        this.totalInputTokens += response.usage.input_tokens;
        this.totalOutputTokens += response.usage.output_tokens;
        console.error(`[tokens] input: ${response.usage.input_tokens}, output: ${response.usage.output_tokens}, total: ${this.totalInputTokens + this.totalOutputTokens}`);
      }

      this.history.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "end_turn") {
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        onText?.(text);
        return text;
      }

      if (response.stop_reason === "tool_use") {
        const toolUseBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
        );

        // Emit any text alongside tool calls
        const textSoFar = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        if (textSoFar) onText?.(textSoFar);

        const toolResults = await Promise.all(
          toolUseBlocks.map(async (block) => {
            const tool = this.tools.find((t) => t.name === block.name);
            if (!tool) {
              return {
                type: "tool_result" as const,
                tool_use_id: block.id,
                content: `Tool "${block.name}" not found`,
                is_error: true,
              };
            }
            try {
              const result = await tool.execute(block.input as never);
              return {
                type: "tool_result" as const,
                tool_use_id: block.id,
                content: result,
              };
            } catch (e) {
              return {
                type: "tool_result" as const,
                tool_use_id: block.id,
                content: `Tool execution error: ${(e as Error).message}`,
                is_error: true,
              };
            }
          })
        );

        this.history.push({ role: "user", content: toolResults });
      }
    }

    throw new Error(`Agent exceeded maximum iterations (${this.MAX_ITERATIONS}). The model may be stuck in a loop.`);
  }

  clearHistory() {
    this.history = [];
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
  }

  getTokenUsage() {
    return {
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      totalTokens: this.totalInputTokens + this.totalOutputTokens,
    };
  }
}
