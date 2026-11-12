ALTER TABLE "shifts" DROP CONSTRAINT "shifts_location_id_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "shifts" ALTER COLUMN "location_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "zone_id" uuid;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;