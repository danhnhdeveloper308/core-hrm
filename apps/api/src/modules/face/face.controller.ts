import {
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  ParseUUIDPipe,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiConsumes,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ERROR_CODES, PERMISSIONS } from '@repo/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import {
  CurrentUser,
  type AccessTokenPayload,
} from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { FaceService } from './face.service';

@ApiTags('face')
@ApiCookieAuth('access_token')
@Controller('face')
export class FaceController {
  constructor(
    private readonly face: FaceService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('enroll')
  @RequirePermissions(PERMISSIONS.FACE_ENROLL)
  @Audit('face.enroll')
  @UseInterceptors(FilesInterceptor('photos', 5))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Đăng ký khuôn mặt: 3–5 ảnh (self hoặc HR). EMPLOYEE chỉ enroll chính mình.',
  })
  @ApiOkResponse({ description: '{ enrolledCount }' })
  async enroll(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @UploadedFiles(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: /^image\/(jpeg|png|webp)$/,
          skipMagicNumbersValidation: true,
        })
        .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 })
        .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }),
    )
    files: Express.Multer.File[],
  ) {
    if (files.length < 3 || files.length > 5) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Cần 3–5 ảnh để đăng ký khuôn mặt',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    const employeeId = await this.resolveTargetEmployee(orgId, actor);
    return this.face.enroll(
      orgId,
      employeeId,
      files.map((f) => f.buffer),
      actor.sub,
    );
  }

  @Get('me/status')
  @RequirePermissions(PERMISSIONS.FACE_ENROLL)
  @ApiOperation({ summary: 'Trạng thái đăng ký khuôn mặt của chính mình' })
  @ApiOkResponse({ description: '{ enrolled, enrolledCount, enrolledAt }' })
  async myStatus(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    const employeeId = await this.resolveTargetEmployee(orgId, actor);
    return this.face.getStatus(orgId, employeeId);
  }

  @Get(':employeeId/status')
  @RequirePermissions(PERMISSIONS.FACE_MANAGE)
  @ApiOperation({ summary: 'Trạng thái đăng ký khuôn mặt của 1 nhân viên (HR)' })
  @ApiOkResponse({ description: '{ enrolled, enrolledCount, enrolledAt }' })
  status(
    @CurrentOrg() orgId: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return this.face.getStatus(orgId, employeeId);
  }

  @Post(':employeeId/enroll')
  @RequirePermissions(PERMISSIONS.FACE_MANAGE)
  @Audit('face.enroll_for')
  @UseInterceptors(FilesInterceptor('photos', 5))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'HR đăng ký khuôn mặt hộ nhân viên (3–5 ảnh)' })
  @ApiOkResponse({ description: '{ enrolledCount }' })
  enrollFor(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @UploadedFiles(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: /^image\/(jpeg|png|webp)$/,
          skipMagicNumbersValidation: true,
        })
        .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 })
        .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }),
    )
    files: Express.Multer.File[],
  ) {
    if (files.length < 3 || files.length > 5) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Cần 3–5 ảnh để đăng ký khuôn mặt',
        ERROR_CODES.VALIDATION_ERROR,
      );
    }
    return this.face.enroll(
      orgId,
      employeeId,
      files.map((f) => f.buffer),
      actor.sub,
    );
  }

  @Delete(':employeeId')
  @RequirePermissions(PERMISSIONS.FACE_MANAGE)
  @Audit('face.delete')
  @ApiOperation({ summary: 'Xoá dữ liệu khuôn mặt của nhân viên' })
  @ApiOkResponse({ description: 'Đã xoá' })
  remove(
    @CurrentOrg() orgId: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return this.face.deleteProfile(orgId, employeeId);
  }

  /** Hồ sơ của chính actor (qua userId) — dùng cho enroll/status self. */
  private async resolveTargetEmployee(
    orgId: string,
    actor: AccessTokenPayload,
  ): Promise<string> {
    const employee = await this.prisma.employee.findFirst({
      where: { orgId, userId: actor.sub },
      select: { id: true },
    });
    if (!employee) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Tài khoản chưa gắn hồ sơ nhân viên',
        ERROR_CODES.NOT_FOUND,
      );
    }
    return employee.id;
  }
}
