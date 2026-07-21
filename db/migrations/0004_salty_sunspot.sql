CREATE TABLE IF NOT EXISTS "account_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sale_invoices" ADD COLUMN "journal_entry_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "account_mappings" ADD CONSTRAINT "account_mappings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "account_mappings" ADD CONSTRAINT "account_mappings_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "account_mappings_tenant_key_idx" ON "account_mappings" USING btree ("tenant_id","key");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sale_invoices" ADD CONSTRAINT "sale_invoices_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "journal_entries_tenant_source_idx" ON "journal_entries" USING btree ("tenant_id","source_type","source_reference") WHERE "journal_entries"."source_reference" IS NOT NULL;