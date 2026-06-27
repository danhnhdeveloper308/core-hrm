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
  CreatePerformanceReviewDto,
  GenerateReviewsDto,
  ListPerformanceReviewsQueryDto,
  SubmitManagerReviewDto,
  SubmitSelfReviewDto,
} from './dto/performance.dto';
import { PerformanceReviewsService } from './performance-reviews.service';

@ApiTags('performance')
@ApiCookieAuth('access_token')
@Controller('performance-reviews')
export class PerformanceReviewsController {
  constructor(private readonly service: PerformanceReviewsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PERFORMANCE_READ)
  @ApiOperation({ summary: 'Danh sách phiếu đánh giá (theo phạm vi)' })
  @ApiOkResponse({ description: 'CursorPaginated<PerformanceReviewResponse>' })
  list(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Query() query: ListPerformanceReviewsQueryDto,
  ) {
    return this.service.list(orgId, actor, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PERFORMANCE_READ)
  @ApiOperation({ summary: 'Chi tiết phiếu đánh giá' })
  @ApiOkResponse({ description: 'PerformanceReviewResponse' })
  get(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.get(orgId, actor, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PERFORMANCE_MANAGE)
  @Audit('performance_review.create')
  @ApiOperation({ summary: 'Tạo 1 phiếu đánh giá (gán NV + người đánh giá)' })
  @ApiOkResponse({ description: 'PerformanceReviewResponse' })
  create(
    @CurrentOrg() orgId: string,
    @Body() dto: CreatePerformanceReviewDto,
  ) {
    return this.service.create(orgId, dto);
  }

  @Post('generate')
  @RequirePermissions(PERMISSIONS.PERFORMANCE_MANAGE)
  @Audit('performance_review.generate')
  @ApiOperation({ summary: 'Sinh hàng loạt phiếu cho 1 chu kỳ' })
  @ApiOkResponse({ description: '{ created }' })
  generate(@CurrentOrg() orgId: string, @Body() dto: GenerateReviewsDto) {
    return this.service.generate(orgId, dto);
  }

  @Patch(':id/self')
  @RequirePermissions(PERMISSIONS.PERFORMANCE_READ)
  @Audit('performance_review.self')
  @ApiOperation({ summary: 'NV tự đánh giá (phiếu của mình)' })
  @ApiOkResponse({ description: 'PerformanceReviewResponse' })
  submitSelf(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitSelfReviewDto,
  ) {
    return this.service.submitSelf(orgId, actor, id, dto);
  }

  @Patch(':id/manager')
  @RequirePermissions(PERMISSIONS.REVIEW_CONDUCT)
  @Audit('performance_review.manager')
  @ApiOperation({ summary: 'Quản lý chấm điểm + chốt (ký duyệt nếu có luồng)' })
  @ApiOkResponse({ description: 'PerformanceReviewResponse' })
  submitManager(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitManagerReviewDto,
  ) {
    return this.service.submitManager(orgId, actor, id, dto);
  }
}
