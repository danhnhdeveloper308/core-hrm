import type { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';
import { AppConfigService } from '../config/app-config.service';
import { redisConnectionOptions } from '../redis/redis.module';

/**
 * Socket.IO adapter dùng Redis pub/sub — emit từ instance API nào cũng
 * đến đúng client trên mọi instance (scale ngang).
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | undefined;
  private readonly corsOrigins: string[];
  private readonly clients: Redis[] = [];

  constructor(app: INestApplication, private readonly config: AppConfigService) {
    super(app);
    this.corsOrigins = config.corsOrigins;
  }

  connectToRedis(): void {
    const pubClient = new Redis(redisConnectionOptions(this.config));
    const subClient = pubClient.duplicate();
    // ioredis emit 'error' không có listener sẽ crash process —
    // nuốt lỗi kết nối (ioredis tự reconnect)
    for (const client of [pubClient, subClient]) {
      client.on('error', () => undefined);
    }
    this.clients.push(pubClient, subClient);
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: this.corsOrigins, credentials: true },
    }) as import('socket.io').Server;
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }

  override async close(server: import('socket.io').Server): Promise<void> {
    // Đóng server TRƯỚC — adapter còn dùng pub/sub để cleanup; quit client
    // trước sẽ flush lệnh pending bằng "Connection is closed" và crash shutdown
    await super.close(server);
    await Promise.all(
      this.clients.map((c) => c.quit().catch(() => undefined)),
    );
  }
}
