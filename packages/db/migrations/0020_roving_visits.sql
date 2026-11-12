CREATE TABLE "site_visits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"accuracy_m" integer,
	"distance_m" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_visits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "visit_alerts" (
	"tenant_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"alerted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visit_alerts_shift_id_location_id_pk" PRIMARY KEY("shift_id","location_id")
);
--> statement-breakpoint
ALTER TABLE "visit_alerts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "relief_requests" ADD COLUMN "pulled_shift_id" uuid;--> statement-breakpoint
ALTER TABLE "zone_locations" ADD COLUMN "min_visits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "zones" ADD COLUMN "visit_gap_minutes" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_alerts" ADD CONSTRAINT "visit_alerts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_alerts" ADD CONSTRAINT "visit_alerts_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_alerts" ADD CONSTRAINT "visit_alerts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_visits_shift_idx" ON "site_visits" USING btree ("shift_id","occurred_at");--> statement-breakpoint
ALTER TABLE "relief_requests" ADD CONSTRAINT "relief_requests_pulled_shift_id_shifts_id_fk" FOREIGN KEY ("pulled_shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "site_visits_tenant_isolation" ON "site_visits" AS PERMISSIVE FOR ALL TO "xrostr_app" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "visit_alerts_tenant_isolation" ON "visit_alerts" AS PERMISSIVE FOR ALL TO "xrostr_app" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);