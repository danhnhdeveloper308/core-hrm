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
import {
  CurrentUser,
  type AccessTokenPayload,
} from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ContractsService } from './contracts.service';
import {
  CreateOrgContractDto,
  ListContractsQueryDto,
  TerminateContractDto,
  UpdateContractDto,
} from './dto/contracts.dto';

@ApiTags('contracts')
@ApiCookieAuth('access_token')
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CONTRACT_READ)
  @ApiOperation({ summary: 'Danh sách hợp đồng (lọc trạng thái/sắp hết hạn/tìm)' })
  @ApiOkResponse({ description: 'CursorPaginated<ContractListItem>' })
  list(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Query() query: ListContractsQueryDto,
  ) {
    return this.contracts.list(orgId, actor, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CONTRACT_READ)
  @ApiOperation({ summary: 'Chi tiết 1 hợp đồng' })
  @ApiOkResponse({ description: 'ContractListItem' })
  get(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.contracts.get(orgId, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CONTRACT_MANAGE)
  @Audit('contract.create')
  @ApiOperation({ summary: 'Tạo hợp đồng cho nhân viên' })
  @ApiOkResponse({ description: 'ContractListItem' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateOrgContractDto) {
    return this.contracts.create(orgId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CONTRACT_MANAGE)
  @Audit('contract.update')
  @ApiOperation({ summary: 'Cập nhật hợp đồng' })
  @ApiOkResponse({ description: 'ContractListItem' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContractDto,
  ) {
    return this.contracts.update(orgId, id, dto);
  }

  @Post(':id/terminate')
  @RequirePermissions(PERMISSIONS.CONTRACT_MANAGE)
  @Audit('contract.terminate')
  @ApiOperation({ summary: 'Chấm dứt hợp đồng' })
  @ApiOkResponse({ description: 'ContractListItem' })
  terminate(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TerminateContractDto,
  ) {
    return this.contracts.terminate(orgId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CONTRACT_MANAGE)
  @Audit('contract.delete')
  @ApiOperation({ summary: 'Xoá (soft-delete) hợp đồng' })
  @ApiOkResponse({ description: '{ message }' })
  remove(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.contracts.remove(orgId, id);
  }
}
