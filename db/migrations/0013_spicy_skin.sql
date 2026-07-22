ALTER TABLE "products" ADD COLUMN "name_en" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "brand" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "unit" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "barcode" text;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "cost_price" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "sell_price" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "taxable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "reorder_level" integer DEFAULT 0 NOT NULL;