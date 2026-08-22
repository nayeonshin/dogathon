export class PlatformError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends PlatformError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", details);
  }
}

export class NotFoundError extends PlatformError {
  constructor(collection: string, id: string, organizationId: string) {
    super(`${collection} record ${id} was not found in organization ${organizationId}`, "NOT_FOUND", {
      collection,
      id,
      organizationId,
    });
  }
}

export class ConflictError extends PlatformError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "CONFLICT", details);
  }
}

export class OrganizationScopeError extends PlatformError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "ORGANIZATION_SCOPE_VIOLATION", details);
  }
}

export class ApprovalRequiredError extends PlatformError {
  constructor(actionId: string) {
    super(`Action ${actionId} requires an approved human decision before execution`, "APPROVAL_REQUIRED", {
      actionId,
    });
  }
}
