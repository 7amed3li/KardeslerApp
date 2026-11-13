import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const mobileRoot = resolve(import.meta.dirname, '..');
const backendRoot = resolve(mobileRoot, '..', 'backend');
const committedOpenApiPath = join(mobileRoot, 'src/api/generated/openapi.json');
const committedTypesPath = join(mobileRoot, 'src/api/generated/schema.d.ts');

const tmpDir = mkdtempSync(join(tmpdir(), 'kardesler-contract-'));
try {
  const tmpOpenApiPath = join(tmpDir, 'openapi.json');
  const tmpTypesPath = join(tmpDir, 'schema.d.ts');

  execSync(`pnpm -C "${backendRoot}" exec tsx src/scripts/generate-api-docs.ts --json "${tmpOpenApiPath}"`, {
    stdio: 'pipe',
  });
  execSync(`pnpm -C "${mobileRoot}" exec openapi-typescript "${tmpOpenApiPath}" -o "${tmpTypesPath}"`, {
    stdio: 'pipe',
  });

  const committedOpenApi = readFileSync(committedOpenApiPath, 'utf8').replace(/\r\n/g, '\n');
  const freshOpenApi = readFileSync(tmpOpenApiPath, 'utf8').replace(/\r\n/g, '\n');
  if (committedOpenApi !== freshOpenApi) {
    console.error('Contract drift detected in mobile/src/api/generated/openapi.json! Run `pnpm -C mobile gen:api`.');
    process.exit(1);
  }

  const committedTypes = readFileSync(committedTypesPath, 'utf8').replace(/\r\n/g, '\n');
  const freshTypes = readFileSync(tmpTypesPath, 'utf8').replace(/\r\n/g, '\n');
  if (committedTypes !== freshTypes) {
    console.error('Contract drift detected in mobile/src/api/generated/schema.d.ts! Run `pnpm -C mobile gen:api`.');
    process.exit(1);
  }

  console.log('OpenAPI contract & generated TypeScript types are up-to-date.');
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

