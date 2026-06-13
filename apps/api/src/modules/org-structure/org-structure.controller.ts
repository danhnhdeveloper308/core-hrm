import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
  CreateOrgUnitDto,
  CreateOrgUnitTypeDto,
  CreatePositionDto,
  CreateWorksiteDto,
  MoveOrgUnitDto,
  UpdateOrgUnitDto,
  UpdateOrgUnitTypeDto,
  UpdateOwnOrgDto,
  UpdatePositionDto,
  UpdateWorksiteDto,
} from './dto/org-structure.dto';
import { OrgStructureService } from './org-structure.service';
import { OrgUnitsService } from './org-units.service';

@ApiTags('org')
@ApiCookieAuth('access_token')
@Controller('org')
export class OrgController {
  constructor(private readonly service: OrgStructureService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORG_READ)
  @ApiOperation({ summary: 'Thông tin tổ chức của user hiện tại' })
  @ApiOkResponse({ description: 'OrganizationResponse' })
  getOwn(@CurrentOrg() orgId: string) {
    return this.service.getOwnOrg(orgId);
  }

  @Patch()
  @RequirePermissions(PERMISSIONS.ORG_UPDATE)
  @Audit('org.update')
  @ApiOperation({ summary: 'Org admin sửa tên/timezone tổ chức mình' })
  @ApiOkResponse({ description: 'OrganizationResponse' })
  updateOwn(@CurrentOrg() orgId: string, @Body() dto: UpdateOwnOrgDto) {
    return this.service.updateOwnOrg(orgId, dto);
  }
}

@ApiTags('org-unit-types')
@ApiCookieAuth('access_token')
@Controller('org-unit-types')
export class OrgUnitTypesController {
  constructor(private readonly service: OrgStructureService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORG_READ)
  @ApiOperation({ summary: 'Danh sách loại đơn vị của org' })
  @ApiOkResponse({ description: 'OrgUnitTypeResponse[]' })
  list(@CurrentOrg() orgId: string) {
    return this.service.listTypes(orgId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ORGUNIT_MANAGE)
  @Audit('orgunit_type.create')
  @ApiOperation({ summary: 'Thêm loại đơn vị' })
  @ApiOkResponse({ description: 'OrgUnitTypeResponse' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateOrgUnitTypeDto) {
    return this.service.createType(orgId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ORGUNIT_MANAGE)
  @Audit('orgunit_type.update')
  @ApiOperation({ summary: 'Sửa loại đơn vị' })
  @ApiOkResponse({ description: 'OrgUnitTypeResponse' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrgUnitTypeDto,
  ) {
    return this.service.updateType(orgId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.ORGUNIT_MANAGE)
  @Audit('orgunit_type.delete')
  @ApiOperation({ summary: 'Xoá loại đơn vị (chặn khi đang được dùng)' })
  @ApiOkResponse({ description: 'Đã xoá' })
  remove(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeType(orgId, id);
  }
}

@ApiTags('org-units')
@ApiCookieAuth('access_token')
@Controller('org-units')
export class OrgUnitsController {
  constructor(private readonly service: OrgUnitsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORG_READ)
  @ApiOperation({ summary: 'Toàn bộ cây đơn vị của org (FE dựng tree từ parentId)' })
  @ApiOkResponse({ description: 'OrgUnitResponse[]' })
  list(@CurrentOrg() orgId: string) {
    return this.service.list(orgId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ORGUNIT_MANAGE)
  @Audit('orgunit.create')
  @ApiOperation({ summary: 'Tạo đơn vị (parentId null = node gốc)' })
  @ApiOkResponse({ description: 'OrgUnitResponse' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateOrgUnitDto) {
    return this.service.create(orgId, dto);
  }

  @Patch(':id/move')
  @RequirePermissions(PERMISSIONS.ORGUNIT_MANAGE)
  @Audit('orgunit.move')
  @ApiOperation({
    summary: 'Chuyển đơn vị sang cha mới — cập nhật path cả subtree, cấm chu trình',
  })
  @ApiOkResponse({ description: 'OrgUnitResponse' })
  move(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveOrgUnitDto,
  ) {
    return this.service.move(orgId, id, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ORGUNIT_MANAGE)
  @Audit('orgunit.update')
  @ApiOperation({ summary: 'Sửa đơn vị (tên/code/loại/manager)' })
  @ApiOkResponse({ description: 'OrgUnitResponse' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrgUnitDto,
  ) {
    return this.service.update(orgId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.ORGUNIT_MANAGE)
  @Audit('orgunit.delete')
  @ApiOperation({ summary: 'Xoá đơn vị lá (chặn khi còn đơn vị con)' })
  @ApiOkResponse({ description: 'Đã xoá' })
  remove(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(orgId, id);
  }
}

@ApiTags('positions')
@ApiCookieAuth('access_token')
@Controller('positions')
export class PositionsController {
  constructor(private readonly service: OrgStructureService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORG_READ)
  @ApiOperation({ summary: 'Danh sách chức danh' })
  @ApiOkResponse({ description: 'PositionResponse[]' })
  list(@CurrentOrg() orgId: string) {
    return this.service.listPositions(orgId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ORGUNIT_MANAGE)
  @Audit('position.create')
  @ApiOperation({ summary: 'Thêm chức danh' })
  @ApiOkResponse({ description: 'PositionResponse' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreatePositionDto) {
    return this.service.createPosition(orgId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ORGUNIT_MANAGE)
  @Audit('position.update')
  @ApiOperation({ summary: 'Sửa chức danh' })
  @ApiOkResponse({ description: 'PositionResponse' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePositionDto,
  ) {
    return this.service.updatePosition(orgId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.ORGUNIT_MANAGE)
  @Audit('position.delete')
  @ApiOperation({ summary: 'Xoá chức danh' })
  @ApiOkResponse({ description: 'Đã xoá' })
  remove(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.removePosition(orgId, id);
  }
}

@ApiTags('worksites')
@ApiCookieAuth('access_token')
@Controller('worksites')
export class WorksitesController {
  constructor(private readonly service: OrgStructureService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORG_READ)
  @ApiOperation({ summary: 'Danh sách địa điểm làm việc (geofence)' })
  @ApiOkResponse({ description: 'WorksiteResponse[]' })
  list(@CurrentOrg() orgId: string) {
    return this.service.listWorksites(orgId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.WORKSITE_MANAGE)
  @Audit('worksite.create')
  @ApiOperation({ summary: 'Thêm địa điểm làm việc' })
  @ApiOkResponse({ description: 'WorksiteResponse' })
  create(@CurrentOrg() orgId: string, @Body() dto: CreateWorksiteDto) {
    return this.service.createWorksite(orgId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.WORKSITE_MANAGE)
  @Audit('worksite.update')
  @ApiOperation({ summary: 'Sửa địa điểm làm việc' })
  @ApiOkResponse({ description: 'WorksiteResponse' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorksiteDto,
  ) {
    return this.service.updateWorksite(orgId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.WORKSITE_MANAGE)
  @Audit('worksite.delete')
  @ApiOperation({ summary: 'Xoá địa điểm làm việc' })
  @ApiOkResponse({ description: 'Đã xoá' })
  remove(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeWorksite(orgId, id);
  }
}
