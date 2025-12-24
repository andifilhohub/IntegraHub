import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.header('x-api-key') ?? request.header('x-inova-api-key');
    if (!providedKey) {
      throw new UnauthorizedException('API key ausente');
    }

    const expectedKey = this.configService.get<string>('INOVA_API_KEY');
    if (!expectedKey) {
      throw new InternalServerErrorException('Chave INOVA_API_KEY ausente na configuração');
    }

    if (providedKey !== expectedKey) {
      throw new UnauthorizedException('API key inválida');
    }

    return true;
  }
}
