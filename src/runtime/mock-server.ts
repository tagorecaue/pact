// ── Mock API Server for Self-Healing Demos ──
// Phase 5: Simulates an external API that can change its schema at runtime.

export interface MockProduct {
  id: number;
  name: string;
  [key: string]: unknown;
}

// Schema v1: { id, name, price, in_stock }
const PRODUCTS_V1: MockProduct[] = [
  { id: 1, name: "Widget A", price: 1999, in_stock: true },
  { id: 2, name: "Widget B", price: 2499, in_stock: false },
  { id: 3, name: "Gadget C", price: 4999, in_stock: true },
];

// Schema v2: { id, name, price_cents, currency, available }
const PRODUCTS_V2: MockProduct[] = [
  { id: 1, name: "Widget A", price_cents: 1999, currency: "USD", available: true },
  { id: 2, name: "Widget B", price_cents: 2499, currency: "USD", available: false },
  { id: 3, name: "Gadget C", price_cents: 4999, currency: "EUR", available: true },
];

export type SchemaVersion = "v1" | "v2";

export interface MockServerHandle {
  server: ReturnType<typeof Bun.serve>;
  switchSchema: () => void;
  getSchemaVersion: () => SchemaVersion;
  stop: () => void;
}

/**
 * Start a mock API server with configurable schema versioning.
 *
 * Endpoints:
 *   GET  /api/products           — returns product list (schema depends on current version)
 *   POST /api/products           — same as GET (for exchange compatibility)
 *   POST /api/products/switch-schema — toggle between v1 and v2
 *   GET  /api/products/schema-version — returns current schema version
 */
export function startMockServer(port: number = 4000): MockServerHandle {
  let schemaVersion: SchemaVersion = "v1";

  const switchSchema = () => {
    schemaVersion = schemaVersion === "v1" ? "v2" : "v1";
  };

  const getSchemaVersion = () => schemaVersion;

  const getProducts = (): MockProduct[] => {
    return schemaVersion === "v1" ? PRODUCTS_V1 : PRODUCTS_V2;
  };

  const server = Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;
      const method = req.method;

      // GET /api/products — return products in current schema
      if (path === "/api/products" && (method === "GET" || method === "POST")) {
        return Response.json(getProducts(), {
          headers: {
            "x-schema-version": schemaVersion,
          },
        });
      }

      // POST /api/products/switch-schema — toggle schema version
      if (path === "/api/products/switch-schema" && method === "POST") {
        const oldVersion = schemaVersion;
        switchSchema();
        return Response.json({
          switched: true,
          from: oldVersion,
          to: schemaVersion,
        });
      }

      // GET /api/products/schema-version — check current version
      if (path === "/api/products/schema-version" && method === "GET") {
        return Response.json({
          version: schemaVersion,
          fields: schemaVersion === "v1"
            ? ["id", "name", "price", "in_stock"]
            : ["id", "name", "price_cents", "currency", "available"],
        });
      }

      // 404 for anything else
      return Response.json({ error: "Not found" }, { status: 404 });
    },
  });

  const stop = () => {
    server.stop(true);
  };

  return { server, switchSchema, getSchemaVersion, stop };
}
