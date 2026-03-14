import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";

export interface EvidenceEntry {
  id: string;
  contract_id: string;
  request_id: string;
  step_name: string;
  action: string;
  input: string | null;
  output: string | null;
  duration_ms: number;
  timestamp: string;
  status: "success" | "failed" | "skipped";
}

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS _evidence (
    id TEXT PRIMARY KEY,
    contract_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    step_name TEXT NOT NULL,
    action TEXT NOT NULL,
    input TEXT,
    output TEXT,
    duration_ms INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    status TEXT NOT NULL
  )
`;

const INSERT = `
  INSERT INTO _evidence (id, contract_id, request_id, step_name, action, input, output, duration_ms, timestamp, status)
  VALUES ($id, $contract_id, $request_id, $step_name, $action, $input, $output, $duration_ms, $timestamp, $status)
`;

export class EvidenceStore {
  private db: Database;

  constructor(dataDir: string = "data") {
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    this.db = new Database(join(dataDir, "evidence.db"));
    this.db.run(CREATE_TABLE);
  }

  record(entry: Omit<EvidenceEntry, "id">): void {
    const id = crypto.randomUUID();
    this.db.run(INSERT, {
      $id: id,
      $contract_id: entry.contract_id,
      $request_id: entry.request_id,
      $step_name: entry.step_name,
      $action: entry.action,
      $input: entry.input ?? null,
      $output: entry.output ?? null,
      $duration_ms: entry.duration_ms,
      $timestamp: entry.timestamp,
      $status: entry.status,
    });
  }

  getByContract(contractId: string): EvidenceEntry[] {
    return this.db
      .query("SELECT * FROM _evidence WHERE contract_id = $contract_id ORDER BY timestamp ASC")
      .all({ $contract_id: contractId }) as EvidenceEntry[];
  }

  getByRequest(requestId: string): EvidenceEntry[] {
    return this.db
      .query("SELECT * FROM _evidence WHERE request_id = $request_id ORDER BY timestamp ASC")
      .all({ $request_id: requestId }) as EvidenceEntry[];
  }

  close(): void {
    this.db.close();
  }
}
