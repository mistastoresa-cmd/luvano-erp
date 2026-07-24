ALTER TABLE "supplier_payments" ADD COLUMN "bank_account_id" uuid;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD COLUMN "cheque_number" text;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD COLUMN "cheque_due_date" date;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;