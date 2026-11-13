import fs from 'node:fs';
import path from 'node:path';
import { createHttpServer } from '../http/server.js';
import { HttpAuthHooks } from '../http/auth-hooks.js';
import { JoseTokenService } from '../infrastructure/security/jose-token.service.js';
import { InMemoryRevokedTokenStore } from '../infrastructure/redis/in-memory-adapters.js';

interface OpenApiSpec {
  openapi: string;
  info: { title: string; version: string };
  paths?: Record<string, Record<string, { summary?: string; description?: string; tags?: string[]; requestBody?: unknown; responses?: Record<string, unknown> }>>;
}

function formatEndpointRow(method: string, routePath: string, op: Record<string, any>): string {
  const hasBody = op.requestBody ? 'Yes' : 'No';
  const hasParams = routePath.includes(':') || routePath.includes('{') ? 'Yes' : 'No';
  const auth = inferAuthBadge(routePath);
  return `| \`${method.toUpperCase()}\` | \`${routePath}\` | ${auth} | ${hasBody} | ${hasParams} |`;
}

function inferAuthBadge(routePath: string): string {
  if (routePath.startsWith('/health') || routePath === '/readyz' || routePath === '/docs') return 'public';
  if (routePath.startsWith('/api/v1/auth/staff/totp/')) return 'totp_setup JWT';
  if (
    routePath === '/api/v1/auth/customer/google/link' ||
    routePath.startsWith('/api/v1/auth/customer/identities')
  ) {
    return 'customer JWT';
  }
  if (routePath.startsWith('/api/v1/auth/') || routePath === '/api/v1/menu' || routePath === '/api/v1/banners' || routePath === '/api/v1/settings/public' || routePath === '/api/v1/delivery/check' || routePath === '/api/v1/orders/quote' || routePath === '/api/v1/cart/price') {
    return routePath.endsWith('/logout') ? 'customer JWT' : 'public';
  }
  if (routePath === '/api/v1/payments/webhook') return 'HMAC-SHA256';
  if (routePath.startsWith('/api/v1/print-agent/jobs/')) return 'print_agent JWT';
  if (routePath.startsWith('/api/v1/admin/') || routePath.startsWith('/api/v1/print-agent/token')) return 'owner JWT';
  if (routePath.startsWith('/api/v1/staff/') || routePath === '/api/v1/orders/:id/status' || routePath === '/api/v1/realtime/staff' || routePath === '/api/v1/heartbeats') return 'staff/owner JWT';
  return 'customer JWT';
}

function buildMarkdownFromSpec(spec: OpenApiSpec): string {
  const paths = spec.paths ?? {};
  const lines: string[] = [
    `# ${spec.info.title} (${spec.info.version})`,
    '',
    `> Generated automatically from live Fastify + Zod OpenAPI \`${spec.openapi}\` schema (\`GET /docs\`). Do not edit manually; run \`pnpm --filter @kardesler/backend docs:generate\`.`,
    '',
    '## Endpoints',
    '',
    '| Method | Path | Auth | Request Schema | Path Params |',
    '|--------|------|------|----------------|-------------|',
  ];

  let count = 0;
  for (const [rawPath, methods] of Object.entries(paths)) {
    const expressPath = rawPath.replace(/\{([^}]+)\}/g, ':$1');
    for (const [method, op] of Object.entries(methods)) {
      if (['head', 'options'].includes(method.toLowerCase())) continue;
      count++;
      lines.push(formatEndpointRow(method, expressPath, op ?? {}));
    }
  }

  lines.push('', `Total live documented operations: **${count}**`, '');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const tokens = new JoseTokenService({
    activeKid: 'doc',
    customerSecret: 'doc_customer_secret_minimum_32_bytes!',
    staffSecret: 'doc_staff_secret_minimum_32_bytes_!!',
    printSecret: 'doc_print_secret_minimum_32_bytes_!!',
  });
  const stub: any = {};
  const app = createHttpServer({
    nodeEnv: 'test',
    adminOrigin: 'http://localhost:5173',
    dbHealth: stub,
    authHooks: new HttpAuthHooks(tokens, new InMemoryRevokedTokenStore()),
    auth: stub,
    users: stub,
    menu: stub,
    orders: stub,
    payments: stub,
    loyalty: stub,
    printRt: stub,
    admin: stub,
  });

  await app.ready();
  const spec = (app as unknown as { swagger(): OpenApiSpec }).swagger();
  await app.close();

  const jsonIdx = process.argv.indexOf('--json');
  if (jsonIdx !== -1 && process.argv[jsonIdx + 1]) {
    const jsonOutPath = path.resolve(process.cwd(), process.argv[jsonIdx + 1]);
    fs.mkdirSync(path.dirname(jsonOutPath), { recursive: true });
    fs.writeFileSync(jsonOutPath, JSON.stringify(spec, null, 2) + '\n', 'utf8');
    console.log(`Wrote OpenAPI JSON spec to ${jsonOutPath}`);
    return;
  }

  const md = buildMarkdownFromSpec(spec);
  const outPath = path.resolve(process.cwd(), '../docs/api.md');
  fs.writeFileSync(outPath, md, 'utf8');
  console.log(`Wrote OpenAPI-derived docs to ${outPath}`);
}

void main();

