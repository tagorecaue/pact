import { Lexer } from "./lexer/lexer";
import { Parser } from "./parser/parser";
import type { PactFile } from "./parser/ast";

export function parse(source: string): PactFile {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const sourceLines = source.split("\n");
  const parser = new Parser(tokens, sourceLines);
  return parser.parse();
}

// Re-export types
export type { PactFile } from "./parser/ast";
export type {
  Section,
  ContractSection,
  IntentSection,
  EntitiesSection,
  ConstraintsSection,
  ExecutionSection,
  EvidenceSection,
  TriggersSection,
  FallbacksSection,
  DependenciesSection,
  SchemaSection,
  PolicySection,
  MixinSection,
  ReasoningSection,
  LearnedSection,
  NegotiateSection,
  EntityDef,
  FieldDef,
  FieldModifier,
  ConstraintDef,
  TriggerDef,
  FallbackHandler,
  FallbackAction,
  DependencyDef,
  BindingDef,
  TypeExpr,
  Expression,
  FlowExpr,
} from "./parser/ast";

export { PactError, PactLexError, PactParseError } from "./errors";

// Runtime re-exports
export { ContractRegistry, type LoadedContract } from "./runtime/registry";
export { EvidenceStore, type EvidenceEntry } from "./runtime/evidence";
export { ExecutionEngine, ExecutionContext, PactRuntimeError, type ExecutionResult, type StepResult } from "./runtime/engine";
export { DataStore } from "./runtime/store";
export { HttpClient, HttpTimeoutError, type HttpRequestSpec, type HttpResponse } from "./runtime/http-client";
export { PactServer, type PactServerOptions } from "./runtime/server";
export { type LlmProvider, type LlmResponse, type LlmConfig, LocalLlm, ApiLlm, createLlmProvider, createDefaultProvider, loadLlmConfig } from "./runtime/llm";
export { detectDivergence, buildSchemaMap, type SchemaDivergence, type DivergenceReport } from "./runtime/divergence";
export { SelfHealer, applyFieldMapping, type SelfHealerOptions, type HealResult } from "./runtime/self-healer";
export { startMockServer, type MockServerHandle, type SchemaVersion } from "./runtime/mock-server";
export { Translator, type TranslatorOptions, type TranslatorResult, type GapQuestion, buildGenerationPrompt, buildGapDetectionPrompt, generateSuggestions, extractPactBlock, parseGapQuestions, extractContractName } from "./runtime/translator";
