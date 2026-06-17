import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiConsumes,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@repo/shared';
import type { Response } from 'express';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import {
  CurrentUser,
  type AccessTokenPayload,
} from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ShiftRegistrationService } from './shift-registration.service';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('shift-registrations')
@ApiCookieAuth('access_token')
@Controller('shift-registrations')
export class ShiftRegistrationController {
  constructor(private readonly service: ShiftRegistrationService) {}

  @Get('template')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ_ALL)
  @ApiOperation({ summary: 'Tải file Excel mẫu đăng ký tăng/giãn ca' })
  async template(@Res() res: Response): Promise<void> {
    const buf = await this.service.generateTemplate();
    res.setHeader('Content-Type', XLSX_MIME);
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="mau-dang-ky-tang-gian-ca.xlsx"',
    );
    res.send(buf);
  }

  @Post('upload')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ_ALL)
  @Audit('shift_registration.upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload danh sách → tạo phiếu + luồng duyệt' })
  @ApiOkResponse({ description: 'UploadBatchResult' })
  upload(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Body('title') title: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 })
        .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }),
    )
    file: Express.Multer.File,
  ) {
    return this.service.upload(orgId, actor, title?.trim() || 'Phiếu tăng/giãn ca', file.buffer);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ_ALL)
  @ApiOperation({ summary: 'Danh sách phiếu đăng ký tăng/giãn ca' })
  @ApiOkResponse({ description: 'ShiftRegistrationBatchResponse[]' })
  list(@CurrentOrg() orgId: string) {
    return this.service.list(orgId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ_ALL)
  @ApiOperation({ summary: 'Chi tiết phiếu (danh sách dòng + chữ ký)' })
  @ApiOkResponse({ description: 'ShiftRegistrationBatchResponse' })
  get(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getBatch(orgId, id);
  }
}
