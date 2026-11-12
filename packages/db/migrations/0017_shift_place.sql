ALTER TABLE "shifts" DROP CONSTRAINT "shifts_location_id_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "shifts" DROP CONSTRAINT "shifts_zone_id_zones_id_fk";
--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_place_ck" CHECK ("shifts"."kind" = 'standby' or (("shifts"."location_id" is null) <> ("shifts"."zone_id" is null)));