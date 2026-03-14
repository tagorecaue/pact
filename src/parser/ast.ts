// Location info for all AST nodes
export interface Loc {
  line: number;
  col: number;
}

// ── Top-level ──

export interface PactFile {
  kind: "PactFile";
  header: VersionHeader;
  sections: Section[];
  loc: Loc;
}

export interface VersionHeader {
  kind: "VersionHeader";
  version: string; // "v1"
  loc: Loc;
}

// ── Sections (discriminated union) ──

export type Section =
  | ContractSection
  | IntentSection
  | EntitiesSection
  | ConstraintsSection
  | ExecutionSection
  | EvidenceSection
  | TriggersSection
  | FallbacksSection
  | DependenciesSection
  | SchemaSection
  | PolicySection
  | MixinSection
  | ReasoningSection
  | LearnedSection
  | NegotiateSection;

export interface ContractSection {
  kind: "ContractSection";
  name: string;
  version: string;
  domain?: string;
  author?: string;
  created?: string;
  tags?: string[];
  use?: UseDirective[];
  loc: Loc;
}

export interface UseDirective {
  kind: "UseDirective";
  contract: string; // "#crud.base"
  params: { name: string; value: string }[];
  loc: Loc;
}

export interface IntentSection {
  kind: "IntentSection";
  natural?: string;
  goal?: Expression;
  accept?: string[];
  reject?: string[];
  priority?: string;
  timeout?: string;
  loc: Loc;
}

export interface EntitiesSection {
  kind: "EntitiesSection";
  entities: EntityDef[];
  loc: Loc;
}

export interface EntityDef {
  kind: "EntityDef";
  name: string;
  fields: FieldDef[];
  loc: Loc;
}

export interface FieldDef {
  kind: "FieldDef";
  name: string;
  type: TypeExpr;
  modifiers: FieldModifier[];
  defaultValue?: string;
  loc: Loc;
}

export type FieldModifier = "!" | "?" | "*" | "^" | "~";

export interface ConstraintsSection {
  kind: "ConstraintsSection";
  constraints: ConstraintDef[];
  loc: Loc;
}

export interface ConstraintDef {
  kind: "ConstraintDef";
  expression: Expression;
  severity?: string;
  message?: string;
  enforced?: string;
  loc: Loc;
}

export interface ExecutionSection {
  kind: "ExecutionSection";
  flow: FlowExpr[];
  loc: Loc;
}

export interface EvidenceSection {
  kind: "EvidenceSection";
  fields: GenericField[];
  loc: Loc;
}

export interface TriggersSection {
  kind: "TriggersSection";
  triggers: TriggerDef[];
  loc: Loc;
}

export interface TriggerDef {
  kind: "TriggerDef";
  type: string; // http, cron, event, webhook, manual, queue, watch, delay
  args: string[];
  attrs: GenericField[];
  loc: Loc;
}

export interface FallbacksSection {
  kind: "FallbacksSection";
  handlers: FallbackHandler[];
  loc: Loc;
}

export interface FallbackHandler {
  kind: "FallbackHandler";
  event: string;
  actions: FallbackAction[];
  loc: Loc;
}

export type FallbackAction =
  | RetryAction
  | FallbackStepAction
  | EscalateAction
  | AbortAction
  | GenericAction;

export interface RetryAction {
  kind: "RetryAction";
  count: number;
  backoff?: string;
  base?: string;
  loc: Loc;
}

export interface FallbackStepAction {
  kind: "FallbackStepAction";
  step: string;
  loc: Loc;
}

export interface EscalateAction {
  kind: "EscalateAction";
  target: string;
  via: string;
  loc: Loc;
}

export interface AbortAction {
  kind: "AbortAction";
  message: string;
  loc: Loc;
}

export interface GenericAction {
  kind: "GenericAction";
  name: string;
  args: string[];
  loc: Loc;
}

export interface DependenciesSection {
  kind: "DependenciesSection";
  deps: DependencyDef[];
  loc: Loc;
}

export interface DependencyDef {
  kind: "DependencyDef";
  contract: string;
  versionConstraints: string[];
  bindings: BindingDef[];
  loc: Loc;
}

export interface BindingDef {
  kind: "BindingDef";
  local: string;
  operator: string; // "<-" or "="
  remote: string;
  loc: Loc;
}

export interface SchemaSection {
  kind: "SchemaSection";
  schemas: SchemaDef[];
  loc: Loc;
}

export interface SchemaDef {
  kind: "SchemaDef";
  name: string;
  fields: SchemaFieldDef[];
  loc: Loc;
}

export interface SchemaFieldDef {
  kind: "SchemaFieldDef";
  name: string;
  type: TypeExpr;
  modifiers: FieldModifier[];
  defaultValue?: string;
  constraints: InlineConstraint[];
  loc: Loc;
}

export interface InlineConstraint {
  kind: "InlineConstraint";
  type: string; // "min", "max", "matches", "in", ">", "<"
  value: string;
  loc: Loc;
}

export interface PolicySection {
  kind: "PolicySection";
  name: string;
  version: string;
  domain?: string;
  scope?: string;
  scopeValue?: string;
  constraints: GenericField[];
  defaults: GenericField[];
  loc: Loc;
}

export interface MixinSection {
  kind: "MixinSection";
  name: string;
  description?: string;
  params: FieldDef[];
  loc: Loc;
}

export interface ReasoningSection {
  kind: "ReasoningSection";
  objective?: string;
  strategy: StrategyRule[];
  freedom: GenericField[];
  locked: LockedRule[];
  loc: Loc;
}

export interface StrategyRule {
  kind: "StrategyRule";
  prefer: string;
  when: string;
  loc: Loc;
}

export interface LockedRule {
  kind: "LockedRule";
  modifier: "never" | "always";
  action: string;
  loc: Loc;
}

export interface LearnedSection {
  kind: "LearnedSection";
  version?: string;
  fields: GenericField[];
  metrics: GenericField[];
  invalidateOn: GenericField[];
  loc: Loc;
}

export interface NegotiateSection {
  kind: "NegotiateSection";
  offers: NegotiateResource[];
  accepts: NegotiateResource[];
  trustLevels: TrustLevels;
  loc: Loc;
}

export interface NegotiateResource {
  kind: "NegotiateResource";
  name: string;
  fields: GenericField[];
  loc: Loc;
}

export interface TrustLevels {
  kind: "TrustLevels";
  locked: string[];
  negotiable: string[];
  free: string[];
  loc: Loc;
}

// ── Generic field for sections with key-value pairs ──

export interface GenericField {
  kind: "GenericField";
  name: string;
  value: string;
  children: GenericField[];
  loc: Loc;
}

// ── Type expressions ──

export type TypeExpr =
  | PrimitiveType
  | RefType
  | ListType
  | MapType
  | OptType
  | EnumType;

export interface PrimitiveType {
  kind: "PrimitiveType";
  name: string; // str, int, dec, bool, ts, dur, id, any
  loc: Loc;
}

export interface RefType {
  kind: "RefType";
  inner: TypeExpr;
  loc: Loc;
}

export interface ListType {
  kind: "ListType";
  inner: TypeExpr;
  loc: Loc;
}

export interface MapType {
  kind: "MapType";
  key: TypeExpr;
  value: TypeExpr;
  loc: Loc;
}

export interface OptType {
  kind: "OptType";
  inner: TypeExpr;
  loc: Loc;
}

export interface EnumType {
  kind: "EnumType";
  variants: string[];
  loc: Loc;
}

// ── Expressions ──

export type Expression =
  | OrExpr
  | AndExpr
  | NotExpr
  | Comparison
  | Quantified
  | FunctionCall
  | GroupExpr
  | DottedIdExpr
  | ImplicationExpr
  | LiteralExpr;

export interface OrExpr {
  kind: "OrExpr";
  left: Expression;
  right: Expression;
  loc: Loc;
}

export interface AndExpr {
  kind: "AndExpr";
  left: Expression;
  right: Expression;
  loc: Loc;
}

export interface NotExpr {
  kind: "NotExpr";
  expr: Expression;
  loc: Loc;
}

export interface Comparison {
  kind: "Comparison";
  left: Expression;
  op: string;
  right: Expression;
  loc: Loc;
}

export interface Quantified {
  kind: "Quantified";
  quantifier: "forall" | "exists";
  variable: string;
  collection: Expression;
  predicate: Expression;
  loc: Loc;
}

export interface FunctionCall {
  kind: "FunctionCall";
  name: string;
  args: Expression[];
  loc: Loc;
}

export interface GroupExpr {
  kind: "GroupExpr";
  expr: Expression;
  loc: Loc;
}

export interface DottedIdExpr {
  kind: "DottedIdExpr";
  parts: string[];
  loc: Loc;
}

export interface ImplicationExpr {
  kind: "ImplicationExpr";
  antecedent: Expression;
  consequent: Expression;
  loc: Loc;
}

export interface LiteralExpr {
  kind: "LiteralExpr";
  value: string;
  type: "string" | "number" | "bool" | "timestamp" | "duration" | "keyword";
  loc: Loc;
}

// ── Flow expressions ──

export type FlowExpr =
  | StepNode
  | SequenceExpr
  | PipeExpr
  | ParallelExpr
  | ConditionalExpr
  | MatchExpr
  | LoopExpr
  | DelegateExpr
  | AsyncExpr
  | ExchangeExpr
  | TransformExpr
  | FlowGroupExpr;

export interface StepNode {
  kind: "StepNode";
  name: string;
  args: string[];
  loc: Loc;
}

export interface SequenceExpr {
  kind: "SequenceExpr";
  left: FlowExpr;
  right: FlowExpr;
  loc: Loc;
}

export interface PipeExpr {
  kind: "PipeExpr";
  left: FlowExpr;
  right: FlowExpr;
  loc: Loc;
}

export interface ParallelExpr {
  kind: "ParallelExpr";
  branches: FlowExpr[];
  modifier?: string; // "all", "any", "2of3", etc.
  loc: Loc;
}

export interface ConditionalExpr {
  kind: "ConditionalExpr";
  condition: Expression;
  then: FlowExpr[];
  elseIfs: { condition: Expression; body: FlowExpr[] }[];
  else?: FlowExpr[];
  loc: Loc;
}

export interface MatchExpr {
  kind: "MatchExpr";
  value: Expression;
  arms: MatchArm[];
  loc: Loc;
}

export interface MatchArm {
  kind: "MatchArm";
  pattern: string; // identifier or "_"
  body: FlowExpr[];
  loc: Loc;
}

export interface LoopExpr {
  kind: "LoopExpr";
  condition: Expression;
  max: number;
  body: FlowExpr[];
  loc: Loc;
}

export interface DelegateExpr {
  kind: "DelegateExpr";
  contract: string;
  bindings: BindingDef[];
  timeout?: string;
  expect?: Expression;
  compensate?: FlowExpr;
  loc: Loc;
}

export interface AsyncExpr {
  kind: "AsyncExpr";
  step: FlowExpr;
  loc: Loc;
}

export interface ExchangeExpr {
  kind: "ExchangeExpr";
  target: string;
  send: string[];
  receive: string[];
  loc: Loc;
}

export interface TransformExpr {
  kind: "TransformExpr";
  input: FlowExpr;
  output: FlowExpr;
  loc: Loc;
}

export interface FlowGroupExpr {
  kind: "FlowGroupExpr";
  expr: FlowExpr;
  loc: Loc;
}
