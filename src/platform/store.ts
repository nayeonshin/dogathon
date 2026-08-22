import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { ConflictError, NotFoundError, ValidationError } from "./errors.js";
import type {
  BaseRecord,
  CollectionName,
  EntityMap,
  IdempotentCreateResult,
  PlatformDatabase,
  ProposedAction,
} from "./types.js";

const COLLECTION_NAMES: CollectionName[] = [
  "organizations",
  "memberships",
  "animals",
  "people",
  "cases",
  "tasks",
  "appointments",
  "actions",
  "approvals",
  "receipts",
  "events",
  "reminders",
  "networkRequests",
  "capacityOffers",
  "shareGrants",
  "handoffs",
];

export function createEmptyDatabase(): PlatformDatabase {
  return {
    schemaVersion: 1,
    collections: {
      organizations: {},
      memberships: {},
      animals: {},
      people: {},
      cases: {},
      tasks: {},
      appointments: {},
      actions: {},
      approvals: {},
      receipts: {},
      events: {},
      reminders: {},
      networkRequests: {},
      capacityOffers: {},
      shareGrants: {},
      handoffs: {},
    },
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function validateBaseRecord(record: unknown, collection: CollectionName): asserts record is BaseRecord {
  if (!record || typeof record !== "object") {
    throw new ValidationError(`Invalid ${collection} record: expected an object`);
  }
  const candidate = record as Partial<BaseRecord>;
  for (const field of ["id", "organizationId", "createdAt", "updatedAt"] as const) {
    if (typeof candidate[field] !== "string" || candidate[field].trim() === "") {
      throw new ValidationError(`Invalid ${collection} record: ${field} must be a non-empty string`);
    }
  }
  if (!candidate.source || typeof candidate.source.system !== "string" || !candidate.source.system.trim()) {
    throw new ValidationError(`Invalid ${collection} record: source.system must be a non-empty string`);
  }
}

function validateDatabase(value: unknown): asserts value is PlatformDatabase {
  if (!value || typeof value !== "object") {
    throw new ValidationError("Platform data file must contain a JSON object");
  }
  const candidate = value as Partial<PlatformDatabase>;
  if (candidate.schemaVersion !== 1 || !candidate.collections || typeof candidate.collections !== "object") {
    throw new ValidationError("Unsupported or malformed platform data file", {
      expectedSchemaVersion: 1,
    });
  }
  for (const collection of COLLECTION_NAMES) {
    const records = candidate.collections[collection];
    if (!records || typeof records !== "object" || Array.isArray(records)) {
      throw new ValidationError(`Platform data file is missing collection ${collection}`);
    }
    for (const [key, record] of Object.entries(records)) {
      validateBaseRecord(record, collection);
      if (record.id !== key) {
        throw new ValidationError(`Record key does not match id in collection ${collection}`, {
          key,
          recordId: record.id,
        });
      }
    }
  }
}

export class JsonPlatformStore {
  private writeTail: Promise<void> = Promise.resolve();

  constructor(public readonly filePath: string) {
    if (!filePath.trim()) {
      throw new ValidationError("A non-empty platform store path is required");
    }
  }

  async initialize(): Promise<void> {
    await this.serializedWrite(async (database) => ({ database, result: undefined }));
  }

  async get<K extends CollectionName>(
    collection: K,
    id: string,
    organizationId: string,
  ): Promise<EntityMap[K]> {
    this.validateLookup(collection, id, organizationId);
    const database = await this.readDatabase();
    const record = database.collections[collection][id] as EntityMap[K] | undefined;
    if (!record || record.organizationId !== organizationId) {
      throw new NotFoundError(collection, id, organizationId);
    }
    return clone(record);
  }

  async list<K extends CollectionName>(
    collection: K,
    organizationId: string,
    predicate?: (record: EntityMap[K]) => boolean,
  ): Promise<EntityMap[K][]> {
    if (!organizationId.trim()) {
      throw new ValidationError("organizationId is required for every list query", { collection });
    }
    const database = await this.readDatabase();
    const records = Object.values(database.collections[collection]) as EntityMap[K][];
    return records
      .filter((record) => record.organizationId === organizationId)
      .filter((record) => (predicate ? predicate(record) : true))
      .map(clone);
  }

  async create<K extends CollectionName>(collection: K, record: EntityMap[K]): Promise<EntityMap[K]> {
    validateBaseRecord(record, collection);
    return this.serializedWrite<EntityMap[K]>(async (database) => {
      const records = database.collections[collection] as Record<string, EntityMap[K]>;
      if (records[record.id]) {
        throw new ConflictError(`${collection} record ${record.id} already exists`, {
          collection,
          id: record.id,
        });
      }
      records[record.id] = clone(record);
      return { database, result: clone(record) };
    });
  }

  async update<K extends CollectionName>(
    collection: K,
    id: string,
    organizationId: string,
    updater: (current: EntityMap[K]) => EntityMap[K],
  ): Promise<EntityMap[K]> {
    this.validateLookup(collection, id, organizationId);
    return this.serializedWrite<EntityMap[K]>(async (database) => {
      const records = database.collections[collection] as Record<string, EntityMap[K]>;
      const current = records[id];
      if (!current || current.organizationId !== organizationId) {
        throw new NotFoundError(collection, id, organizationId);
      }
      const updated = updater(clone(current));
      validateBaseRecord(updated, collection);
      if (updated.id !== id || updated.organizationId !== organizationId) {
        throw new ValidationError("An update cannot change a record id or organization scope", {
          collection,
          id,
          organizationId,
        });
      }
      records[id] = clone(updated);
      return { database, result: clone(updated) };
    });
  }

  async createActionIdempotent(action: ProposedAction): Promise<IdempotentCreateResult<ProposedAction>> {
    validateBaseRecord(action, "actions");
    if (!action.idempotencyKey.trim()) {
      throw new ValidationError("An action idempotencyKey is required");
    }
    return this.serializedWrite<IdempotentCreateResult<ProposedAction>>(async (database) => {
      const actions = database.collections.actions;
      const existing = Object.values(actions).find(
        (candidate) =>
          candidate.organizationId === action.organizationId && candidate.idempotencyKey === action.idempotencyKey,
      );
      if (existing) {
        return { database, result: { record: clone(existing), created: false } };
      }
      if (actions[action.id]) {
        throw new ConflictError(`actions record ${action.id} already exists`, { id: action.id });
      }
      actions[action.id] = clone(action);
      return { database, result: { record: clone(action), created: true } };
    });
  }

  private validateLookup(collection: CollectionName, id: string, organizationId: string): void {
    if (!id.trim() || !organizationId.trim()) {
      throw new ValidationError("Both id and organizationId are required", {
        collection,
        id,
        organizationId,
      });
    }
  }

  private async readDatabase(): Promise<PlatformDatabase> {
    try {
      const text = await readFile(this.filePath, "utf8");
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch (error) {
        throw new ValidationError("Platform data file contains invalid JSON", {
          cause: error instanceof Error ? error.message : String(error),
        });
      }
      validateDatabase(value);
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return createEmptyDatabase();
      }
      throw error;
    }
  }

  private async writeDatabase(database: PlatformDatabase): Promise<void> {
    validateDatabase(database);
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(database, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }

  private serializedWrite<T>(
    operation: (database: PlatformDatabase) => Promise<{ database: PlatformDatabase; result: T }>,
  ): Promise<T> {
    const pending = this.writeTail.then(async () => {
      const database = await this.readDatabase();
      const outcome = await operation(database);
      await this.writeDatabase(outcome.database);
      return outcome.result;
    });
    this.writeTail = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }
}
