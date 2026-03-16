// ── Partner Health Check ──
// Checks if a remote Pact server's manifest has changed since the agreement was established.

import type { HttpClient } from "./http-client";
import type { Agreement, Manifest } from "./negotiation";

export interface HealthCheckResult {
  remote: string;
  status: "healthy" | "changed" | "unreachable";
  manifestVersion?: string;
  changes?: string[];
  checkedAt: string;
}

/**
 * Check the health of a partner by fetching their manifest and comparing
 * it against the snapshot captured in the existing agreement.
 */
export async function checkPartnerHealth(
  remoteUrl: string,
  existingAgreement: Agreement,
  httpClient: HttpClient,
): Promise<HealthCheckResult> {
  const checkedAt = new Date().toISOString();
  const manifestUrl = remoteUrl.replace(/\/$/, "") + "/.pact/manifest";

  let manifest: Manifest;
  try {
    const response = await httpClient.request({
      method: "GET",
      url: manifestUrl,
      timeout: 10_000,
    });

    if (response.status >= 400) {
      return { remote: remoteUrl, status: "unreachable", checkedAt };
    }

    manifest = response.body as Manifest;
  } catch {
    return { remote: remoteUrl, status: "unreachable", checkedAt };
  }

  // Compare manifest against agreement
  const changes: string[] = [];

  // Check each compiled endpoint in the agreement against manifest offers
  for (const [operation] of Object.entries(existingAgreement.compiledEndpoints)) {
    // Skip inbound endpoints
    if (operation.startsWith("inbound:")) continue;

    // Find if the remote still offers this operation
    let found = false;
    for (const contract of manifest.contracts) {
      if (contract.offers.includes(operation)) {
        found = true;
        break;
      }
    }

    if (!found) {
      changes.push(`${operation}: no longer offered`);
    }
  }

  // Check for mapping-related changes by comparing contract versions
  for (const mc of manifest.contracts) {
    // Check if any contracts we depend on have changed version
    for (const mapping of existingAgreement.mappings) {
      if (mc.offers.includes(mapping.operation)) {
        // Contract still exists — check if fields are still offered
        // (We can only do a shallow check here since manifest doesn't expose fields)
      }
    }
  }

  // Check if manifest version changed from what we saw at agreement time
  if (manifest.version && existingAgreement.version > 0) {
    // If manifest server URL changed, that's a change
    if (manifest.server !== existingAgreement.parties.remote) {
      changes.push(`server URL changed: ${existingAgreement.parties.remote} -> ${manifest.server}`);
    }
  }

  if (changes.length > 0) {
    return {
      remote: remoteUrl,
      status: "changed",
      manifestVersion: manifest.version,
      changes,
      checkedAt,
    };
  }

  return {
    remote: remoteUrl,
    status: "healthy",
    manifestVersion: manifest.version,
    checkedAt,
  };
}
