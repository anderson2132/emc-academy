-- CreateEnum
CREATE TYPE "PreEnrollmentStatus" AS ENUM ('PENDING', 'CLAIMED', 'LINKED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "EnrollmentStatus" ADD VALUE 'PENDING_GUARDIAN';

-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN     "guardian_approved_at" TIMESTAMP(3),
ADD COLUMN     "guardian_approved_by" UUID,
ADD COLUMN     "review_notes" TEXT;

-- CreateTable
CREATE TABLE "pre_enrollments" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "birth_date" DATE,
    "discount_cents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "status" "PreEnrollmentStatus" NOT NULL DEFAULT 'PENDING',
    "created_by" UUID NOT NULL,
    "claimed_by" UUID,
    "claimed_at" TIMESTAMP(3),
    "linked_user_id" UUID,
    "linked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pre_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pre_enrollments_email_status_idx" ON "pre_enrollments"("email", "status");

-- CreateIndex
CREATE INDEX "pre_enrollments_group_id_idx" ON "pre_enrollments"("group_id");

-- CreateIndex
CREATE INDEX "enrollments_status_idx" ON "enrollments"("status");

-- AddForeignKey
ALTER TABLE "pre_enrollments" ADD CONSTRAINT "pre_enrollments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "academic_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
