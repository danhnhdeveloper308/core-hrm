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
import { CandidatesService } from './candidates.service';
import { CreateCandidateDto, UpdateCandidateDto } from './dto/recruitment.dto';

@ApiTags('recruitment')
@ApiCookieAuth('access_token')
@Controller('candidates')
export class CandidatesController {
  constructor(private readonly service: CandidatesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.RECRUITMENT_READ)
  @ApiOperation({ summary: 'Tìm / liệt kê ứng viên' })
  @ApiOkResponse({ description: 'CandidateResponse[]' })
  list(@CurrentOrg() orgId: string, @Query('q') q?: string) {
    return this.service.list(orgId, q);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.RECRUITMENT_MANAGE)
  @Audit('candidate.create')
  @ApiOperation({ summary: 'Tạo ứng viên' })
  @ApiOkResponse({ description: 'CandidateResponse' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateCandidateDto) {
    return this.service.create(orgId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.RECRUITMENT_MANAGE)
  @Audit('candidate.update')
  @ApiOperation({ summary: 'Cập nhật ứng viên' })
  @ApiOkResponse({ description: 'CandidateResponse' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCandidateDto,
  ) {
    return this.service.update(orgId, id, dto);
  }
}
