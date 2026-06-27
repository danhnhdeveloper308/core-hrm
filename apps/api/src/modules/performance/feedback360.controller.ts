import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
  CreateFeedback360Dto,
  ListFeedback360QueryDto,
  SubmitFeedback360Dto,
} from './dto/performance.dto';
import { Feedback360Service } from './feedback360.service';

@ApiTags('performance')
@ApiCookieAuth('access_token')
@Controller('feedback-360')
export class Feedback360Controller {
  constructor(private readonly service: Feedback360Service) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PERFORMANCE_READ)
  @ApiOperation({ summary: 'Danh sách đợt 360° (theo phạm vi)' })
  @ApiOkResponse({ description: 'CursorPaginated<Feedback360Response>' })
  list(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Query() query: ListFeedback360QueryDto,
  ) {
    return this.service.list(orgId, actor, query);
  }

  @Get('my-invitations')
  @RequirePermissions(PERMISSIONS.PERFORMANCE_READ)
  @ApiOperation({ summary: 'Các lời mời đánh giá 360° của tôi' })
  @ApiOkResponse({ description: 'Feedback360Invitation[]' })
  myInvitations(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.service.myInvitations(orgId, actor);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PERFORMANCE_READ)
  @ApiOperation({ summary: 'Chi tiết đợt 360° (tổng hợp, ẩn danh nếu cần)' })
  @ApiOkResponse({ description: 'Feedback360Detail' })
  get(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.get(orgId, actor, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.REVIEW_CONDUCT)
  @Audit('feedback360.create')
  @ApiOperation({ summary: 'Lập đợt 360° + mời người đánh giá' })
  @ApiOkResponse({ description: 'Feedback360Response' })
  create(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Body() dto: CreateFeedback360Dto,
  ) {
    return this.service.create(orgId, actor, dto);
  }

  @Post(':id/close')
  @RequirePermissions(PERMISSIONS.REVIEW_CONDUCT)
  @Audit('feedback360.close')
  @ApiOperation({ summary: 'Đóng đợt thu thập 360°' })
  @ApiOkResponse({ description: 'Feedback360Response' })
  close(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.close(orgId, actor, id);
  }

  @Post('raters/:raterId/submit')
  @RequirePermissions(PERMISSIONS.PERFORMANCE_READ)
  @Audit('feedback360.submit')
  @ApiOperation({ summary: 'Nộp phản hồi 360° (phiếu của tôi)' })
  @ApiOkResponse({ description: 'Feedback360Invitation' })
  submit(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Param('raterId', ParseUUIDPipe) raterId: string,
    @Body() dto: SubmitFeedback360Dto,
  ) {
    return this.service.submit(orgId, actor, raterId, dto);
  }
}
