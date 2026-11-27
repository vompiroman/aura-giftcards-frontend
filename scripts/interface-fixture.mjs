import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

export const orderReference = "ORD-UI-TEST-42";
export const auditReference = "AUDIT-" + "referenceLongue".repeat(18) + "-آخر-123";

const user = {
  id: "aura-ui-test",
  email: "client@example.test",
  is_admin: true,
  user_metadata: { first_name: "Camille", last_name: "Test", phone: "+213555010100" },
};
const order = {
  order_id: orderReference,
  payment_status: "paid",
  status: "active",
  amount: 600,
  total: 600,
  created_at: "2026-11-20T12:00:00Z",
  customer_email: user.email,
  items: [{ name: "Netflix Premium 1 mois", service: "Netflix", quantity: 1, price: 600 }],
};
const inventory = [{
  id: "stock-ui-test",
  service: "Netflix",
  account_email: "stream@example.test",
  profile_name: "Profil fictif",
  profile_pin: "0000",
  is_used: false,
  created_at: order.created_at,
}];

const fixtures = {
  "/api/healthz": {},
  "/api/partner/config": { enabled: true },
  "/api/partner": { partner_status: "NONE" },
  "/api/admin/security": { verified: true, factors: [] },
  "/api/admin/dashboard": {},
  "/api/admin/all-orders": { orders: [order], total: 1, total_pages: 1 },
  "/api/admin/audit-logs": { events: [{ action: "ORDER_STATUS_UPDATED", target_type: "order", target_id: auditReference, created_at: order.created_at }] },
  "/api/admin/inventory": { inventory },
  "/api/admin/inventory/stock-ui-test/assignment-options": { orders: [order] },
  "/api/admin/partner-applications": { applications: [] },
  "/api/admin/partner/support": { tickets: [] },
  "/api/admin/promo-codes": { promo_codes: [] },
  "/api/my-orders": { orders: [order] },
  "/api/update-profile": { user },
};

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

export async function startInterfaceServer({ root = "dist", port = 0, authenticated = true } = {}) {
  const base = resolve(root);
  const assets = new Map();
  const apiRequests = [];
  const server = createServer(async (request, response) => {
    try {
      const { pathname, search } = new URL(request.url, "http://127.0.0.1");
      if (pathname.startsWith("/api/")) {
        apiRequests.push({ method: request.method, pathname, search });
        const fixture = pathname === "/api/session"
          ? authenticated ? { authenticated, user } : { authenticated }
          : fixtures[pathname];
        response.writeHead(fixture ? 200 : 404, { "Content-Type": "application/json" });
        response.end(JSON.stringify(fixture || { message: "Fixture unavailable" }));
        return;
      }
      const localPath = decodeURIComponent(pathname).replace(/^\/+/,"").replace(/\/$/, "");
      const path = resolve(base, extname(localPath) ? localPath : resolve(base, localPath, "index.html"));
      const fromRoot = relative(base, path);
      if (fromRoot === ".." || fromRoot.startsWith(".." + sep)) {
        response.writeHead(404).end();
        return;
      }
      if (!assets.has(path)) {
        const bytes = await readFile(path);
        const type = contentTypes[extname(path)] || "application/octet-stream";
        assets.set(path, { bytes, type, gzip: /^(text|application\/json|image\/svg)/.test(type) ? gzipSync(bytes) : null });
      }
      const { bytes, type, gzip } = assets.get(path);
      const compress = gzip && request.headers["accept-encoding"]?.includes("gzip");
      response.writeHead(200, {
        "Content-Type": type,
        ...(compress && { "Content-Encoding": "gzip", Vary: "Accept-Encoding" }),
      });
      response.end(compress ? gzip : bytes);
    } catch {
      response.writeHead(404).end();
    }
  });

  await new Promise((connected, rejected) => {
    server.once("error", rejected);
    server.listen(port, "127.0.0.1", connected);
  });
  return {
    origin: "http://127.0.0.1:" + server.address().port,
    apiRequests,
    close: () => new Promise((closed, rejected) => server.close(error => error ? rejected(error) : closed())),
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const server = await startInterfaceServer({
    root: process.argv[2] || "dist",
    port: Number(process.argv[3] || 0),
    authenticated: process.argv[4] === "--authenticated",
  });
  console.log(server.origin);
}
