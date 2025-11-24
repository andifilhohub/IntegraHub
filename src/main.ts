import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import * as express from 'express';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.setGlobalPrefix('v1');
  app.useLogger(app.get(Logger));
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('IntegraHub API Gateway')
    .setDescription('Recebe cargas do ERP InovaFarma e expõe endpoints para o ecossistema GeniusCloud/Chatwoot.')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') ?? 3002;
  await app.listen(port);
  app.get(Logger).log(`IntegraHub pronto para tráfego na porta ${port}`);
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Falha ao iniciar a aplicação:', error);
  process.exit(1);
});
