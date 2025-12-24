import { ExecutionContext } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { ConfigService } from '@nestjs/config';

const buildContext = (headers: Record<string, string>): ExecutionContext => {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        header: (name: string) => headers[name],
      }),
    }),
  } as ExecutionContext;
};

describe('ApiKeyGuard', () => {
  const apiKey = 'test-api-key';
  const configService: ConfigService = {
    get: (key: string, defaultValue?: unknown) =>
      key === 'INOVA_API_KEY' ? apiKey : defaultValue,
  } as unknown as ConfigService;

  it('allows a request with valid API key (x-api-key)', () => {
    const guard = new ApiKeyGuard(configService);
    const context = buildContext({ 'x-api-key': apiKey });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows a request with valid API key (x-inova-api-key)', () => {
    const guard = new ApiKeyGuard(configService);
    const context = buildContext({ 'x-inova-api-key': apiKey });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects when API key is missing', () => {
    const guard = new ApiKeyGuard(configService);
    const context = buildContext({});

    expect(() => guard.canActivate(context)).toThrow();
  });

  it('rejects when API key is invalid', () => {
    const guard = new ApiKeyGuard(configService);
    const context = buildContext({ 'x-api-key': 'wrong' });

    expect(() => guard.canActivate(context)).toThrow();
  });
});
