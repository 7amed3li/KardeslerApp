import { env } from './config/env.js';
import { createAppContainer } from './composition-root.js';

async function bootstrap(): Promise<void> {
  const container = createAppContainer();
  try {
    await container.verifyStartup();
    await container.jobQueue?.start();
    const address = await container.app.listen({ port: env.PORT, host: env.HOST });
    console.log(`Kardeşler Cihangir Backend API running at ${address}`);
  } catch (err) {
    container.app.log.fatal({ err }, 'Startup failed');
    await container.shutdown();
    process.exit(1);
  }

  const onSignal = async () => {
    await container.shutdown();
    process.exit(0);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
}

void bootstrap();
