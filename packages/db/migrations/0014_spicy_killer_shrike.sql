CREATE TABLE "employee_locations" (
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_locations_employee_id_location_id_pk" PRIMARY KEY("employee_id","location_id")
);
--> statement-breakpoint
ALTER TABLE "employee_locations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "location_staffing" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"day_count" integer DEFAULT 1 NOT NULL,
	"night_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "location_staffing_day_uq" UNIQUE("location_id","weekday")
);
--> statement-breakpoint
ALTER TABLE "location_staffing" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "zone_locations" (
	"tenant_id" uuid NOT NULL,
	"zone_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zone_locations_zone_id_location_id_pk" PRIMARY KEY("zone_id","location_id")
);
--> statement-breakpoint
ALTER TABLE "zone_locations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "zones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "zones_tenant_name_uq" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
ALTER TABLE "zones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "assignment_type" text DEFAULT 'fixed' NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "can_relieve" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_locations" ADD CONSTRAINT "employee_locations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_locations" ADD CONSTRAINT "employee_locations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_locations" ADD CONSTRAINT "employee_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_staffing" ADD CONSTRAINT "location_staffing_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_staffing" ADD CONSTRAINT "location_staffing_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_locations" ADD CONSTRAINT "zone_locations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_locations" ADD CONSTRAINT "zone_locations_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_locations" ADD CONSTRAINT "zone_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "location_staffing_location_idx" ON "location_staffing" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "zone_locations_location_idx" ON "zone_locations" USING btree ("location_id");--> statement-breakpoint
CREATE POLICY "employee_locations_tenant_isolation" ON "employee_locations" AS PERMISSIVE FOR ALL TO "xrostr_app" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "location_staffing_tenant_isolation" ON "location_staffing" AS PERMISSIVE FOR ALL TO "xrostr_app" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "zone_locations_tenant_isolation" ON "zone_locations" AS PERMISSIVE FOR ALL TO "xrostr_app" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "zones_tenant_isolation" ON "zones" AS PERMISSIVE FOR ALL TO "xrostr_app" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);