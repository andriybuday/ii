/**
 * Generic LLM client abstraction (Principle I extensibility): the agent loop calls
 * `ModelClient` uniformly; provider wire formats translate at the boundary.
 * Keys are passed explicitly per call — neither client ever reads the environment.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "./types.js";
import type { ProviderName } from "./config.js";

// ---------------------------------------------------------------------------
// Neutral shapes (provider-independent history and results)
// ---------------------------------------------------------------------------

export interface NeutralToolUse {
  id: string;
  name: string;
  input: unknown;
}

export interface NeutralToolResult {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type NeutralMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolUses?: NeutralToolUse[] }
  | { role: "user"; toolResults: NeutralToolResult[] };

export interface Usage {
  input: number;
  output: number;
}

export interface ClientResponse {
  text: string;
  toolUses: NeutralToolUse[];
  stop: "end_turn" | "tool_use";
  usage: Usage;
}

export interface CompleteArgs {
  model: string;
  key: string;
  system: string;
  history: NeutralMessage[];
  tools: Tool[];
  maxTokens: number;
}

/** Thrown for missing/invalid credentials so callers can re-prompt for the key. */
export class AuthError extends Error {
  readonly provider: ProviderName;
  constructor(provider: ProviderName, message: string) {
    super(message);
    this.provider = provider;
  }
}

export interface ModelClient {
  readonly provider: ProviderName;
  complete(args: CompleteArgs): Promise<ClientResponse>;
}

// ---------------------------------------------------------------------------
// Anthropic (existing behavior, moved out of agent.ts)
// ---------------------------------------------------------------------------

// Some API keys are identity-linked (tied to a person across multiple workspaces)
// rather than workspace-scoped, and the API rejects requests from them unless told
// which workspace to act in. The SDK only attaches `anthropic-workspace-id`
// automatically for its OAuth/federation credential chain, not for plain API-key
// auth, so we forward it ourselves when set.
const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;

export function toAnthropicMessages(history: NeutralMessage[]): Anthropic.MessageParam[] {
  return history.map((m) => {
    if ("toolResults" in m) {
      return {
        role: "user" as const,
        content: m.toolResults.map((r) => ({
          type: "tool_result" as const,
          tool_use_id: r.tool_use_id,
          content: r.content,
          ...(r.is_error ? { is_error: true } : {}),
        })),
      };
    }
    if (m.role === "assistant") {
      const content: Anthropic.ContentBlockParam[] = [];
      if (m.text) content.push({ type: "text", text: m.text });
      for (const u of m.toolUses ?? []) {
        content.push({
          type: "tool_use",
          id: u.id,
          name: u.name,
          input: (u.input ?? {}) as Record<string, unknown>,
        });
      }
      return { role: "assistant" as const, content };
    }
    return { role: "user" as const, content: m.text };
  });
}

export class AnthropicClient implements ModelClient {
  readonly provider: ProviderName = "anthropic";

  async complete({ model, key, system, history, tools, maxTokens }: CompleteArgs): Promise<ClientResponse> {
    const client = new Anthropic({
      apiKey: key,
      ...(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {}),
    });
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages: toAnthropicMessages(history),
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
        })),
      });
    } catch (e) {
      if ((e as { status?: number }).status === 401) {
        throw new AuthError("anthropic", "Invalid Anthropic API key — run /model to update it.");
      }
      throw e;
    }
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const toolUses: NeutralToolUse[] = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, input: b.input }));
    return {
      text,
      toolUses,
      stop: response.stop_reason === "tool_use" ? "tool_use" : "end_turn",
      usage: response.usage
        ? { input: response.usage.input_tokens, output: response.usage.output_tokens }
        : { input: 0, output: 0 },
    };
  }
}

// ---------------------------------------------------------------------------
// Meta (OpenAI-compatible Chat Completions at https://api.meta.ai/v1)
// ---------------------------------------------------------------------------

const META_BASE_URL = "https://api.meta.ai/v1";

interface OpenAIMessage {
  role: string;
  content?: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

export function toOpenAIMessages(history: NeutralMessage[]): OpenAIMessage[] {
  const out: OpenAIMessage[] = [];
  for (const m of history) {
    if ("toolResults" in m) {
      for (const r of m.toolResults) {
        out.push({ role: "tool", tool_call_id: r.tool_use_id, content: r.content });
      }
    } else if (m.role === "assistant") {
      const uses = m.toolUses ?? [];
      out.push({
        role: "assistant",
        content: m.text || (uses.length > 0 ? null : ""),
        ...(uses.length > 0
          ? {
              tool_calls: uses.map((u) => ({
                id: u.id,
                type: "function" as const,
                function: { name: u.name, arguments: JSON.stringify(u.input ?? {}) },
              })),
            }
          : {}),
      });
    } else {
      out.push({ role: "user", content: m.text });
    }
  }
  return out;
}

export function parseOpenAIResponse(json: unknown): Omit<ClientResponse, "usage"> & { usage: Usage } {
  const choice = (json as { choices?: { message?: {
    content?: string | null;
    tool_calls?: { id: string; function?: { name?: string; arguments?: string } }[];
  } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } }).choices?.[0]?.message;
  if (!choice) throw new Error("Meta API returned no choices.");
  const toolUses: NeutralToolUse[] = [];
  for (const call of choice.tool_calls ?? []) {
    let input: unknown = {};
    try {
      input = JSON.parse(call.function?.arguments ?? "{}");
    } catch {
      throw new Error(`Meta model returned a malformed tool call ("${call.function?.name ?? "?"}").`);
    }
    toolUses.push({ id: call.id, name: call.function?.name ?? "", input });
  }
  return {
    text: choice.content ?? "",
    toolUses,
    stop: toolUses.length > 0 ? "tool_use" : "end_turn",
    usage: {
      input: (json as { usage?: { prompt_tokens?: number } }).usage?.prompt_tokens ?? 0,
      output: (json as { usage?: { completion_tokens?: number } }).usage?.completion_tokens ?? 0,
    },
  };
}

export class MetaClient implements ModelClient {
  readonly provider: ProviderName = "meta";

  async complete({ model, key, system, history, tools, maxTokens }: CompleteArgs): Promise<ClientResponse> {
    if (!key) throw new AuthError("meta", "Missing Meta API key — run /model to add it.");
    let res: Response;
    try {
      res = await fetch(`${META_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: system }, ...toOpenAIMessages(history)],
          tools: tools.map((t) => ({
            type: "function",
            function: { name: t.name, description: t.description, parameters: t.inputSchema },
          })),
          tool_choice: "auto",
          max_tokens: maxTokens,
        }),
      });
    } catch (e) {
      throw new Error(`Meta API network error: ${(e as Error).message}`);
    }
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new AuthError("meta", "Invalid Meta API key — run /model to update it.");
      }
      const body = (await res.text()).slice(0, 500);
      throw new Error(`Meta API error ${res.status}: ${body}`);
    }
    return parseOpenAIResponse(await res.json());
  }
}
