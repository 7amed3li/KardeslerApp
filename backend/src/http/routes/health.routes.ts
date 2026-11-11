import type { FastifyInstance } from 'fastify';
import type { DbHealthPort } from '../../ports/repositories.js';
import { DomainError } from '../../domain/errors.js';

export function registerHealthRoutes(
  app: FastifyInstance,
  dbHealth: DbHealthPort,
  nodeEnv: string,
): void {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'kardesler-backend',
    timestamp: new Date().toISOString(),
  }));

  app.get('/healthz', async () => ({
    status: 'ok',
    service: 'kardesler-backend',
    timestamp: new Date().toISOString(),
  }));

  app.get('/readyz', async (_request, reply) => {
    try {
      const posture = await dbHealth.verifyPosture();
      return reply.status(200).send({
        status: 'ready',
        dbRoles: { api: posture.api.roleName, readonly: posture.readonly.roleName },
        securityPosture: {
          api: {
            isSuperuser: posture.api.isSuperuser,
            bypassRls: posture.api.bypassRls,
            ownedPublicTables: posture.api.ownedPublicTables,
          },
          readonly: {
            isSuperuser: posture.readonly.isSuperuser,
            bypassRls: posture.readonly.bypassRls,
            ownedPublicTables: posture.readonly.ownedPublicTables,
          },
        },
      });
    } catch {
      return reply.status(503).send({ status: 'not_ready' });
    }
  });

  app.get('/docs', async (_request, reply) => {
    if (nodeEnv === 'production') {
      throw new DomainError('NOT_FOUND', 404, 'Not found');
    }
    return reply.status(200).send(app.swagger());
  });
}
