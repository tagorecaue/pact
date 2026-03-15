// ── Schema Divergence Detector ──
// Phase 5: Detects when an external API response deviates from expected schema.

export interface SchemaDivergence {
  type: "field_added" | "field_removed" | "field_type_changed" | "field_renamed";
  field: string;
  expected?: string;  // expected type or value
  received?: string;  // actual type or value
  impact: "low" | "high";  // low = new optional field, high = removed/changed field used by contract
}

export interface DivergenceReport {
  target: string;           // exchange target
  timestamp: string;
  divergences: SchemaDivergence[];
  hasHighImpact: boolean;
  summary: string;
}

/**
 * Detect divergences between expected schema and actual response.
 *
 * @param expectedFields  - fields the contract expects to receive
 * @param expectedSchema  - field->type map from previous successful call (null if first call)
 * @param actualResponse  - actual response body
 * @param target          - exchange target identifier (for the report)
 */
export function detectDivergence(
  expectedFields: string[],
  expectedSchema: Record<string, string> | null,
  actualResponse: Record<string, unknown>,
  target: string = "unknown",
): DivergenceReport {
  const divergences: SchemaDivergence[] = [];
  const actualKeys = Object.keys(actualResponse);

  // 1. Check for removed fields — fields the contract expects but are missing
  for (const field of expectedFields) {
    if (!(field in actualResponse)) {
      divergences.push({
        type: "field_removed",
        field,
        expected: expectedSchema?.[field] ?? "present",
        received: "missing",
        impact: "high",
      });
    }
  }

  // 2. Check for added fields — keys in response not in expected fields
  for (const key of actualKeys) {
    if (!expectedFields.includes(key)) {
      divergences.push({
        type: "field_added",
        field: key,
        received: typeOf(actualResponse[key]),
        impact: "low",
      });
    }
  }

  // 3. Check for type changes — if we have a previous schema, compare types
  if (expectedSchema) {
    for (const field of expectedFields) {
      if (field in actualResponse && field in expectedSchema) {
        const expectedType = expectedSchema[field]!;
        const actualType = typeOf(actualResponse[field]);
        if (expectedType !== actualType) {
          divergences.push({
            type: "field_type_changed",
            field,
            expected: expectedType,
            received: actualType,
            impact: "high",
          });
        }
      }
    }
  }

  const hasHighImpact = divergences.some((d) => d.impact === "high");
  const summary = buildSummary(divergences);

  return {
    target,
    timestamp: new Date().toISOString(),
    divergences,
    hasHighImpact,
    summary,
  };
}

/**
 * Build a schema map (field -> type) from a response object.
 * Used to store the schema of a successful response for future comparison.
 */
export function buildSchemaMap(response: Record<string, unknown>): Record<string, string> {
  const schema: Record<string, string> = {};
  for (const [key, value] of Object.entries(response)) {
    schema[key] = typeOf(value);
  }
  return schema;
}

// ── Internal helpers ──

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function buildSummary(divergences: SchemaDivergence[]): string {
  if (divergences.length === 0) {
    return "no divergences detected";
  }

  const parts: string[] = [];
  for (const d of divergences) {
    switch (d.type) {
      case "field_removed":
        parts.push(`${d.field} removed`);
        break;
      case "field_added":
        parts.push(`${d.field} added`);
        break;
      case "field_type_changed":
        parts.push(`${d.field} type changed (${d.expected} -> ${d.received})`);
        break;
      case "field_renamed":
        parts.push(`${d.field} renamed to ${d.received}`);
        break;
    }
  }

  return `${divergences.length} divergence${divergences.length === 1 ? "" : "s"}: ${parts.join(", ")}`;
}
