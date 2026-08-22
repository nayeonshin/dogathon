import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { OAuthStorage } from "@mastra/mcp";

/** Mastra defaults to InMemoryOAuthStorage, which loses the gateway tokens the
 *  moment the process exits — and `npm run dev` runs `tsx watch`, so every file
 *  save would force a re-authorization. Mid-rehearsal that is merely annoying;
 *  on stage it is fatal. Persist to disk instead.
 *
 *  Contains OAuth tokens. Mode 0600, and it is gitignored. */
export class FileOAuthStorage implements OAuthStorage {
  private data: Record<string, string> = {};

  constructor(private path = join(process.cwd(), ".arcade-oauth.json")) {
    if (existsSync(this.path)) {
      try {
        this.data = JSON.parse(readFileSync(this.path, "utf8"));
      } catch {
        this.data = {}; // corrupt file just means re-authorizing, not crashing
      }
    }
  }

  private flush() {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.data, null, 2), { mode: 0o600 });
  }

  get(key: string) {
    return this.data[key];
  }

  set(key: string, value: string) {
    this.data[key] = value;
    this.flush();
  }

  delete(key: string) {
    delete this.data[key];
    this.flush();
  }
}
