import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "./types.js";

const MODEL = "claude-sonnet-4-5";

export class Agent {
  private history: Anthropic.MessageParam[] = [];
  private client = new Anthropic();

  constructor(
    private systemPrompt: string,
    private tools: Tool[] = []
  ) {}

  async prompt(
    userMessage: string,
    onText?: (delta: string) => void
  ): Promise<string> {
    this.history.push({ role: "user", content: userMessage });

    while (true) {
      const response = await this.client.messages.create({
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
            const result = tool
              ? await tool.execute(block.input as never)
              : `Tool "${block.name}" not found`;
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: result,
            };
          })
        );

        this.history.push({ role: "user", content: toolResults });
      }
    }
  }

  clearHistory() {
    this.history = [];
  }
}
