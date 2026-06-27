import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@repo/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  CreateJobRequisitionDto,
  ListJobRequisitionsQueryDto,
  UpdateJobRequisitionDto,
} from './dto/recruitment.dto';
import { JobRequisitionsService } from './job-requisitions.service';

@ApiTags('recruitment')
@ApiCookieAuth('access_token')
@Controller('job-requisitions')
export class JobRequisitionsController {
  constructor(private readonly service: JobRequisitionsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.RECRUITMENT_READ)
  @ApiOperation({ summary: 'Danh sách tin tuyển dụng' })
  @ApiOkResponse({ description: 'CursorPaginated<JobRequisitionResponse>' })
  list(@CurrentOrg() orgId: string, @Query() query: ListJobRequisitionsQueryDto) {
    return this.service.list(orgId, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.RECRUITMENT_READ)
  @ApiOperation({ summary: 'Chi tiết tin tuyển dụng' })
  @ApiOkResponse({ description: 'JobRequisitionResponse' })
  get(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(orgId, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.RECRUITMENT_MANAGE)
  @Audit('job_requisition.create')
  @ApiOperation({ summary: 'Tạo tin tuyển dụng (tuỳ chọn từ yêu cầu đã duyệt)' })
  @ApiOkResponse({ description: 'JobRequisitionResponse' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateJobRequisitionDto) {
    return this.service.create(orgId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.RECRUITMENT_MANAGE)
  @Audit('job_requisition.update')
  @ApiOperation({ summary: 'Cập nhật tin / đổi trạng thái (mở/đóng)' })
  @ApiOkResponse({ description: 'JobRequisitionResponse' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobRequisitionDto,
  ) {
    return this.service.update(orgId, id, dto);
  }
}
