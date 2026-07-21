ALTER TABLE "coupons" ADD COLUMN "target_product_id" uuid;--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "target_variant_id" uuid;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_target_product_id_products_id_fk" FOREIGN KEY ("target_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_target_variant_id_product_variants_id_fk" FOREIGN KEY ("target_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;