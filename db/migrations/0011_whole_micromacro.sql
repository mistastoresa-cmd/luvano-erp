CREATE TABLE "employee_number_counters" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gratuity_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"termination_date" date NOT NULL,
	"termination_reason" text NOT NULL,
	"years_of_service" numeric(6, 2) NOT NULL,
	"base_salary_at_termination" numeric(12, 2) NOT NULL,
	"applicable_percent" numeric(5, 2) NOT NULL,
	"gross_amount" numeric(12, 2) NOT NULL,
	"net_amount" numeric(12, 2) NOT NULL,
	"journal_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_date" date,
	"status" text DEFAULT 'pending' NOT NULL,
	"assigned_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"related_amount" numeric(12, 2),
	"issued_by" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"status" text DEFAULT 'sent' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "employee_number" text NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "id_type" text DEFAULT 'national_id' NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "id_expiry_date" date;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "nationality" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "department" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "contract_type" text DEFAULT 'unlimited' NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "contract_end_date" date;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "probation_end_date" date;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "gosi_number" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "iban_number" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "terminated_at" date;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "termination_reason" text;--> statement-breakpoint
ALTER TABLE "employee_number_counters" ADD CONSTRAINT "employee_number_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gratuity_payments" ADD CONSTRAINT "gratuity_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gratuity_payments" ADD CONSTRAINT "gratuity_payments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gratuity_payments" ADD CONSTRAINT "gratuity_payments_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_tasks" ADD CONSTRAINT "employee_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_tasks" ADD CONSTRAINT "employee_tasks_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_notifications" ADD CONSTRAINT "employee_notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_notifications" ADD CONSTRAINT "employee_notifications_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_tasks_tenant_employee_idx" ON "employee_tasks" USING btree ("tenant_id","employee_id");--> statement-breakpoint
CREATE INDEX "employee_notifications_tenant_employee_idx" ON "employee_notifications" USING btree ("tenant_id","employee_id");--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employees_tenant_employee_number_idx" ON "employees" USING btree ("tenant_id","employee_number");