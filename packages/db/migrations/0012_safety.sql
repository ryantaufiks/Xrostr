CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"employee_id" uuid NOT NULL,
	"location_id" uuid,
	"shift_id" uuid,
	"route_id" uuid,
	"welfare_check_id" uuid,
	"latitude" double precision,
	"longitude" double precision,
	"accuracy_m" integer,
	"note" text,
	"dedupe_key" text,
	"raised_at" timestamp with time zone NOT NULL,
	"acknowledged_by" uuid,
	"acknowledged_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alerts_dedupe_uq" UNIQUE("tenant_id","dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "alerts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "welfare_checks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"prompted_at" timestamp with time zone NOT NULL,
	"respond_by" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"escalated_at" timestamp with time zone,
	"latitude" double precision,
	"longitude" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "welfare_checks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "welfare_interval_minutes" integer;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_route_id_patrol_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."patrol_routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_welfare_check_id_welfare_checks_id_fk" FOREIGN KEY ("welfare_check_id") REFERENCES "public"."welfare_checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_checks" ADD CONSTRAINT "welfare_checks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_checks" ADD CONSTRAINT "welfare_checks_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_checks" ADD CONSTRAINT "welfare_checks_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_checks" ADD CONSTRAINT "welfare_checks_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_status_idx" ON "alerts" USING btree ("status","raised_at");--> statement-breakpoint
CREATE INDEX "alerts_employee_idx" ON "alerts" USING btree ("employee_id","raised_at");--> statement-breakpoint
CREATE INDEX "welfare_checks_shift_idx" ON "welfare_checks" USING btree ("shift_id","prompted_at");--> statement-breakpoint
CREATE INDEX "welfare_checks_employee_idx" ON "welfare_checks" USING btree ("employee_id","prompted_at");--> statement-breakpoint
CREATE POLICY "alerts_tenant_isolation" ON "alerts" AS PERMISSIVE FOR ALL TO "xrostr_app" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "welfare_checks_tenant_isolation" ON "welfare_checks" AS PERMISSIVE FOR ALL TO "xrostr_app" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);