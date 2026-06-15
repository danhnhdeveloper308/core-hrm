import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS, type SessionResponse } from '@repo/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import {
  CurrentUser,
  type AccessTokenPayload,
} from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { SessionsService } from './sessions.service';

@ApiTags('sessions')
@ApiCookieAuth('access_token')
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Sessions đang hoạt động của tôi (kèm thiết bị)' })
  @ApiOkResponse({ description: 'SessionResponse[] — isCurrent đánh dấu phiên này' })
  listMine(@CurrentUser() user: AccessTokenPayload): Promise<SessionResponse[]> {
    return this.sessions.listActiveSessions(user.sub, user.sessionId);
  }

  @Get('user/:userId')
  @RequirePermissions(PERMISSIONS.SESSION_READ)
  @ApiOperation({ summary: '(Admin) Sessions của user bất kỳ' })
  @ApiOkResponse({ description: 'SessionResponse[]' })
  listForUser(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<SessionResponse[]> {
    return this.sessions.listActiveSessions(userId, null);
  }

  @Post('revoke-others')
  @HttpCode(HttpStatus.OK)
  @Audit('session.revoke_others')
  @ApiOperation({ summary: 'Thu hồi mọi session trừ phiên hiện tại' })
  @ApiOkResponse({ description: 'Số session đã thu hồi' })
  async revokeOthers(
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<{ message: string }> {
    const count = await this.sessions.revokeAllForUser(user.sub, 'USER_LOGOUT', {
      exceptSessionId: user.sessionId,
    });
    return { message: `Đã thu hồi ${count} session khác` };
  }

  @Delete(':id')
  @Audit('session.revoke')
  @ApiOperation({
    summary: 'Thu hồi 1 session — của mình luôn được, của người khác cần session:revoke',
  })
  @ApiOkResponse({ description: 'Đã thu hồi; client đó nhận session:revoked realtime' })
  revoke(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    return this.sessions.revokeOnBehalf(user, id);
  }
}
