# Shared platform security boundary

This module enforces organization scope in its public store queries and requires
explicit limited-field grants for cross-organization reads. Those controls make
the demo fail closed when callers use the platform service as intended; they are
not production tenant isolation.

Before production use, the application still needs:

- authenticated identities and server-derived organization membership;
- authorization policies for each role and operation;
- an encrypted transactional database with tenant isolation and backups;
- secrets management for provider credentials;
- immutable, independently retained audit logs;
- concurrency control across multiple processes;
- retention, deletion, incident-response, and privacy controls;
- security review and adversarial tenant-isolation testing.

The JSON store is plaintext, designed for a single process, and uses atomic file
replacement only to avoid partially written files. It is suitable for local
demonstration and tests, not concurrent production deployment. Multi-record
service operations are auditable but are not one database transaction.
