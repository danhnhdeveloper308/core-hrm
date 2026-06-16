import {
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  ParseUUIDPipe,
  Post,
  Query,
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
import { ATTACHMENT_MAX_SIZE, PERMISSIONS } from '@repo/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import {
  CurrentUser,
  type AccessTokenPayload,
} from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AttachmentService } from './attachment.service';
import { ListAttachmentsQueryDto, UploadAttachmentDto } from './dto/attachment.dto';

@ApiTags('attachments')
@ApiCookieAuth('access_token')
@Controller('attachments')
export class AttachmentController {
  constructor(private readonly attachments: AttachmentService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.LEAVE_REQUEST)
  @Audit('attachment.upload')
  @UseInterceptors(FilesInterceptor('files', 5))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Đính kèm ảnh/PDF vào đơn (≤5 file, ≤10MB/file)' })
  @ApiOkResponse({ description: 'AttachmentResponse[]' })
  upload(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Query() query: UploadAttachmentDto,
    @UploadedFiles(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: /^(image\/(jpeg|png|webp)|application\/pdf)$/,
          skipMagicNumbersValidation: true,
        })
        .addMaxSizeValidator({ maxSize: ATTACHMENT_MAX_SIZE })
        .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }),
    )
    files: Express.Multer.File[],
  ) {
    return this.attachments.upload(orgId, actor.sub, query.targetType, query.targetId, files);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.LEAVE_READ)
  @ApiOperation({ summary: 'Danh sách file đính kèm của 1 đơn (kèm signed URL)' })
  @ApiOkResponse({ description: 'AttachmentResponse[]' })
  list(@CurrentOrg() orgId: string, @Query() query: ListAttachmentsQueryDto) {
    return this.attachments.list(orgId, query.targetType, query.targetId);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.LEAVE_REQUEST)
  @Audit('attachment.delete')
  @ApiOperation({ summary: 'Xoá file đính kèm' })
  @ApiOkResponse({ description: '{ message }' })
  async remove(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.attachments.remove(orgId, id);
    return { message: 'Đã xoá file' };
  }
}
