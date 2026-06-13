import { Module } from '@nestjs/common';
import {
  OrgController,
  OrgUnitTypesController,
  OrgUnitsController,
  PositionsController,
  WorksitesController,
} from './org-structure.controller';
import { OrgStructureService } from './org-structure.service';
import { OrgUnitsService } from './org-units.service';

@Module({
  controllers: [
    OrgController,
    OrgUnitTypesController,
    OrgUnitsController,
    PositionsController,
    WorksitesController,
  ],
  providers: [OrgStructureService, OrgUnitsService],
  exports: [OrgUnitsService],
})
export class OrgStructureModule {}
