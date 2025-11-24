import { ExecutionContext } from '@nestjs/common';
import { createHmac } from 'crypto';
import { HmacGuard } from './hmac.guard';
import { ConfigService } from '@nestjs/config';

const buildContext = (headers: Record<string, string>, body: string): ExecutionContext => {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        header: (name: string) => headers[name],
        rawBody: Buffer.from(body),
      }),
    }),
  } as ExecutionContext;
};

describe('HmacGuard', () => {
  const secret = 'test-secret';
  const configService: ConfigService = {
    get: (key: string, defaultValue: unknown) => {
      if (key === 'INOVA_SECRET') return secret;
      if (key === 'HMAC_TIME_WINDOW_MS') return 300000;
      return defaultValue;
    },
  } as unknown as ConfigService;

  it('allows a request with valid signature', () => {
    const timestamp = Date.now().toString();
    const payload = JSON.stringify({ foo: 'bar' });
    const signature = `sha256=${createHmac('sha256', secret)
      .update(`${timestamp}${payload}`)
      .digest('hex')}`;

    const guard = new HmacGuard(configService);
    const context = buildContext({ 'X-Inova-Timestamp': timestamp, 'X-Inova-Signature': signature }, payload);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects when signature is invalid', () => {
    const timestamp = Date.now().toString();
    const payload = JSON.stringify({ foo: 'bar' });
    const context = buildContext({ 'X-Inova-Timestamp': timestamp, 'X-Inova-Signature': 'sha256=bad' }, payload);
    const guard = new HmacGuard(configService);

    expect(() => guard.canActivate(context)).toThrow();
  });
});
