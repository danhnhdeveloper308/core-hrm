import { Module } from '@nestjs/common';
import { CalendarsService } from './calendars.service';
import {
  HolidayCalendarsController,
  ScheduleDefaultsController,
  ShiftsController,
} from './schedule.controller';
import { ShiftsService } from './shifts.service';

@Module({
  controllers: [
    ShiftsController,
    HolidayCalendarsController,
    ScheduleDefaultsController,
  ],
  providers: [ShiftsService, CalendarsService],
  exports: [ShiftsService, CalendarsService],
})
export class WorkScheduleModule {}
