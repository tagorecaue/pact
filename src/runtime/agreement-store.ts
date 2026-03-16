import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import type { Agreement, FieldMapping } from "./negotiation";

/**
 * Filesystem-backed persistence for negotiation agreements.
 *
 * Layout:
 *   data/agreements/<hostname>/agreement.json        — current agreement
 *   data/agreements/<hostname>/history/<timestamp>.json — historical versions
 */
export class AgreementStore {
  private baseDir: string;

  constructor(dataDir: string = "data") {
    this.baseDir = join(dataDir, "agreements");
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * Save an agreement. Overwrites the current agreement for that remote.
   * The previous version (if any) is archived to history/.
   */
  save(agreement: Agreement): void {
    const hostDir = this.hostDir(agreement.parties.remote);
    if (!existsSync(hostDir)) {
      mkdirSync(hostDir, { recursive: true });
    }

    const currentPath = join(hostDir, "agreement.json");

    // Archive existing agreement if present
    if (existsSync(currentPath)) {
      const existing = JSON.parse(readFileSync(currentPath, "utf-8")) as Agreement;
      this.archiveToHistory(hostDir, existing);
    }

    writeFileSync(currentPath, JSON.stringify(agreement, null, 2), "utf-8");
  }

  /**
   * Load the current agreement for a remote URL.
   */
  load(remoteUrl: string): Agreement | null {
    const hostDir = this.hostDir(remoteUrl);
    const currentPath = join(hostDir, "agreement.json");

    if (!existsSync(currentPath)) return null;

    try {
      return JSON.parse(readFileSync(currentPath, "utf-8")) as Agreement;
    } catch {
      return null;
    }
  }

  /**
   * Load all current agreements.
   */
  loadAll(): Agreement[] {
    if (!existsSync(this.baseDir)) return [];

    const agreements: Agreement[] = [];
    const entries = readdirSync(this.baseDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const currentPath = join(this.baseDir, entry.name, "agreement.json");
      if (existsSync(currentPath)) {
        try {
          const agreement = JSON.parse(readFileSync(currentPath, "utf-8")) as Agreement;
          agreements.push(agreement);
        } catch {
          // Skip invalid files
        }
      }
    }

    return agreements;
  }

  /**
   * Get historical versions for a remote URL.
   */
  getHistory(remoteUrl: string): Agreement[] {
    const historyDir = join(this.hostDir(remoteUrl), "history");
    if (!existsSync(historyDir)) return [];

    const files = readdirSync(historyDir)
      .filter((f) => f.endsWith(".json"))
      .sort();

    const history: Agreement[] = [];
    for (const file of files) {
      try {
        const agreement = JSON.parse(
          readFileSync(join(historyDir, file), "utf-8"),
        ) as Agreement;
        history.push(agreement);
      } catch {
        // Skip invalid
      }
    }

    return history;
  }

  /**
   * Remove agreement for a remote URL.
   */
  remove(remoteUrl: string): void {
    const hostDir = this.hostDir(remoteUrl);
    if (existsSync(hostDir)) {
      rmSync(hostDir, { recursive: true, force: true });
    }
  }

  /**
   * Resolve an operation name to an agreement, endpoint, and mappings.
   * Searches all active agreements for a compiledEndpoint matching the operation.
   * e.g., "inventory.check" finds the agreement with compiledEndpoints["inventory.check"]
   */
  resolveOperation(operationName: string): { agreement: Agreement; endpoint: string; mappings: FieldMapping[] } | null {
    const agreements = this.loadAll();

    for (const agreement of agreements) {
      if (agreement.status !== "active") continue;

      // Exact match on compiled endpoints
      if (agreement.compiledEndpoints[operationName]) {
        const endpoint = agreement.compiledEndpoints[operationName]!;
        const mappings = agreement.mappings.filter(
          (m) => m.operation === operationName,
        );
        return { agreement, endpoint, mappings };
      }

      // Try matching with the dot-separated operation name against endpoint keys
      // e.g., "inventory" matches "inventory" or "inventory.check"
      for (const [key, endpoint] of Object.entries(agreement.compiledEndpoints)) {
        if (key === operationName || operationName.startsWith(`${key}.`) || key.startsWith(`${operationName}.`)) {
          const mappings = agreement.mappings.filter(
            (m) => m.operation === key || m.operation === operationName,
          );
          return { agreement, endpoint, mappings };
        }
      }
    }

    return null;
  }

  // ── Private helpers ──

  private hostDir(remoteUrl: string): string {
    // Normalize URL to a safe directory name
    const normalized = remoteUrl
      .replace(/^https?:\/\//, "")
      .replace(/[/:]/g, "_")
      .replace(/[^a-zA-Z0-9_.-]/g, "_");
    return join(this.baseDir, normalized);
  }

  private archiveToHistory(hostDir: string, agreement: Agreement): void {
    const historyDir = join(hostDir, "history");
    if (!existsSync(historyDir)) {
      mkdirSync(historyDir, { recursive: true });
    }

    const timestamp = agreement.lastRenegotiated ?? agreement.established;
    const safeName = timestamp.replace(/[:.]/g, "-");
    const historyPath = join(historyDir, `${safeName}.json`);

    writeFileSync(historyPath, JSON.stringify(agreement, null, 2), "utf-8");
  }
}
