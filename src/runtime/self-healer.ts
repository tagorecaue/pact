// ── Self-Healing Orchestrator ──
// Phase 5: Uses LLM to analyze divergences and generate adapted field mappings.

import type { LlmProvider } from "./llm";
import type { EvidenceStore } from "./evidence";
import type { LoadedContract } from "./registry";
import type { DivergenceReport } from "./divergence";

export interface SelfHealerOptions {
  llm: LlmProvider;
  evidence: EvidenceStore;
}

export interface HealResult {
  success: boolean;
  adaptedCode?: string;                  // generated code to handle the new schema
  fieldMapping?: Record<string, string>; // old_field -> new_field
  explanation: string;                   // what the LLM decided to do
  durationMs: number;
}

export class SelfHealer {
  private llm: LlmProvider;
  private evidence: EvidenceStore;

  constructor(options: SelfHealerOptions) {
    this.llm = options.llm;
    this.evidence = options.evidence;
  }

  /**
   * Analyze a divergence and generate adapted field mappings via LLM.
   */
  async heal(
    contract: LoadedContract,
    divergence: DivergenceReport,
    lastSuccessfulResponse: Record<string, unknown> | null,
    failedResponse: Record<string, unknown>,
    context: Record<string, unknown> = {},
  ): Promise<HealResult> {
    const startTime = performance.now();

    const prompt = this.buildPrompt(contract, divergence, lastSuccessfulResponse, failedResponse);

    try {
      const llmResponse = await this.llm.complete(prompt, 1024);
      const durationMs = Math.round(performance.now() - startTime);

      // Parse the LLM response
      const parsed = this.parseResponse(llmResponse.text);

      const result: HealResult = {
        success: parsed.fieldMapping !== null,
        adaptedCode: parsed.code || undefined,
        fieldMapping: parsed.fieldMapping || undefined,
        explanation: parsed.explanation,
        durationMs,
      };

      // Record healing attempt in evidence
      this.evidence.record({
        contract_id: contract.name,
        request_id: `heal-${Date.now()}`,
        step_name: "self-heal",
        action: "heal",
        input: JSON.stringify({
          divergence: divergence.summary,
          target: divergence.target,
          divergenceCount: divergence.divergences.length,
        }),
        output: JSON.stringify({
          success: result.success,
          fieldMapping: result.fieldMapping,
          explanation: result.explanation,
        }),
        duration_ms: durationMs,
        timestamp: new Date().toISOString(),
        status: result.success ? "success" : "failed",
      });

      return result;
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime);
      const message = err instanceof Error ? err.message : String(err);

      this.evidence.record({
        contract_id: contract.name,
        request_id: `heal-${Date.now()}`,
        step_name: "self-heal",
        action: "heal",
        input: JSON.stringify({ divergence: divergence.summary }),
        output: JSON.stringify({ error: message }),
        duration_ms: durationMs,
        timestamp: new Date().toISOString(),
        status: "failed",
      });

      return {
        success: false,
        explanation: `LLM healing failed: ${message}`,
        durationMs,
      };
    }
  }

  private buildPrompt(
    contract: LoadedContract,
    divergence: DivergenceReport,
    lastSuccessfulResponse: Record<string, unknown> | null,
    failedResponse: Record<string, unknown>,
  ): string {
    const contractInfo = [
      `Contract: ${contract.name} v${contract.version}`,
      contract.domain ? `Domain: ${contract.domain}` : null,
      contract.sections.intent?.natural
        ? `Intent: ${contract.sections.intent.natural}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    const divergenceInfo = divergence.divergences
      .map((d) => {
        switch (d.type) {
          case "field_removed":
            return `- REMOVED: "${d.field}" (was ${d.expected}, now missing)`;
          case "field_added":
            return `- ADDED: "${d.field}" (type: ${d.received})`;
          case "field_type_changed":
            return `- TYPE CHANGED: "${d.field}" (was ${d.expected}, now ${d.received})`;
          case "field_renamed":
            return `- RENAMED: "${d.field}" -> "${d.received}"`;
        }
      })
      .join("\n");

    return `You are analyzing an API schema change for a Pact contract.

${contractInfo}

The API at "${divergence.target}" has changed its response schema.

Changes detected:
${divergenceInfo}

Previous successful response:
${lastSuccessfulResponse ? JSON.stringify(lastSuccessfulResponse, null, 2) : "(none — first call)"}

New response:
${JSON.stringify(failedResponse, null, 2)}

Analyze the changes and provide a field mapping from old field names to new field names.
Respond with EXACTLY this format:

MAPPING:
{"old_field_name": "new_field_name", ...}

EXPLANATION:
A brief explanation of what changed and how to adapt.

Rules:
- Only include fields that need mapping (changed or renamed fields)
- If a field was removed with no replacement, map it to "" (empty string)
- If a field was added but maps to an old field, include the mapping
- Be concise in the explanation`;
  }

  private parseResponse(text: string): {
    fieldMapping: Record<string, string> | null;
    explanation: string;
    code: string | null;
  } {
    let fieldMapping: Record<string, string> | null = null;
    let explanation = "No explanation provided";
    let code: string | null = null;

    // Extract MAPPING section
    const mappingMatch = text.match(/MAPPING:\s*\n\s*(\{[^}]+\})/s);
    if (mappingMatch) {
      try {
        fieldMapping = JSON.parse(mappingMatch[1]!);
      } catch {
        // Try to find any JSON object in the text
        const jsonMatch = text.match(/\{[^{}]*"[^"]*"\s*:\s*"[^"]*"[^{}]*\}/);
        if (jsonMatch) {
          try {
            fieldMapping = JSON.parse(jsonMatch[0]);
          } catch {
            // Could not parse mapping
          }
        }
      }
    } else {
      // Fallback: try to find any JSON object that looks like a mapping
      const jsonMatch = text.match(/\{[^{}]*"[^"]*"\s*:\s*"[^"]*"[^{}]*\}/);
      if (jsonMatch) {
        try {
          fieldMapping = JSON.parse(jsonMatch[0]);
        } catch {
          // Could not parse mapping
        }
      }
    }

    // Extract EXPLANATION section
    const explanationMatch = text.match(/EXPLANATION:\s*\n([\s\S]*?)(?:\n\n|$)/);
    if (explanationMatch) {
      explanation = explanationMatch[1]!.trim();
    } else if (text.length < 500) {
      // If no explicit section, use the whole text minus the JSON
      explanation = text.replace(/MAPPING:\s*\n\s*\{[^}]+\}/s, "").trim();
      if (!explanation) explanation = "Field mapping generated";
    }

    // Extract CODE section if present
    const codeMatch = text.match(/```(?:typescript|ts|javascript|js)?\n([\s\S]*?)```/);
    if (codeMatch) {
      code = codeMatch[1]!.trim();
    }

    return { fieldMapping, explanation, code };
  }
}

/**
 * Apply a field mapping to transform a response object.
 * Maps old field names to new field names based on the healing result.
 */
export function applyFieldMapping(
  response: Record<string, unknown>,
  mapping: Record<string, string>,
  expectedFields: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // First, copy all fields from response
  for (const [key, value] of Object.entries(response)) {
    result[key] = value;
  }

  // Apply reverse mapping: for each expected field, find its new name in the response
  for (const [oldField, newField] of Object.entries(mapping)) {
    if (newField && newField in response) {
      // The old field was renamed to newField — make it available under the old name
      result[oldField] = response[newField];
    }
  }

  return result;
}
