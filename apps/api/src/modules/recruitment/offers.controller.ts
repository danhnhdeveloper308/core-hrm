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
  AcceptOfferDto,
  CreateOfferDto,
  ListOffersQueryDto,
  UpdateOfferDto,
} from './dto/recruitment.dto';
import { OffersService } from './offers.service';

@ApiTags('recruitment')
@ApiCookieAuth('access_token')
@Controller('offers')
export class OffersController {
  constructor(private readonly service: OffersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.RECRUITMENT_READ)
  @ApiOperation({ summary: 'Danh sách offer' })
  @ApiOkResponse({ description: 'CursorPaginated<OfferResponse>' })
  list(@CurrentOrg() orgId: string, @Query() query: ListOffersQueryDto) {
    return this.service.list(orgId, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.OFFER_MANAGE)
  @Audit('offer.create')
  @ApiOperation({ summary: 'Tạo offer (nháp)' })
  @ApiOkResponse({ description: 'OfferResponse' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateOfferDto) {
    return this.service.create(orgId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.OFFER_MANAGE)
  @Audit('offer.update')
  @ApiOperation({ summary: 'Sửa offer (khi nháp)' })
  @ApiOkResponse({ description: 'OfferResponse' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOfferDto,
  ) {
    return this.service.update(orgId, id, dto);
  }

  @Post(':id/submit')
  @RequirePermissions(PERMISSIONS.OFFER_MANAGE)
  @Audit('offer.submit')
  @ApiOperation({ summary: 'Gửi offer đi duyệt' })
  @ApiOkResponse({ description: 'OfferResponse' })
  submit(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.submit(orgId, actor, id);
  }

  @Post(':id/accept')
  @RequirePermissions(PERMISSIONS.OFFER_MANAGE)
  @Audit('offer.accept')
  @ApiOperation({ summary: 'Chấp nhận offer → tạo nhân viên' })
  @ApiOkResponse({ description: 'OfferResponse & { employeeId }' })
  accept(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AcceptOfferDto,
  ) {
    return this.service.accept(orgId, actor, id, dto);
  }

  @Post(':id/decline')
  @RequirePermissions(PERMISSIONS.OFFER_MANAGE)
  @Audit('offer.decline')
  @ApiOperation({ summary: 'Từ chối / huỷ offer' })
  @ApiOkResponse({ description: 'OfferResponse' })
  decline(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.decline(orgId, id);
  }
}
