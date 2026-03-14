import { Database, type SQLQueryBindings } from "bun:sqlite";
import { mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import type { FieldDef, TypeExpr, FieldModifier } from "../parser/ast";

/**
 * Maps a Pact TypeExpr to a SQLite column type.
 */
function sqliteType(type: TypeExpr): string {
  switch (type.kind) {
    case "PrimitiveType":
      switch (type.name) {
        case "int":
          return "INTEGER";
        case "dec":
          return "REAL";
        case "bool":
          return "INTEGER";
        case "str":
        case "ts":
        case "dur":
        case "id":
        case "any":
          return "TEXT";
        default:
          return "TEXT";
      }
    case "RefType":
      return "TEXT";
    case "ListType":
      return "TEXT"; // stored as JSON
    case "MapType":
      return "TEXT"; // stored as JSON
    case "OptType":
      return sqliteType(type.inner);
    case "EnumType":
      return "TEXT";
    default:
      return "TEXT";
  }
}

/**
 * Builds a column definition string for a single FieldDef.
 */
function columnDef(field: FieldDef): string {
  const colType = sqliteType(field.type);
  const parts: string[] = [`"${field.name}"`, colType];

  const mods = field.modifiers as FieldModifier[];
  const isAutoGen = mods.includes("~");
  const isRequired = mods.includes("!");
  const isUnique = mods.includes("*");
  const isOptional = field.type.kind === "OptType" || mods.includes("?");

  // NOT NULL: apply for required fields, but skip auto-generated ones
  if (isRequired && !isAutoGen && !isOptional) {
    parts.push("NOT NULL");
  }

  if (isUnique) {
    parts.push("UNIQUE");
  }

  return parts.join(" ");
}

/**
 * Generates a random ID string (UUID-like, 24 hex chars).
 */
function generateId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export class DataStore {
  private db: Database;
  /** Tracks field metadata per table for insert-time auto-generation. */
  private fieldMeta: Map<string, FieldDef[]> = new Map();

  constructor(dataDir: string = "data") {
    const dbPath = join(dataDir, "pact.db");
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath, { create: true });
    this.db.run("PRAGMA journal_mode = WAL");
  }

  /**
   * Creates a table for an entity if it does not already exist.
   * Stores field metadata for later use in insert().
   */
  ensureTable(entityName: string, fields: FieldDef[]): void {
    this.fieldMeta.set(entityName, fields);

    const columns = fields.map((f) => columnDef(f));

    // Add indexes for fields with ^ modifier after table creation
    const indexedFields = fields.filter((f) =>
      (f.modifiers as FieldModifier[]).includes("^")
    );

    const sql = `CREATE TABLE IF NOT EXISTS "${entityName}" (${columns.join(", ")})`;
    this.db.run(sql);

    for (const field of indexedFields) {
      const idxName = `idx_${entityName}_${field.name}`;
      this.db.run(
        `CREATE INDEX IF NOT EXISTS "${idxName}" ON "${entityName}" ("${field.name}")`
      );
    }
  }

  /**
   * Inserts a row into the given table.
   * Auto-generates id fields that have the ~ modifier and no provided value.
   * Returns the full inserted row.
   */
  insert(
    table: string,
    data: Record<string, unknown>
  ): Record<string, unknown> {
    const fields = this.fieldMeta.get(table);
    const row = { ...data };

    // Auto-generate values for ~ fields when not provided
    if (fields) {
      for (const field of fields) {
        const mods = field.modifiers as FieldModifier[];
        if (mods.includes("~") && (row[field.name] === undefined || row[field.name] === null)) {
          // For id-typed fields, generate a random id
          // For ts-typed fields, generate current timestamp
          if (
            field.type.kind === "PrimitiveType" &&
            field.type.name === "id"
          ) {
            row[field.name] = generateId();
          } else if (
            field.type.kind === "PrimitiveType" &&
            field.type.name === "ts"
          ) {
            row[field.name] = new Date().toISOString();
          }
        }
      }
    }

    // Serialize list/map values to JSON strings
    if (fields) {
      for (const field of fields) {
        if (
          row[field.name] !== undefined &&
          row[field.name] !== null &&
          (field.type.kind === "ListType" || field.type.kind === "MapType")
        ) {
          if (typeof row[field.name] !== "string") {
            row[field.name] = JSON.stringify(row[field.name]);
          }
        }
      }
    }

    const keys = Object.keys(row).filter((k) => row[k] !== undefined);
    const placeholders = keys.map(() => "?").join(", ");
    const values = keys.map((k) => {
      const v = row[k];
      if (v === null) return null;
      if (typeof v === "boolean") return v ? 1 : 0;
      return v;
    });

    const quotedKeys = keys.map((k) => `"${k}"`).join(", ");
    const sql = `INSERT INTO "${table}" (${quotedKeys}) VALUES (${placeholders})`;
    this.db.run(sql, values as SQLQueryBindings[]);

    // Return the inserted row (re-read values that were set)
    const result: Record<string, unknown> = {};
    for (const k of keys) {
      result[k] = row[k];
    }
    return result;
  }

  /**
   * Queries rows from a table with optional equality-based WHERE conditions.
   */
  query(
    table: string,
    where?: Record<string, unknown>
  ): Record<string, unknown>[] {
    let sql = `SELECT * FROM "${table}"`;
    const values: unknown[] = [];

    if (where && Object.keys(where).length > 0) {
      const conditions = Object.keys(where).map((k) => {
        values.push(typeof where[k] === "boolean" ? (where[k] ? 1 : 0) : where[k]);
        return `"${k}" = ?`;
      });
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }

    const stmt = this.db.prepare(sql);
    return stmt.all(...(values as SQLQueryBindings[])) as Record<string, unknown>[];
  }

  /**
   * Updates rows in a table matching the WHERE conditions.
   * Returns the number of affected rows.
   */
  update(
    table: string,
    where: Record<string, unknown>,
    data: Record<string, unknown>
  ): number {
    const fields = this.fieldMeta.get(table);

    // Serialize list/map values to JSON strings
    const setData = { ...data };
    if (fields) {
      for (const field of fields) {
        if (
          setData[field.name] !== undefined &&
          setData[field.name] !== null &&
          (field.type.kind === "ListType" || field.type.kind === "MapType")
        ) {
          if (typeof setData[field.name] !== "string") {
            setData[field.name] = JSON.stringify(setData[field.name]);
          }
        }
      }
    }

    const setClauses = Object.keys(setData).map((k) => `"${k}" = ?`);
    const setValues = Object.keys(setData).map((k) => {
      const v = setData[k];
      if (v === null) return null;
      if (typeof v === "boolean") return v ? 1 : 0;
      return v;
    });

    const whereClauses = Object.keys(where).map((k) => `"${k}" = ?`);
    const whereValues = Object.keys(where).map((k) => {
      const v = where[k];
      if (typeof v === "boolean") return v ? 1 : 0;
      return v;
    });

    const sql = `UPDATE "${table}" SET ${setClauses.join(", ")} WHERE ${whereClauses.join(" AND ")}`;
    const result = this.db.run(sql, [...setValues, ...whereValues] as SQLQueryBindings[]);
    return result.changes;
  }

  /**
   * Closes the database connection.
   */
  close(): void {
    this.db.close();
  }
}
