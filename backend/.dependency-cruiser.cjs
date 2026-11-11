/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-must-be-pure',
      severity: 'error',
      comment:
        'domain/ imports nothing from http, application, infrastructure, ports, config, fastify, drizzle, postgres, ioredis, bullmq, jose, otplib, or argon2.',
      from: { path: '^src/domain/' },
      to: {
        path: '^(src/(http|application|infrastructure|ports|config|db|common|modules|jobs|composition-root|main))|node_modules/(fastify|drizzle-orm|postgres|ioredis|bullmq|jose|otplib|argon2|jsonwebtoken)',
      },
    },
    {
      name: 'ports-no-concrete-layers',
      severity: 'error',
      comment: 'ports/ may reference domain types and @kardesler/shared only.',
      from: { path: '^src/ports/' },
      to: {
        path: '^src/(http|application|infrastructure|config|db|composition-root|main)',
      },
    },
    {
      name: 'application-only-domain-and-ports',
      severity: 'error',
      comment: 'application/ may only import domain/, ports/, and @kardesler/shared — never infrastructure/ or http/.',
      from: { path: '^src/application/' },
      to: {
        path: '^(src/(http|infrastructure|config|db|composition-root|main))|node_modules/(fastify|drizzle-orm|postgres|ioredis|bullmq)',
      },
    },
    {
      name: 'http-no-infrastructure-or-db',
      severity: 'error',
      comment: 'http/ imports application/ and Zod DTO schemas only — never infrastructure/ or SQL/DB.',
      from: { path: '^src/http/' },
      to: {
        path: '^(src/(infrastructure|db|composition-root))|node_modules/(drizzle-orm|postgres|ioredis|bullmq)',
      },
    },
    {
      name: 'db-client-only-in-repositories-and-composition-root',
      severity: 'error',
      comment: 'Raw DB clients and Drizzle live only inside infrastructure/db and infrastructure/repositories (plus composition-root).',
      from: {
        path: '^src/',
        pathNot: '^(src/infrastructure/(repositories|db|jobs)/|src/composition-root\\.ts)',
      },
      to: {
        path: '^(src/infrastructure/db/|node_modules/(drizzle-orm|postgres))',
      },
    },
    {
      name: 'no-circular-dependencies',
      severity: 'error',
      from: { path: '^src/' },
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['types', 'import', 'default'],
    },
  },
};
