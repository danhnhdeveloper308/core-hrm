-- Holiday: chuyển từ 1 ngày (date + isHalfDay) sang khoảng [startDate, endDate]
DROP INDEX "Holiday_calendarId_date_key";

-- Thêm cột mới dạng nullable để backfill
ALTER TABLE "Holiday"
  ADD COLUMN "startDate" DATE,
  ADD COLUMN "endDate"   DATE,
  ADD COLUMN "updatedAt" TIMESTAMP(3);

-- Backfill: ngày lễ cũ thành khoảng 1 ngày
UPDATE "Holiday" SET "startDate" = "date", "endDate" = "date", "updatedAt" = now();

-- Siết NOT NULL
ALTER TABLE "Holiday"
  ALTER COLUMN "startDate" SET NOT NULL,
  ALTER COLUMN "endDate"   SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL;

-- Bỏ cột cũ
ALTER TABLE "Holiday" DROP COLUMN "date", DROP COLUMN "isHalfDay";

-- Index mới
CREATE INDEX "Holiday_calendarId_startDate_endDate_idx" ON "Holiday"("calendarId", "startDate", "endDate");
