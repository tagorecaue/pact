import { DataStore } from "../store";

export interface SqlResult {
  [key: string]: unknown;
}

export class SqlPrimitive {
  private store: DataStore;

  constructor(store?: DataStore) {
    this.store = store ?? new DataStore();
  }

  async execute(
    operation: string,
    params: Record<string, unknown>,
  ): Promise<SqlResult> {
    switch (operation) {
      case "query":
        return this.query(params);
      case "insert":
        return this.insert(params);
      case "update":
        return this.update(params);
      default:
        throw new Error(`SqlPrimitive: unknown operation "${operation}"`);
    }
  }

  private async query(params: Record<string, unknown>): Promise<SqlResult> {
    const table = params.table as string;
    if (!table) throw new Error("SqlPrimitive.query: table is required");

    const where = (params.where as Record<string, unknown>) ?? undefined;
    const rows = this.store.query(table, where);

    return { rows, rowCount: rows.length };
  }

  private async insert(params: Record<string, unknown>): Promise<SqlResult> {
    const table = params.table as string;
    if (!table) throw new Error("SqlPrimitive.insert: table is required");

    const data = params.data as Record<string, unknown>;
    if (!data) throw new Error("SqlPrimitive.insert: data is required");

    const row = this.store.insert(table, data);
    return { row, inserted: true };
  }

  private async update(params: Record<string, unknown>): Promise<SqlResult> {
    const table = params.table as string;
    if (!table) throw new Error("SqlPrimitive.update: table is required");

    const where = params.where as Record<string, unknown>;
    if (!where) throw new Error("SqlPrimitive.update: where is required");

    const data = params.data as Record<string, unknown>;
    if (!data) throw new Error("SqlPrimitive.update: data is required");

    const affectedRows = this.store.update(table, where, data);
    return { affectedRows };
  }

  close(): void {
    this.store.close();
  }
}
