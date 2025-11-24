import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';

@Injectable()
export class HmacGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    const signatureHeader = request.header('X-Inova-Signature');
    const timestampHeader = request.header('X-Inova-Timestamp');

    if (!signatureHeader || !timestampHeader) {
      throw new UnauthorizedException('Cabeçalhos obrigatórios ausentes');
    }

    const timestamp = Number(timestampHeader);
    if (Number.isNaN(timestamp)) {
      throw new BadRequestException('Timestamp inválido');
    }

    const now = Date.now();
    const windowMs = this.configService.get<number>('HMAC_TIME_WINDOW_MS', 300000);
    if (Math.abs(now - timestamp) > windowMs) {
      throw new ForbiddenException('Timestamp fora da janela permitida');
    }

    const rawBody = request.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Corpo cru ausente para validação');
    }

    const secret = this.configService.get<string>('INOVA_SECRET');
    if (!secret) {
      throw new InternalServerErrorException('Segredo INOVA_SECRET ausente');
    }
    const payload = `${timestampHeader}${rawBody.toString('utf-8')}`;
    const expectedSignature = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
    const expectedBuffer = Buffer.from(expectedSignature);
    const providedBuffer = Buffer.from(signatureHeader);

    if (
      expectedBuffer.length !== providedBuffer.length ||
      !timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      throw new UnauthorizedException('Assinatura inválida');
    }

    return true;
  }
}
