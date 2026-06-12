import { WinstonModule, utilities } from 'nest-winston';
import * as winston from 'winston';

/**
 * Logger cho toàn app: pretty + màu ở dev, JSON ở production.
 * Không bao giờ log request body — tránh lộ password/token/otp.
 */
export function createAppLogger(nodeEnv: string | undefined) {
  const isProd = nodeEnv === 'production';

  return WinstonModule.createLogger({
    level: isProd ? 'info' : 'debug',
    transports: [
      new winston.transports.Console({
        format: isProd
          ? winston.format.combine(
              winston.format.timestamp(),
              winston.format.errors({ stack: true }),
              winston.format.json(),
            )
          : winston.format.combine(
              winston.format.timestamp({ format: 'HH:mm:ss' }),
              winston.format.errors({ stack: true }),
              utilities.format.nestLike('api', {
                colors: true,
                prettyPrint: true,
              }),
            ),
      }),
    ],
  });
}
