/**
 * Provider-neutral boundary for executing a named integration tool.
 *
 * Workflow code must never import a provider SDK. It supplies a platform action;
 * the action executor resolves the configured tool name and calls this boundary.
 */
export type ToolInvocationContext = {
  organizationId: string;
  actionId: string;
  idempotencyKey: string;
  actorId?: string;
};

export type ToolInvocationResult =
  | {
      ok: true;
      value?: unknown;
      externalId?: string;
      providerMetadata?: Record<string, unknown>;
    }
  | {
      ok: false;
      error: string;
      /** True when the provider may have performed the action despite the error. */
      uncertain?: boolean;
      providerMetadata?: Record<string, unknown>;
    };

export interface ToolInvoker {
  invoke(
    toolName: string,
    input: Record<string, unknown>,
    context: ToolInvocationContext,
  ): Promise<ToolInvocationResult>;
}

/** Minimal shape exposed by the Arcade SDK, kept structural to avoid SDK coupling. */
export type ArcadeToolExecutor = {
  tools: {
    execute(request: {
      tool_name: string;
      input: Record<string, unknown>;
      user_id: string;
    }): Promise<{
      success?: boolean;
      output?: { value?: unknown; error?: unknown };
    }>;
  };
};

export type ArcadeToolInvokerOptions = {
  arcade: ArcadeToolExecutor;
  userId: string;
  /**
   * Optional provider-specific mapper. Arcade tools reject unknown inputs, so an
   * idempotency field is not injected unless the configured tool supports it.
   * The context always carries the key for logging/correlation.
   */
  mapInput?: (
    toolName: string,
    input: Record<string, unknown>,
    context: ToolInvocationContext,
  ) => Record<string, unknown>;
  extractExternalId?: (value: unknown) => string | undefined;
};

/** Adapter for direct Arcade SDK tool execution. */
export class ArcadeToolInvoker implements ToolInvoker {
  constructor(private readonly options: ArcadeToolInvokerOptions) {}

  async invoke(
    toolName: string,
    input: Record<string, unknown>,
    context: ToolInvocationContext,
  ): Promise<ToolInvocationResult> {
    try {
      const mappedInput = this.options.mapInput?.(toolName, input, context) ?? input;
      const result = await this.options.arcade.tools.execute({
        tool_name: toolName,
        input: mappedInput,
        user_id: this.options.userId,
      });
      if (!result.success) {
        return { ok: false, error: stringifyError(result.output?.error) };
      }
      return {
        ok: true,
        value: result.output?.value,
        externalId: this.options.extractExternalId?.(result.output?.value),
      };
    } catch (error) {
      // A thrown transport error is ambiguous: the remote side may have acted.
      return { ok: false, error: stringifyError(error), uncertain: true };
    }
  }
}

export type McpToolCaller = (
  toolName: string,
  input: Record<string, unknown>,
  context: ToolInvocationContext,
) => Promise<ToolInvocationResult>;

/**
 * Adapter for an MCP client/gateway. The caller function intentionally receives
 * the idempotency context because MCP client libraries expose different call
 * signatures. This keeps transport details outside platform policy.
 */
export class McpToolInvoker implements ToolInvoker {
  constructor(private readonly callTool: McpToolCaller) {}

  invoke(
    toolName: string,
    input: Record<string, unknown>,
    context: ToolInvocationContext,
  ): Promise<ToolInvocationResult> {
    return this.callTool(toolName, input, context);
  }
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error ?? "Unknown provider error");
  } catch {
    return "Unknown provider error";
  }
}
