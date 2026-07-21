ALTER TABLE "branches" ADD COLUMN "accounting_code" text;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "branches_tenant_accounting_code_idx" ON "branches" USING btree ("tenant_id","accounting_code") WHERE "branches"."accounting_code" IS NOT NULL;