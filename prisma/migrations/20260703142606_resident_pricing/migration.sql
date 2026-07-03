-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "isResidentBooking" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "isResident" BOOLEAN;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "residentPrice" DOUBLE PRECISION;
