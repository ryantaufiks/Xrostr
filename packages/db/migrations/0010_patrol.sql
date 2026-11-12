CREATE TABLE "patrol_checkpoints" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"tag_secret" text DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"radius_m" integer DEFAULT 30 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patrol_checkpoints_tag_uq" UNIQUE("tenant_id","tag_secret")
);
--> statement-breakpoint
ALTER TABLE "patrol_checkpoints" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "patrol_rounds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"checkpoint_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patrol_rounds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "patrol_routes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"name" text NOT NULL,
	"interval_minutes" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "patrol_routes_name_uq" UNIQUE("location_id","name")
);
--> statement-breakpoint
ALTER TABLE "patrol_routes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "patrol_scans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"checkpoint_id" uuid NOT NULL,
	"scanned_at" timestamp with time zone NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"accuracy_m" integer,
	"distance_m" integer,
	"location_verified" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patrol_scans_once_uq" UNIQUE("round_id","checkpoint_id")
);
--> statement-breakpoint
ALTER TABLE "patrol_scans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "patrol_checkpoints" ADD CONSTRAINT "patrol_checkpoints_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patrol_checkpoints" ADD CONSTRAINT "patrol_checkpoints_route_id_patrol_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."patrol_routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patrol_rounds" ADD CONSTRAINT "patrol_rounds_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patrol_rounds" ADD CONSTRAINT "patrol_rounds_route_id_patrol_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."patrol_routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patrol_rounds" ADD CONSTRAINT "patrol_rounds_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patrol_rounds" ADD CONSTRAINT "patrol_rounds_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patrol_routes" ADD CONSTRAINT "patrol_routes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patrol_routes" ADD CONSTRAINT "patrol_routes_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patrol_scans" ADD CONSTRAINT "patrol_scans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patrol_scans" ADD CONSTRAINT "patrol_scans_round_id_patrol_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."patrol_rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patrol_scans" ADD CONSTRAINT "patrol_scans_checkpoint_id_patrol_checkpoints_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."patrol_checkpoints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "patrol_checkpoints_route_idx" ON "patrol_checkpoints" USING btree ("route_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "patrol_rounds_one_open_uq" ON "patrol_rounds" USING btree ("route_id","employee_id") WHERE status = 'in_progress';--> statement-breakpoint
CREATE INDEX "patrol_rounds_route_idx" ON "patrol_rounds" USING btree ("route_id","started_at");--> statement-breakpoint
CREATE INDEX "patrol_rounds_employee_idx" ON "patrol_rounds" USING btree ("employee_id","started_at");--> statement-breakpoint
CREATE POLICY "patrol_checkpoints_tenant_isolation" ON "patrol_checkpoints" AS PERMISSIVE FOR ALL TO "xrostr_app" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "patrol_rounds_tenant_isolation" ON "patrol_rounds" AS PERMISSIVE FOR ALL TO "xrostr_app" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "patrol_routes_tenant_isolation" ON "patrol_routes" AS PERMISSIVE FOR ALL TO "xrostr_app" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "patrol_scans_tenant_isolation" ON "patrol_scans" AS PERMISSIVE FOR ALL TO "xrostr_app" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);