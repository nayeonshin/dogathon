import type { ProposedAction, ReceiptStatus, RecordId } from "./types.js";

export interface ProviderExecutionResult {
  status: ReceiptStatus;
  externalId?: string;
  message?: string;
  details?: Record<string, import("./types.js").JsonValue>;
}

/**
 * Provider credentials and SDK clients belong behind this boundary. Workflow
 * modules only propose actions; they never receive provider credentials.
 */
export interface ActionProviderAdapter {
  readonly provider: string;
  execute(action: ProposedAction): Promise<ProviderExecutionResult>;
}

export interface ShelterRecordAdapter {
  readonly provider: "shelterluv" | "petpoint" | "24petshelter" | (string & {});
  prepareReconciliation(caseId: RecordId, organizationId: RecordId): Promise<Record<string, unknown>>;
}

export class IntegrationRegistry {
  private readonly adapters = new Map<string, ActionProviderAdapter>();

  register(adapter: ActionProviderAdapter): void {
    this.adapters.set(adapter.provider, adapter);
  }

  get(provider: string): ActionProviderAdapter | undefined {
    return this.adapters.get(provider);
  }

  has(provider: string): boolean {
    return this.adapters.has(provider);
  }
}
