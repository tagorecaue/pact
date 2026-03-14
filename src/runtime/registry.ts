import { readFileSync, readdirSync } from "fs";
import { join, extname } from "path";
import { parse } from "../index";
import type {
  PactFile,
  ContractSection,
  IntentSection,
  EntitiesSection,
  ConstraintsSection,
  ExecutionSection,
  TriggersSection,
  FallbacksSection,
  DependenciesSection,
  EvidenceSection,
} from "../parser/ast";

export interface LoadedContract {
  name: string;
  version: string;
  domain?: string;
  filePath: string;
  ast: PactFile;
  sections: {
    contract: ContractSection;
    intent?: IntentSection;
    entities?: EntitiesSection;
    constraints?: ConstraintsSection;
    execution?: ExecutionSection;
    triggers?: TriggersSection;
    fallbacks?: FallbacksSection;
    dependencies?: DependenciesSection;
    evidence?: EvidenceSection;
  };
}

export class ContractRegistry {
  private byName: Map<string, LoadedContract> = new Map();
  // Key: "METHOD /path" (uppercase method), e.g. "GET /users"
  private byRoute: Map<string, LoadedContract> = new Map();

  loadFile(filePath: string): void {
    const source = readFileSync(filePath, "utf-8");
    const ast = parse(source);

    const contractSection = ast.sections.find(
      (s): s is ContractSection => s.kind === "ContractSection"
    );
    if (!contractSection) {
      throw new Error(
        `No @C (ContractSection) found in ${filePath}`
      );
    }

    const name = contractSection.name;

    if (this.byName.has(name)) {
      const existing = this.byName.get(name)!;
      throw new Error(
        `Duplicate contract name "${name}": already loaded from ${existing.filePath}, cannot load from ${filePath}`
      );
    }

    const loaded: LoadedContract = {
      name,
      version: contractSection.version,
      domain: contractSection.domain,
      filePath,
      ast,
      sections: buildSections(ast, contractSection),
    };

    this.byName.set(name, loaded);
    this.indexRoutes(loaded);
  }

  loadDirectory(dirPath: string): void {
    const entries = readdirSync(dirPath);
    for (const entry of entries) {
      if (extname(entry) === ".pact") {
        this.loadFile(join(dirPath, entry));
      }
    }
  }

  getByName(name: string): LoadedContract | undefined {
    return this.byName.get(name);
  }

  getByRoute(method: string, path: string): LoadedContract | undefined {
    const key = `${method.toUpperCase()} ${path}`;
    return this.byRoute.get(key);
  }

  getAll(): LoadedContract[] {
    return Array.from(this.byName.values());
  }

  resolve(name: string): LoadedContract {
    const contract = this.byName.get(name);
    if (!contract) {
      throw new Error(
        `Contract "${name}" not found in registry. Loaded: [${Array.from(this.byName.keys()).join(", ")}]`
      );
    }
    return contract;
  }

  private indexRoutes(loaded: LoadedContract): void {
    const triggers = loaded.sections.triggers;
    if (!triggers) return;

    for (const trigger of triggers.triggers) {
      if (trigger.type === "http" && trigger.args.length >= 2) {
        const method = trigger.args[0].toUpperCase();
        const path = trigger.args[1];
        const key = `${method} ${path}`;
        this.byRoute.set(key, loaded);
      }
    }
  }
}

function buildSections(
  ast: PactFile,
  contractSection: ContractSection
): LoadedContract["sections"] {
  const sections: LoadedContract["sections"] = { contract: contractSection };

  for (const s of ast.sections) {
    switch (s.kind) {
      case "IntentSection":
        sections.intent = s;
        break;
      case "EntitiesSection":
        sections.entities = s;
        break;
      case "ConstraintsSection":
        sections.constraints = s;
        break;
      case "ExecutionSection":
        sections.execution = s;
        break;
      case "TriggersSection":
        sections.triggers = s;
        break;
      case "FallbacksSection":
        sections.fallbacks = s;
        break;
      case "DependenciesSection":
        sections.dependencies = s;
        break;
      case "EvidenceSection":
        sections.evidence = s;
        break;
    }
  }

  return sections;
}
