-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_VERIFICATION', 'PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'TEACHER', 'STUDENT', 'GUARDIAN');

-- CreateEnum
CREATE TYPE "IdentityProvider" AS ENUM ('GOOGLE', 'MICROSOFT');

-- CreateEnum
CREATE TYPE "EmailTokenType" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('DNI', 'CE', 'PASAPORTE');

-- CreateEnum
CREATE TYPE "GuardianLinkStatus" AS ENUM ('PENDING_GUARDIAN', 'PENDING_ADMIN', 'APPROVED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CourseLine" AS ENUM ('PROGRAM', 'KIDS_TEENS');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GroupStatus" AS ENUM ('PLANNED', 'ENROLLING', 'IN_PROGRESS', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('YAPE', 'PLIN', 'TRANSFER', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('SCHEDULED', 'RESCHEDULED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'JUSTIFIED');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('STUDENT', 'TEACHER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MaterialKind" AS ENUM ('FILE', 'LINK');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('SUBMITTED', 'REVIEWED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "username" TEXT,
    "email_verified_at" TIMESTAMP(3),
    "password_hash" TEXT,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "managed_by_guardian_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role" "Role" NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role")
);

-- CreateTable
CREATE TABLE "user_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "IdentityProvider" NOT NULL,
    "provider_subject" TEXT NOT NULL,
    "provider_email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "user_agent" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "EmailTokenType" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "requested_role" "Role" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "review_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_profiles" (
    "user_id" UUID NOT NULL,
    "birth_date" DATE,
    "school" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "guardian_profiles" (
    "user_id" UUID NOT NULL,
    "document_type" "DocumentType",
    "document_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guardian_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "student_guardians" (
    "student_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "relationship" TEXT,
    "status" "GuardianLinkStatus" NOT NULL DEFAULT 'PENDING_GUARDIAN',
    "consent_at" TIMESTAMP(3),
    "consent_version" TEXT,
    "consent_ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_guardians_pkey" PRIMARY KEY ("student_id","guardian_id")
);

-- CreateTable
CREATE TABLE "teacher_profiles" (
    "user_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "bio" TEXT,
    "photo_url" TEXT,
    "specialties" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "line" "CourseLine" NOT NULL,
    "level" INTEGER,
    "tool" TEXT,
    "summary" TEXT NOT NULL,
    "description" TEXT,
    "objective" TEXT,
    "audience" TEXT,
    "requirements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "price_cents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'PEN',
    "total_hours" INTEGER NOT NULL DEFAULT 32,
    "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_modules" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "course_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_groups" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "schedule" JSONB,
    "zoom_url" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 20,
    "status" "GroupStatus" NOT NULL DEFAULT 'PLANNED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "academic_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_teachers" (
    "group_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,

    CONSTRAINT "group_teachers_pkey" PRIMARY KEY ("group_id","teacher_id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'REQUESTED',
    "price_cents" INTEGER NOT NULL,
    "discount_cents" INTEGER NOT NULL DEFAULT 0,
    "manual_block" BOOLEAN NOT NULL DEFAULT false,
    "block_reason" TEXT,
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "operation_number" TEXT,
    "paid_on" DATE NOT NULL,
    "registered_by" UUID NOT NULL,
    "notes" TEXT,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_sessions" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "attendance_closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "marked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "AttendanceSource" NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_adjustments" (
    "id" UUID NOT NULL,
    "record_id" UUID NOT NULL,
    "from_status" "AttendanceStatus" NOT NULL,
    "to_status" "AttendanceStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "changed_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recordings" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "drive_file_id" TEXT NOT NULL,
    "title" TEXT,
    "duration_seconds" INTEGER,
    "size_bytes" BIGINT,
    "mime_type" TEXT,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "recordings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recording_views" (
    "recording_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "progress_seconds" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recording_views_pkey" PRIMARY KEY ("recording_id","user_id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "session_id" UUID,
    "kind" "MaterialKind" NOT NULL,
    "title" TEXT NOT NULL,
    "drive_file_id" TEXT,
    "url" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "due_at" TIMESTAMP(3),
    "published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_submissions" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "files" JSONB NOT NULL DEFAULT '[]',
    "comment" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "feedback" TEXT,
    "feedback_by" UUID,
    "feedback_at" TIMESTAMP(3),
    "status" "SubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',

    CONSTRAINT "assignment_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "read_at" TIMESTAMP(3),
    "emailed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "user_identities_user_id_idx" ON "user_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_identities_provider_provider_subject_key" ON "user_identities"("provider", "provider_subject");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_key" ON "auth_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_tokens_token_hash_key" ON "email_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "email_tokens_user_id_type_idx" ON "email_tokens"("user_id", "type");

-- CreateIndex
CREATE INDEX "account_requests_status_idx" ON "account_requests"("status");

-- CreateIndex
CREATE INDEX "account_requests_user_id_idx" ON "account_requests"("user_id");

-- CreateIndex
CREATE INDEX "student_guardians_guardian_id_idx" ON "student_guardians"("guardian_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_profiles_slug_key" ON "teacher_profiles"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "courses_slug_key" ON "courses"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "course_modules_course_id_position_key" ON "course_modules"("course_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "academic_groups_code_key" ON "academic_groups"("code");

-- CreateIndex
CREATE INDEX "academic_groups_course_id_idx" ON "academic_groups"("course_id");

-- CreateIndex
CREATE INDEX "group_teachers_teacher_id_idx" ON "group_teachers"("teacher_id");

-- CreateIndex
CREATE INDEX "enrollments_group_id_status_idx" ON "enrollments"("group_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_student_id_group_id_key" ON "enrollments"("student_id", "group_id");

-- CreateIndex
CREATE INDEX "payments_enrollment_id_idx" ON "payments"("enrollment_id");

-- CreateIndex
CREATE INDEX "class_sessions_group_id_starts_at_idx" ON "class_sessions"("group_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "class_sessions_group_id_number_key" ON "class_sessions"("group_id", "number");

-- CreateIndex
CREATE INDEX "attendance_records_student_id_idx" ON "attendance_records"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_session_id_student_id_key" ON "attendance_records"("session_id", "student_id");

-- CreateIndex
CREATE INDEX "attendance_adjustments_record_id_idx" ON "attendance_adjustments"("record_id");

-- CreateIndex
CREATE UNIQUE INDEX "recordings_session_id_key" ON "recordings"("session_id");

-- CreateIndex
CREATE INDEX "materials_group_id_idx" ON "materials"("group_id");

-- CreateIndex
CREATE INDEX "assignments_group_id_idx" ON "assignments"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_submissions_assignment_id_student_id_key" ON "assignment_submissions"("assignment_id", "student_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_requests" ADD CONSTRAINT "account_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_requests" ADD CONSTRAINT "account_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_profiles" ADD CONSTRAINT "guardian_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardian_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_groups" ADD CONSTRAINT "academic_groups_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_teachers" ADD CONSTRAINT "group_teachers_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "academic_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_teachers" ADD CONSTRAINT "group_teachers_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "academic_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "academic_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_adjustments" ADD CONSTRAINT "attendance_adjustments_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "attendance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording_views" ADD CONSTRAINT "recording_views_recording_id_fkey" FOREIGN KEY ("recording_id") REFERENCES "recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording_views" ADD CONSTRAINT "recording_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "academic_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "class_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "academic_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
