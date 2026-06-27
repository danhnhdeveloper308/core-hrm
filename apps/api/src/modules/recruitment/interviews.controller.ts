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
import {
  CurrentUser,
  type AccessTokenPayload,
} from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  CreateInterviewDto,
  ListInterviewsQueryDto,
  SubmitFeedbackDto,
  UpdateInterviewDto,
} from './dto/recruitment.dto';
import { InterviewsService } from './interviews.service';

@ApiTags('recruitment')
@ApiCookieAuth('access_token')
@Controller('interviews')
export class InterviewsController {
  constructor(private readonly service: InterviewsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.RECRUITMENT_READ)
  @ApiOperation({ summary: 'Danh sách buổi phỏng vấn (lọc theo hồ sơ/trạng thái)' })
  @ApiOkResponse({ description: 'CursorPaginated<InterviewResponse>' })
  list(@CurrentOrg() orgId: string, @Query() query: ListInterviewsQueryDto) {
    return this.service.list(orgId, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.RECRUITMENT_MANAGE)
  @Audit('interview.create')
  @ApiOperation({ summary: 'Lên lịch phỏng vấn (mời hội đồng)' })
  @ApiOkResponse({ description: 'InterviewResponse' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateInterviewDto) {
    return this.service.create(orgId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.RECRUITMENT_MANAGE)
  @Audit('interview.update')
  @ApiOperation({ summary: 'Cập nhật lịch / trạng thái / hội đồng phỏng vấn' })
  @ApiOkResponse({ description: 'InterviewResponse' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInterviewDto,
  ) {
    return this.service.update(orgId, id, dto);
  }

  @Get(':id/feedback')
  @RequirePermissions(PERMISSIONS.RECRUITMENT_READ)
  @ApiOperation({ summary: 'Đánh giá của buổi phỏng vấn' })
  @ApiOkResponse({ description: 'InterviewFeedbackResponse[]' })
  listFeedback(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.listFeedback(orgId, id);
  }

  @Post(':id/feedback')
  @RequirePermissions(PERMISSIONS.RECRUITMENT_MANAGE)
  @Audit('interview.feedback')
  @ApiOperation({ summary: 'Gửi đánh giá phỏng vấn (1 người 1 phiếu)' })
  @ApiOkResponse({ description: 'InterviewFeedbackResponse' })
  submitFeedback(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitFeedbackDto,
  ) {
    return this.service.submitFeedback(orgId, id, actor, dto);
  }
}
