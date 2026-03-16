import { readFileSync, existsSync } from "fs";
import { join } from "path";

/**
 * Load a .env file into process.env.
 * Does NOT override existing environment variables.
 */
export function loadEnvFile(filePath?: string): void {
  const resolvedPath = filePath ?? join(process.cwd(), ".env");

  if (!existsSync(resolvedPath)) {
    return; // Silently skip if no .env file
  }

  let content: string;
  try {
    content = readFileSync(resolvedPath, "utf-8");
  } catch {
    return; // Silently skip if file can't be read
  }

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Match KEY=VALUE (with optional quotes around value)
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Strip surrounding quotes (double or single)
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Don't override existing env vars
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * Resolve env: references in a string value.
 *
 * If value starts with "env:", resolve to process.env[rest].
 * e.g., "env:TELEGRAM_BOT_TOKEN" -> process.env.TELEGRAM_BOT_TOKEN
 *
 * If the env var is not set, returns the original string and logs a warning.
 * If value doesn't start with "env:", returns as-is.
 */
export function resolveEnv(value: string): string {
  if (!value.startsWith("env:")) {
    return value;
  }

  const envVar = value.slice(4);
  const resolved = process.env[envVar];

  if (resolved === undefined) {
    console.warn(`[pact] env var not set: ${envVar} (from "${value}")`);
    return value;
  }

  return resolved;
}
