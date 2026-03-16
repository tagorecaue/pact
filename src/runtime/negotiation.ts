import type { LlmProvider } from "./llm";
import type { EvidenceStore } from "./evidence";
import type { LoadedContract } from "./registry";
import type { NegotiateSection, NegotiateResource, GenericField } from "../parser/ast";

// ── Interfaces ──

export interface Agreement {
  id: string;
  parties: { local: string; remote: string };
  established: string;
  lastRenegotiated: string | null;
  version: number;
  status: "active" | "suspended" | "terminated";
  mappings: FieldMapping[];
  trustLevels: {
    locked: string[];
    negotiable: string[];
    agreed: string[];
  };
  compiledEndpoints: Record<string, string>;
}

export interface FieldMapping {
  operation: string;
  localField: string;
  remoteField: string;
  direction: "outbound" | "inbound";
  transform?: string;
}

export interface Manifest {
  server: string;
  version: string;
  contracts: ManifestContract[];
}

export interface ManifestContract {
  name: string;
  version: string;
  offers: string[];
  accepts: string[];
}

export interface NegotiationProposal {
  need: string;
  myFields: Record<string, string>;
  targetOffer: string;
}

export interface NegotiationResponse {
  agreed: boolean;
  mapping: FieldMapping[];
  endpoint: string;
  reason?: string;
}

// ── Helpers ──

function extractFieldNames(resource: NegotiateResource): string[] {
  const names: string[] = [];
  for (const field of resource.fields) {
    if (field.name === "fields") {
      // Parse value like "[id, customer_id, items, total_cents, status, created_at]"
      const raw = field.value.replace(/^\[/, "").replace(/\]$/, "");
      for (const part of raw.split(",")) {
        const trimmed = part.trim();
        if (trimmed) names.push(trimmed);
      }
    } else if (field.name === "needs" || field.name === "provides") {
      const raw = field.value.replace(/^\[/, "").replace(/\]$/, "");
      for (const part of raw.split(",")) {
        const trimmed = part.trim();
        if (trimmed) names.push(trimmed);
      }
    }
  }
  return names;
}

function extractOperations(resource: NegotiateResource): string[] {
  const ops: string[] = [];
  for (const field of resource.fields) {
    if (field.name === "operations") {
      const raw = field.value.replace(/^\[/, "").replace(/\]$/, "");
      for (const part of raw.split(",")) {
        const trimmed = part.trim();
        if (trimmed) ops.push(trimmed);
      }
    }
  }
  return ops;
}

function getNegotiateSection(contract: LoadedContract): NegotiateSection | null {
  for (const section of contract.ast.sections) {
    if (section.kind === "NegotiateSection") {
      return section;
    }
  }
  return null;
}

// Common field name patterns for deterministic matching
const COMMON_ALIASES: Record<string, string[]> = {
  id: ["id", "identifier", "uid", "key"],
  order_id: ["order_id", "orderId", "orderID"],
  product_id: ["product_id", "productId", "sku", "item_id"],
  quantity: ["quantity", "qty", "qty_available", "amount", "count"],
  available: ["available", "in_stock", "is_available", "qty_available"],
  address: ["address", "destination_address", "shipping_address", "dest_address"],
  tracking_code: ["tracking_code", "tracking", "tracking_number"],
  estimated_delivery: ["estimated_delivery", "eta", "delivery_date"],
  cost_cents: ["cost_cents", "cost", "price_cents", "shipping_cost"],
  weight_grams: ["weight_grams", "weight", "weight_kg"],
  items: ["items", "line_items", "order_items"],
  status: ["status", "state", "fulfillment_status"],
};

function findBestMatch(localField: string, remoteFields: string[]): string | null {
  // Exact match
  if (remoteFields.includes(localField)) return localField;

  // Check known aliases
  for (const [, aliases] of Object.entries(COMMON_ALIASES)) {
    if (aliases.includes(localField)) {
      for (const alias of aliases) {
        if (remoteFields.includes(alias)) return alias;
      }
    }
  }

  // Substring match (e.g., "address" matches "destination_address")
  for (const remote of remoteFields) {
    if (remote.includes(localField) || localField.includes(remote)) {
      return remote;
    }
  }

  return null;
}

// ── NegotiationEngine ──

export class NegotiationEngine {
  private llm: LlmProvider | null;
  private evidence: EvidenceStore;

  constructor(llm: LlmProvider | null, evidence: EvidenceStore) {
    this.llm = llm;
    this.evidence = evidence;
  }

  /**
   * Build manifest from loaded contracts that have @N sections
   */
  buildManifest(contracts: LoadedContract[], serverUrl: string): Manifest {
    const manifestContracts: ManifestContract[] = [];

    for (const contract of contracts) {
      const neg = getNegotiateSection(contract);
      if (!neg) continue;

      manifestContracts.push({
        name: contract.name,
        version: contract.version,
        offers: neg.offers.map((o) => o.name),
        accepts: neg.accepts.map((a) => a.name),
      });
    }

    return {
      server: serverUrl,
      version: "1.0.0",
      contracts: manifestContracts,
    };
  }

  /**
   * Propose a negotiation to a remote server.
   * Reads local contract's @N accepts to find what it needs,
   * matches against remote manifest's offers.
   */
  async negotiate(
    localContract: LoadedContract,
    remoteManifest: Manifest,
    remoteUrl: string,
  ): Promise<Agreement> {
    const localNeg = getNegotiateSection(localContract);
    if (!localNeg) {
      throw new Error(`Contract "${localContract.name}" has no @N section`);
    }

    const now = new Date().toISOString();
    const allMappings: FieldMapping[] = [];
    const compiledEndpoints: Record<string, string> = {};

    // For each thing we accept (need), find a matching offer in the remote
    for (const accept of localNeg.accepts) {
      const localNeeds = extractFieldNames(accept).filter((f) => {
        // "needs" fields are what we need from the remote
        const needsField = accept.fields.find((ff) => ff.name === "needs");
        if (!needsField) return true;
        const needsList = needsField.value.replace(/^\[/, "").replace(/\]$/, "").split(",").map((s) => s.trim());
        return needsList.includes(f);
      });

      const localProvides = accept.fields
        .filter((f) => f.name === "provides")
        .flatMap((f) => f.value.replace(/^\[/, "").replace(/\]$/, "").split(",").map((s) => s.trim()).filter(Boolean));

      // Find matching remote contract
      let remoteOffer: NegotiateResource | null = null;
      let remoteContractName: string | null = null;

      for (const rc of remoteManifest.contracts) {
        if (rc.offers.includes(accept.name)) {
          remoteContractName = rc.name;
          // We need the full offer details via the negotiate endpoint
          break;
        }
      }

      if (!remoteContractName) continue;

      // Try to negotiate this specific resource via POST /.pact/negotiate
      const proposal: NegotiationProposal = {
        need: accept.name,
        myFields: {},
        targetOffer: accept.name,
      };

      // Collect needs
      const needsField = accept.fields.find((f) => f.name === "needs");
      if (needsField) {
        const needsList = needsField.value.replace(/^\[/, "").replace(/\]$/, "").split(",").map((s) => s.trim()).filter(Boolean);
        for (const n of needsList) {
          proposal.myFields[n] = "string"; // simplified type
        }
      }

      try {
        const res = await fetch(`${remoteUrl}/.pact/negotiate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(proposal),
        });
        const response = (await res.json()) as NegotiationResponse;

        if (response.agreed) {
          allMappings.push(...response.mapping);
          compiledEndpoints[accept.name] = response.endpoint;
        }
      } catch {
        // Remote negotiation failed — try deterministic matching
        // This is a fallback when we can't reach the remote negotiate endpoint
      }
    }

    // Also handle what we offer — create inbound mappings for what the remote accepts
    for (const offer of localNeg.offers) {
      const offerFields = extractFieldNames(offer);
      const offerOps = extractOperations(offer);

      for (const rc of remoteManifest.contracts) {
        if (rc.accepts.includes(offer.name)) {
          // The remote accepts what we offer — create inbound mapping
          for (const field of offerFields) {
            allMappings.push({
              operation: offer.name,
              localField: field,
              remoteField: field,
              direction: "inbound",
            });
          }
          compiledEndpoints[`inbound:${offer.name}`] = `${remoteUrl}/.pact/data/${offer.name}`;
        }
      }
    }

    // Build trust levels
    const agreedTrust: string[] = [];
    for (const item of localNeg.trustLevels.negotiable) {
      agreedTrust.push(item);
    }

    const agreement: Agreement = {
      id: crypto.randomUUID(),
      parties: {
        local: localContract.name,
        remote: remoteManifest.server,
      },
      established: now,
      lastRenegotiated: null,
      version: 1,
      status: "active",
      mappings: allMappings,
      trustLevels: {
        locked: [...localNeg.trustLevels.locked],
        negotiable: [...localNeg.trustLevels.negotiable],
        agreed: agreedTrust,
      },
      compiledEndpoints,
    };

    // Record in evidence
    this.evidence.record({
      contract_id: localContract.name,
      request_id: agreement.id,
      step_name: "negotiation",
      action: "agreement_established",
      input: JSON.stringify({ remote: remoteUrl, manifest: remoteManifest }),
      output: JSON.stringify(agreement),
      duration_ms: 0,
      timestamp: now,
      status: "success",
    });

    return agreement;
  }

  /**
   * Handle an incoming negotiation proposal (this server is the responder).
   */
  async handleProposal(
    proposal: NegotiationProposal,
    localContracts: LoadedContract[],
  ): Promise<NegotiationResponse> {
    // Find a local contract that offers what the proposer needs
    let matchedOffer: NegotiateResource | null = null;
    let matchedContract: LoadedContract | null = null;

    for (const contract of localContracts) {
      const neg = getNegotiateSection(contract);
      if (!neg) continue;

      for (const offer of neg.offers) {
        if (offer.name === proposal.targetOffer) {
          matchedOffer = offer;
          matchedContract = contract;
          break;
        }
      }
      if (matchedOffer) break;
    }

    if (!matchedOffer || !matchedContract) {
      return {
        agreed: false,
        mapping: [],
        endpoint: "",
        reason: `No offer found for "${proposal.targetOffer}"`,
      };
    }

    const offerFields = extractFieldNames(matchedOffer);
    const offerOps = extractOperations(matchedOffer);
    const proposerFields = Object.keys(proposal.myFields);

    // Generate field mappings
    let mappings: FieldMapping[];

    if (this.llm && this.llm.isAvailable()) {
      mappings = await this.generateLlmMappings(
        proposal,
        matchedOffer,
        offerFields,
        proposerFields,
      );
    } else {
      mappings = this.generateDeterministicMappings(
        proposal,
        matchedOffer,
        offerFields,
        proposerFields,
      );
    }

    return {
      agreed: true,
      mapping: mappings,
      endpoint: `/.pact/data/${matchedOffer.name}`,
    };
  }

  /**
   * Renegotiate after a change.
   */
  async renegotiate(
    existingAgreement: Agreement,
    changes: { field: string; oldValue: string; newValue: string }[],
  ): Promise<Agreement> {
    const now = new Date().toISOString();

    // Update mappings affected by changes
    const updatedMappings = existingAgreement.mappings.map((m) => {
      const change = changes.find(
        (ch) => ch.field === m.remoteField || ch.field === m.localField,
      );
      if (change) {
        return {
          ...m,
          remoteField: change.newValue || m.remoteField,
          transform: `renegotiated:${change.oldValue}->${change.newValue}`,
        };
      }
      return m;
    });

    const updated: Agreement = {
      ...existingAgreement,
      lastRenegotiated: now,
      version: existingAgreement.version + 1,
      mappings: updatedMappings,
    };

    this.evidence.record({
      contract_id: existingAgreement.parties.local,
      request_id: existingAgreement.id,
      step_name: "renegotiation",
      action: "agreement_renegotiated",
      input: JSON.stringify({ changes }),
      output: JSON.stringify(updated),
      duration_ms: 0,
      timestamp: now,
      status: "success",
    });

    return updated;
  }

  // ── Private helpers ──

  private generateDeterministicMappings(
    proposal: NegotiationProposal,
    offer: NegotiateResource,
    offerFields: string[],
    proposerFields: string[],
  ): FieldMapping[] {
    const mappings: FieldMapping[] = [];

    for (const needed of proposerFields) {
      const match = findBestMatch(needed, offerFields);
      if (match) {
        mappings.push({
          operation: proposal.need,
          localField: needed,
          remoteField: match,
          direction: "outbound",
          transform: needed !== match ? `rename:${match}->${needed}` : undefined,
        });
      }
    }

    return mappings;
  }

  private async generateLlmMappings(
    proposal: NegotiationProposal,
    offer: NegotiateResource,
    offerFields: string[],
    proposerFields: string[],
  ): Promise<FieldMapping[]> {
    if (!this.llm) {
      return this.generateDeterministicMappings(proposal, offer, offerFields, proposerFields);
    }

    const prompt = `You are a field mapping engine. Given these two schemas, generate a JSON array of field mappings.

PROPOSER needs these fields: ${JSON.stringify(proposerFields)}
OFFER has these fields: ${JSON.stringify(offerFields)}
Operation: ${proposal.need}

Return ONLY a JSON array like:
[{"localField":"proposer_field","remoteField":"offer_field","transform":"optional_transform"}]

Match fields by semantic meaning. If a field has no match, skip it.`;

    try {
      const response = await this.llm.complete(prompt, 512);
      const jsonMatch = response.text.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{
          localField: string;
          remoteField: string;
          transform?: string;
        }>;

        return parsed.map((m) => ({
          operation: proposal.need,
          localField: m.localField,
          remoteField: m.remoteField,
          direction: "outbound" as const,
          transform: m.transform,
        }));
      }
    } catch {
      // Fall back to deterministic
    }

    return this.generateDeterministicMappings(proposal, offer, offerFields, proposerFields);
  }
}
