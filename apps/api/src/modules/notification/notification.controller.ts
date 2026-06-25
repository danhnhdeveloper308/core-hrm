import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type AccessTokenPayload,
} from '../../common/decorators/current-user.decorator';
import { SkipAudit } from '../../common/decorators/skip-audit.decorator';
import {
  NotificationListQueryDto,
  NotificationPrefsDto,
  RegisterDeviceTokenDto,
  RemoveDeviceTokenDto,
} from './dto/notification.dto';
import { NotificationService } from './notification.service';

/** Thông báo cá nhân — chỉ cần đăng nhập (không gắn permission), không ghi audit. */
@ApiTags('notification')
@ApiCookieAuth('access_token')
@SkipAudit()
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách thông báo của tôi (cursor pagination)' })
  @ApiOkResponse({ description: 'CursorPaginated<Notification>' })
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: NotificationListQueryDto,
  ) {
    return this.notifications.list(user.sub, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Số thông báo chưa đọc (cho badge chuông)' })
  @ApiOkResponse({ description: '{ count: number }' })
  async unreadCount(@CurrentUser() user: AccessTokenPayload) {
    return { count: await this.notifications.unreadCount(user.sub) };
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đánh dấu đã đọc tất cả' })
  @ApiOkResponse({ description: '{ count: number }' })
  markAllRead(@CurrentUser() user: AccessTokenPayload) {
    return this.notifications.markAllRead(user.sub);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Tuỳ chọn nhận thông báo của tôi (loại × kênh)' })
  @ApiOkResponse({ description: 'NotificationPrefs' })
  getPreferences(@CurrentUser() user: AccessTokenPayload) {
    return this.notifications.getPreferences(user.sub);
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Cập nhật tuỳ chọn nhận thông báo' })
  @ApiOkResponse({ description: 'NotificationPrefs' })
  updatePreferences(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: NotificationPrefsDto,
  ) {
    return this.notifications.updatePreferences(user.sub, dto);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đánh dấu 1 thông báo đã đọc' })
  @ApiOkResponse({ description: '{ count: number }' })
  markRead(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.notifications.markRead(user.sub, id);
  }

  @Post('device-tokens')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng ký FCM token của thiết bị hiện tại' })
  @ApiOkResponse({ description: 'MessageResponse' })
  registerToken(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: RegisterDeviceTokenDto,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    return this.notifications.registerToken(user.sub, dto, userAgent ?? null);
  }

  @Delete('device-tokens')
  @ApiOperation({ summary: 'Gỡ FCM token (tắt push trên thiết bị này)' })
  @ApiOkResponse({ description: 'MessageResponse' })
  removeToken(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: RemoveDeviceTokenDto,
  ) {
    return this.notifications.removeToken(user.sub, dto.token);
  }
}
