import { readFileSync, readdirSync, existsSync } from "fs";
import { join, extname, basename } from "path";

export interface ConnectorOperation {
  name: string;
  method: string;
  path: string;
  intent: string;
  input: Record<string, FieldSpec>;
  output: Record<string, FieldSpec>;
}

export interface FieldSpec {
  type: string;
  required: boolean;
  default?: string;
}

export interface LoadedConnector {
  name: string;
  version: string;
  baseUrl: string;
  authType: string;
  authEnv: string;
  operations: Map<string, ConnectorOperation>;
}

// ── Connector file parser ──
// Uses lightweight line-by-line parsing to extract connector details from .pact files

interface ParseState {
  name: string;
  version: string;
  baseUrl: string;
  authType: string;
  authEnv: string;
  operations: Map<string, ConnectorOperation>;
}

function parseConnectorFile(filePath: string): LoadedConnector | null {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const state: ParseState = {
    name: "",
    version: "",
    baseUrl: "",
    authType: "",
    authEnv: "",
    operations: new Map(),
  };

  let inSection = "";
  let inOperations = false;
  let currentOp: Partial<ConnectorOperation> | null = null;
  let currentOpName = "";
  let inInput = false;
  let inOutput = false;
  let inAuth = false;
  let inputFields: Record<string, FieldSpec> = {};
  let outputFields: Record<string, FieldSpec> = {};

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.trimEnd();
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("--")) continue;

    // Detect section headers
    if (trimmed.startsWith("@C ")) {
      inSection = "C";
      inOperations = false;
      inAuth = false;
      const parts = trimmed.slice(3).trim().split(/\s+/);
      // Name can be like "connector.telegram" or "telegram-connector"
      state.name = parts[0] ?? "";
      state.version = parts[1] ?? "1.0.0";
      continue;
    }

    if (trimmed.startsWith("@I")) {
      inSection = "I";
      inOperations = false;
      inAuth = false;
      continue;
    }

    if (trimmed.startsWith("@S ")) {
      inSection = "S";
      inOperations = false;
      inAuth = false;
      continue;
    }

    if (trimmed.startsWith("@") && /^@[A-Z]/.test(trimmed)) {
      inSection = trimmed[1] ?? "";
      inOperations = false;
      inAuth = false;
      continue;
    }

    // Parse within @S section
    if (inSection === "S") {
      // Detect base_url
      if (trimmed.startsWith("base_url ")) {
        const urlMatch = trimmed.match(/base_url\s+"([^"]+)"/);
        if (urlMatch) {
          state.baseUrl = urlMatch[1]!;
        }
        continue;
      }

      // Detect auth block
      if (trimmed === "auth") {
        inAuth = true;
        inOperations = false;
        inInput = false;
        inOutput = false;
        continue;
      }

      if (inAuth) {
        if (trimmed.startsWith("type ")) {
          state.authType = trimmed.slice(5).trim();
          continue;
        }
        if (trimmed.startsWith("env ") && !state.authEnv) {
          state.authEnv = trimmed.slice(4).trim();
          continue;
        }
        // End of auth block when we hit operations or another top-level key
        if (
          trimmed === "operations" ||
          trimmed.startsWith("base_url") ||
          trimmed.startsWith("rate_limit") ||
          trimmed.startsWith("retry_") ||
          trimmed.startsWith("content_type") ||
          trimmed.startsWith("idempotency") ||
          trimmed.startsWith("api_version") ||
          trimmed.startsWith("pool") ||
          trimmed.startsWith("ssl") ||
          trimmed.startsWith("primitive")
        ) {
          inAuth = false;
          // Fall through to handle the current line
        } else {
          continue;
        }
      }

      // Detect operations block
      if (trimmed === "operations") {
        inOperations = true;
        inInput = false;
        inOutput = false;
        currentOp = null;
        continue;
      }

      if (inOperations) {
        // Determine indent level
        const indent = raw.length - raw.trimStart().length;

        // Operation name (typically 4 spaces indent)
        if (indent >= 4 && indent <= 6 && !trimmed.startsWith("method ") &&
            !trimmed.startsWith("path ") && !trimmed.startsWith("intent ") &&
            !trimmed.startsWith("input") && !trimmed.startsWith("output") &&
            !trimmed.startsWith("errors") && !trimmed.startsWith("local ") &&
            !trimmed.startsWith("rate_") && !trimmed.startsWith("mode ") &&
            !trimmed.startsWith("primitive ") && !trimmed.startsWith("guard") &&
            !trimmed.startsWith("transform") &&
            !inInput && !inOutput &&
            /^[a-z_][a-z0-9_]*$/.test(trimmed)) {
          // Save previous operation
          if (currentOp && currentOpName) {
            currentOp.input = { ...inputFields };
            currentOp.output = { ...outputFields };
            state.operations.set(currentOpName, currentOp as ConnectorOperation);
          }
          currentOpName = trimmed;
          currentOp = {
            name: trimmed,
            method: "GET",
            path: "/",
            intent: "",
            input: {},
            output: {},
          };
          inputFields = {};
          outputFields = {};
          inInput = false;
          inOutput = false;
          continue;
        }

        if (currentOp) {
          if (trimmed.startsWith("method ")) {
            currentOp.method = trimmed.slice(7).trim();
            inInput = false;
            inOutput = false;
            continue;
          }
          if (trimmed.startsWith("path ")) {
            const pathMatch = trimmed.match(/path\s+"([^"]+)"/);
            if (pathMatch) {
              currentOp.path = pathMatch[1]!;
            }
            inInput = false;
            inOutput = false;
            continue;
          }
          if (trimmed.startsWith("intent ")) {
            const intentMatch = trimmed.match(/intent\s+"([^"]+)"/);
            if (intentMatch) {
              currentOp.intent = intentMatch[1]!;
            }
            inInput = false;
            inOutput = false;
            continue;
          }
          if (trimmed === "input") {
            inInput = true;
            inOutput = false;
            continue;
          }
          if (trimmed === "output") {
            inInput = false;
            inOutput = true;
            continue;
          }
          if (trimmed === "errors" || trimmed.startsWith("errors")) {
            inInput = false;
            inOutput = false;
            continue;
          }

          // Parse input fields
          if (inInput && indent >= 8) {
            const fieldMatch = trimmed.match(/^([a-z_][a-z0-9_]*)\s+(\S+)(.*)$/);
            if (fieldMatch) {
              const fieldName = fieldMatch[1]!;
              const fieldType = fieldMatch[2]!;
              const rest = fieldMatch[3] ?? "";
              const required = rest.includes("!");
              const defaultMatch = rest.match(/=(\S+)/);
              inputFields[fieldName] = {
                type: fieldType,
                required,
                default: defaultMatch ? defaultMatch[1] : undefined,
              };
            }
            continue;
          }

          // Parse output fields
          if (inOutput && indent >= 8) {
            const fieldMatch = trimmed.match(/^([a-z_][a-z0-9_]*)\s+(\S+)(.*)$/);
            if (fieldMatch) {
              const fieldName = fieldMatch[1]!;
              const fieldType = fieldMatch[2]!;
              outputFields[fieldName] = {
                type: fieldType,
                required: false,
              };
            }
            continue;
          }
        }
      }
    }
  }

  // Save last operation
  if (currentOp && currentOpName) {
    currentOp.input = { ...inputFields };
    currentOp.output = { ...outputFields };
    state.operations.set(currentOpName, currentOp as ConnectorOperation);
  }

  if (!state.name) return null;

  return {
    name: state.name,
    version: state.version,
    baseUrl: state.baseUrl,
    authType: state.authType,
    authEnv: state.authEnv,
    operations: state.operations,
  };
}

// Derive a short name from the connector contract name
// e.g. "connector.telegram" -> "telegram", "telegram-connector" -> "telegram"
function deriveShortName(contractName: string): string {
  let name = contractName;
  // Remove "connector." prefix
  if (name.startsWith("connector.")) {
    name = name.slice(10);
  }
  // Remove "-connector" suffix
  if (name.endsWith("-connector")) {
    name = name.slice(0, -10);
  }
  return name;
}

export class ConnectorRegistry {
  private connectors: Map<string, LoadedConnector> = new Map();

  loadFile(filePath: string): void {
    const connector = parseConnectorFile(filePath);
    if (!connector) return;

    const shortName = deriveShortName(connector.name);
    this.connectors.set(shortName, connector);
  }

  loadDirectory(dir: string): void {
    if (!existsSync(dir)) return;

    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (extname(entry) === ".pact") {
        this.loadFile(join(dir, entry));
      }
    }
  }

  resolve(target: string): { connector: LoadedConnector; operation: ConnectorOperation } | null {
    // target format: "connector_name.operation_name"
    const dotIdx = target.indexOf(".");
    if (dotIdx === -1) return null;

    const connectorName = target.slice(0, dotIdx);
    const operationName = target.slice(dotIdx + 1);

    const connector = this.connectors.get(connectorName);
    if (!connector) return null;

    const operation = connector.operations.get(operationName);
    if (!operation) return null;

    return { connector, operation };
  }

  get(name: string): LoadedConnector | undefined {
    return this.connectors.get(name);
  }

  getAll(): LoadedConnector[] {
    return Array.from(this.connectors.values());
  }

  getAllNames(): string[] {
    return Array.from(this.connectors.keys());
  }

  count(): number {
    return this.connectors.size;
  }
}
