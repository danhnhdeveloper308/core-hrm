import {
  Body,
  Controller,
  Delete,
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
  CreateReviewCycleDto,
  ListReviewCyclesQueryDto,
  UpdateReviewCycleDto,
} from './dto/performance.dto';
import { ReviewCyclesService } from './review-cycles.service';

@ApiTags('performance')
@ApiCookieAuth('access_token')
@Controller('review-cycles')
export class ReviewCyclesController {
  constructor(private readonly service: ReviewCyclesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PERFORMANCE_READ)
  @ApiOperation({ summary: 'Danh sách chu kỳ đánh giá' })
  @ApiOkResponse({ description: 'CursorPaginated<ReviewCycleResponse>' })
  list(
    @CurrentOrg() orgId: string,
    @Query() query: ListReviewCyclesQueryDto,
  ) {
    return this.service.list(orgId, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PERFORMANCE_MANAGE)
  @Audit('review_cycle.create')
  @ApiOperation({ summary: 'Tạo chu kỳ đánh giá' })
  @ApiOkResponse({ description: 'ReviewCycleResponse' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateReviewCycleDto) {
    return this.service.create(orgId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PERFORMANCE_MANAGE)
  @Audit('review_cycle.update')
  @ApiOperation({ summary: 'Cập nhật chu kỳ đánh giá (gồm đổi trạng thái)' })
  @ApiOkResponse({ description: 'ReviewCycleResponse' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReviewCycleDto,
  ) {
    return this.service.update(orgId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PERFORMANCE_MANAGE)
  @Audit('review_cycle.delete')
  @ApiOperation({ summary: 'Xoá chu kỳ đánh giá (chỉ khi đang nháp)' })
  @ApiOkResponse({ description: '{ id }' })
  remove(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(orgId, id);
  }
}
