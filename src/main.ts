import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import * as express from 'express';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  
  // Enable CORS for the domain
  app.enableCors({
    origin: [
      'http://localhost:3002',
      'http://localhost:3000',
      'https://integrahub.geniuscloud.com.br',
      'http://integrahub.geniuscloud.com.br',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Inova-Signature', 'X-Inova-Timestamp', 'X-Inova-Load-Type'],
  });
  
  app.setGlobalPrefix('v1', {
    exclude: ['/'],
  });
  app.useLogger(app.get(Logger));
  
  // Serve static files from public directory (in production and development)
  const publicPath = process.env.NODE_ENV === 'production' 
    ? join(__dirname, '..', 'public')
    : join(process.cwd(), 'public');
  
  app.useStaticAssets(publicPath, {
    prefix: '/',
    index: false,
  });
  
  // Aumentar limite de payload para 50MB (para aceitar grandes volumes de produtos)
  app.use(
    express.json({
      limit: '50mb',
      verify: (req, _res, buf) => {
        (req as { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  
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
