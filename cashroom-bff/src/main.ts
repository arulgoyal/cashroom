import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { requestLogger } from './common/request-logger';
import { log } from './common/logger';

async function bootstrap() {
  // bodyParser:false — the BFF is a pass-through proxy and must NOT consume the
  // request body stream; http-proxy-middleware pipes it raw to the backend.
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // CORS so the (separate-origin) Vite frontend can call the BFF from the browser.
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });

  // Structured request logging, registered before the router so it observes
  // EVERY request — including ones rejected by guards (429/401).
  app.use(requestLogger());

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  log('info', 'bff_started', {
    port: Number(port),
    backend: process.env.BACKEND_URL ?? 'http://localhost:3000',
  });
}
void bootstrap();
