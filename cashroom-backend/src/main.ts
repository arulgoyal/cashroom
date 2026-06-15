import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Validate every request body against its DTO before the controller runs.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // drop properties that have no validation decorator
      forbidNonWhitelisted: true, // 400 if the client sends unknown fields
      transform: true, // hand the controller a real DTO instance
    }),
  );

  // One declarative error boundary: clean responses to clients, full logs server-side.
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
