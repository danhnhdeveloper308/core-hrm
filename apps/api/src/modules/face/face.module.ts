import { Module } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { FACE_ENGINE } from './face-engine';
import { FaceController } from './face.controller';
import { FaceService } from './face.service';
import { HumanFaceEngine } from './human-face.engine';

@Module({
  controllers: [FaceController],
  providers: [
    {
      provide: FACE_ENGINE,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        new HumanFaceEngine(
          config.face.modelsPath,
          config.face.antispoofThreshold,
          config.face.modelsAutoDownload,
          config.face.modelsBaseUrl,
        ),
    },
    FaceService,
  ],
  exports: [FaceService],
})
export class FaceModule {}
