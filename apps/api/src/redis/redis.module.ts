import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from '../config/app-config.service';

/** Client Redis dùng chung (cache, OAuth state, throttle lastActiveAt...). */
export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * Connection options cho BullMQ/socket.io-adapter — các chỗ đó cần client
 * riêng (blocking commands / pub-sub) nên chỉ chia sẻ options, không chia sẻ client.
 */
export function redisConnectionOptions(config: AppConfigService) {
  const { host, port, password, tls } = config.redis;
  return {
    host,
    port,
    ...(password ? { password } : {}),
    // Redis serverless (Upstash...) yêu cầu TLS — SNI theo host
    ...(tls ? { tls: { servername: host } } : {}),
  };
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => {
        const client = new Redis(redisConnectionOptions(config));
        // không có listener thì 'error' event crash process — ioredis tự reconnect
        client.on('error', () => undefined);
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}
