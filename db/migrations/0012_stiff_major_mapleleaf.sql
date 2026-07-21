CREATE TABLE "authz_denials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"check_type" text NOT NULL,
	"required_roles" text,
	"branch_id" uuid,
	"message" text NOT NULL,
	"denied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "authz_denials" ADD CONSTRAINT "authz_denials_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authz_denials" ADD CONSTRAINT "authz_denials_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "authz_denials_tenant_denied_at_idx" ON "authz_denials" USING btree ("tenant_id","denied_at");