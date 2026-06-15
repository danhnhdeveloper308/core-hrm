import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { PERMISSIONS } from '@repo/shared';
import type { Queue } from 'bullmq';
import cookieParser from 'cookie-parser';
import { json, urlencoded, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module';
import type { AccessTokenPayload } from './common/decorators/current-user.decorator';
import { createAppLogger } from './common/logger/winston.logger';
import { AppConfigService } from './config/app-config.service';
import { RedisIoAdapter } from './gateways/redis-io.adapter';
import { PermissionsCacheService } from './modules/rbac/permissions-cache.service';
import { AUDIT_QUEUE } from './queues/audit.queue';
import { EMAIL_QUEUE } from './queues/email.queue';

/** Dashboard BullMQ tại /api/admin/queues — chỉ cho user có audit:read. */
function mountBullBoard(
  app: NestExpressApplication,
  config: AppConfigService,
): void {
  const jwt = app.get(JwtService);
  const permsCache = app.get(PermissionsCacheService);
  const basePath = `/${config.globalPrefix}/admin/queues`;

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(basePath);
  createBullBoard({
    queues: [
      new BullMQAdapter(app.get<Queue>(EMAIL_QUEUE)),
      new BullMQAdapter(app.get<Queue>(AUDIT_QUEUE)),
    ],
    serverAdapter,
  });

  const guard = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cookies = req.cookies as Record<string, string> | undefined;
      const token =
        cookies?.['access_token'] ??
        (req.headers.authorization?.startsWith('Bearer ')
          ? req.headers.authorization.slice(7)
          : undefined);
      if (!token) throw new Error('missing token');

      const payload = await jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: config.jwtAccessSecret,
      });
      const access = await permsCache.getUserAccess(payload.sub);
      if (!access?.permissions.includes(PERMISSIONS.AUDIT_READ)) {
        throw new Error('missing permission');
      }
      next();
    } catch {
      res.status(403).json({
        statusCode: 403,
        message: 'Cần đăng nhập với quyền audit:read',
        errorCode: 'FORBIDDEN',
      });
    }
  };

  app.use(basePath, guard, serverAdapter.getRouter());
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: createAppLogger(process.env.NODE_ENV),
    bodyParser: false,
  });

  const config = app.get(AppConfigService);
  const logger = new Logger('Bootstrap');

  // Đứng sau reverse proxy (nginx/docker) — lấy đúng IP client từ X-Forwarded-For
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));
  app.use(helmet());
  app.use(cookieParser());

  app.setGlobalPrefix(config.globalPrefix, { exclude: ['health'] });
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
  });
  app.enableShutdownHooks();

  // Socket.IO scale ngang qua Redis pub/sub
  const redisIoAdapter = new RedisIoAdapter(app, config);
  redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  mountBullBoard(app, config);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('HRM API')
    .setDescription('HRM đa doanh nghiệp — Attendance + Leave + Approval API')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('access_token')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(
    `${config.globalPrefix}/docs`,
    app,
    cleanupOpenApiDoc(document),
  );

  await app.listen(config.port);
  logger.log(
    `API chạy tại http://localhost:${config.port}/${config.globalPrefix} (docs: /${config.globalPrefix}/docs)`,
  );
}

void bootstrap();
