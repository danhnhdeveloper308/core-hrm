import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiConsumes,
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
  CreateContractDto,
  CreateDependentDto,
  CreateEmployeeDto,
  ListEmployeesQueryDto,
  UpdateDependentDto,
  UpdateEmployeeDto,
} from './dto/employee.dto';
import { EmployeesService } from './employees.service';

const imagePipe = new ParseFilePipeBuilder()
  .addFileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ })
  .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 })
  .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY });

const documentPipe = new ParseFilePipeBuilder()
  .addFileTypeValidator({
    fileType: /^(application\/pdf|image\/(jpeg|png|webp))$/,
  })
  .addMaxSizeValidator({ maxSize: 10 * 1024 * 1024 })
  .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY });

@ApiTags('employees')
@ApiCookieAuth('access_token')
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.EMPLOYEE_READ)
  @ApiOperation({
    summary: 'Danh sách nhân viên — cursor pagination, scope subtree cho manager',
  })
  @ApiOkResponse({ description: 'CursorPaginated<EmployeeResponse>' })
  list(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Query() query: ListEmployeesQueryDto,
  ) {
    return this.employees.list(orgId, actor, query);
  }

  @Get('org-chart')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_READ)
  @ApiOperation({ summary: 'Sơ đồ tổ chức theo quản lý trực tiếp' })
  @ApiOkResponse({ description: 'OrgChartNode[]' })
  orgChart(@CurrentOrg() orgId: string) {
    return this.employees.orgChart(orgId);
  }

  @Get('me')
  @ApiOperation({ summary: 'Hồ sơ nhân viên của chính mình (null nếu chưa có)' })
  @ApiOkResponse({ description: 'EmployeeResponse & { contracts } | null' })
  me(@CurrentUser() actor: AccessTokenPayload) {
    return this.employees.me(actor.sub);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.EMPLOYEE_CREATE)
  @Audit('employee.create')
  @ApiOperation({ summary: 'Tạo hồ sơ + tuỳ chọn mời tài khoản (role EMPLOYEE)' })
  @ApiOkResponse({ description: 'EmployeeResponse' })
  create(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.employees.create(orgId, actor, dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_READ)
  @ApiOperation({ summary: 'Chi tiết nhân viên (kèm hợp đồng, avatar signed URL)' })
  @ApiOkResponse({ description: 'EmployeeResponse & { contracts }' })
  findOne(
    @CurrentOrg() orgId: string,
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.employees.findOne(orgId, actor, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_UPDATE)
  @Audit('employee.update')
  @ApiOperation({
    summary: 'Cập nhật hồ sơ — TERMINATED tự revoke session + khoá tài khoản',
  })
  @ApiOkResponse({ description: 'EmployeeResponse' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employees.update(orgId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_DELETE)
  @Audit('employee.delete')
  @ApiOperation({ summary: 'Xoá hồ sơ nhân viên (khoá tài khoản liên kết)' })
  @ApiOkResponse({ description: 'Đã xoá' })
  remove(@CurrentOrg() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.employees.remove(orgId, id);
  }

  @Post(':id/avatar')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_UPDATE)
  @Audit('employee.upload_avatar')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload avatar (jpeg/png/webp ≤ 5MB)' })
  @ApiOkResponse({ description: '{ avatarUrl }' })
  uploadAvatar(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile(imagePipe) file: Express.Multer.File,
  ) {
    return this.employees.uploadAvatar(orgId, id, file);
  }

  @Post(':id/contracts')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_UPDATE)
  @Audit('employee.create_contract')
  @ApiOperation({ summary: 'Thêm hợp đồng lao động' })
  @ApiOkResponse({ description: 'ContractResponse' })
  createContract(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateContractDto,
  ) {
    return this.employees.createContract(orgId, id, dto);
  }

  @Put(':id/contracts/:contractId/file')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_UPDATE)
  @Audit('employee.upload_contract_file')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Đính kèm file hợp đồng (pdf/ảnh ≤ 10MB)' })
  @ApiOkResponse({ description: 'ContractResponse' })
  uploadContractFile(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @UploadedFile(documentPipe) file: Express.Multer.File,
  ) {
    return this.employees.uploadContractFile(orgId, id, contractId, file);
  }

  @Get(':id/contracts/:contractId/file-url')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_READ)
  @ApiOperation({ summary: 'Signed URL tạm thời để xem file hợp đồng' })
  @ApiOkResponse({ description: '{ url }' })
  contractFileUrl(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
  ) {
    return this.employees.getContractFileUrl(orgId, id, contractId);
  }

  @Delete(':id/contracts/:contractId')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_UPDATE)
  @Audit('employee.delete_contract')
  @ApiOperation({ summary: 'Xoá hợp đồng (kèm file trên storage)' })
  @ApiOkResponse({ description: 'Đã xoá' })
  removeContract(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
  ) {
    return this.employees.removeContract(orgId, id, contractId);
  }

  // ===== Người phụ thuộc (giảm trừ gia cảnh) =====

  @Get(':id/dependents')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_READ)
  @ApiOperation({ summary: 'Danh sách người phụ thuộc' })
  @ApiOkResponse({ description: 'DependentResponse[]' })
  listDependents(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.employees.listDependents(orgId, id);
  }

  @Post(':id/dependents')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_UPDATE)
  @Audit('employee.add_dependent')
  @ApiOperation({ summary: 'Thêm người phụ thuộc' })
  @ApiOkResponse({ description: 'DependentResponse' })
  addDependent(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDependentDto,
  ) {
    return this.employees.addDependent(orgId, id, dto);
  }

  @Patch(':id/dependents/:dependentId')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_UPDATE)
  @Audit('employee.update_dependent')
  @ApiOperation({ summary: 'Cập nhật người phụ thuộc' })
  @ApiOkResponse({ description: 'DependentResponse' })
  updateDependent(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('dependentId', ParseUUIDPipe) dependentId: string,
    @Body() dto: UpdateDependentDto,
  ) {
    return this.employees.updateDependent(orgId, id, dependentId, dto);
  }

  @Delete(':id/dependents/:dependentId')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_UPDATE)
  @Audit('employee.delete_dependent')
  @ApiOperation({ summary: 'Xoá người phụ thuộc' })
  @ApiOkResponse({ description: 'Đã xoá' })
  removeDependent(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('dependentId', ParseUUIDPipe) dependentId: string,
  ) {
    return this.employees.removeDependent(orgId, id, dependentId);
  }
}
