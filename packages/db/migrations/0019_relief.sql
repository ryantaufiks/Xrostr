CREATE TABLE "relief_offers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"offered_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relief_offers_once_uq" UNIQUE("request_id","employee_id")
);
--> statement-breakpoint
ALTER TABLE "relief_offers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "relief_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"requested_by" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"timeout_minutes" integer NOT NULL,
	"filled_employee_id" uuid,
	"new_shift_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "relief_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "replaces_shift_id" uuid;--> statement-breakpoint
ALTER TABLE "relief_offers" ADD CONSTRAINT "relief_offers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relief_offers" ADD CONSTRAINT "relief_offers_request_id_relief_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."relief_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relief_offers" ADD CONSTRAINT "relief_offers_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relief_requests" ADD CONSTRAINT "relief_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relief_requests" ADD CONSTRAINT "relief_requests_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relief_requests" ADD CONSTRAINT "relief_requests_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relief_requests" ADD CONSTRAINT "relief_requests_filled_employee_id_employees_id_fk" FOREIGN KEY ("filled_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relief_requests" ADD CONSTRAINT "relief_requests_new_shift_id_shifts_id_fk" FOREIGN KEY ("new_shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "relief_offers_pending_idx" ON "relief_offers" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "relief_offers_employee_idx" ON "relief_offers" USING btree ("employee_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "relief_requests_one_open_uq" ON "relief_requests" USING btree ("shift_id") WHERE status = 'open';--> statement-breakpoint
CREATE INDEX "relief_requests_location_idx" ON "relief_requests" USING btree ("location_id","created_at");--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_replaces_shift_id_shifts_id_fk" FOREIGN KEY ("replaces_shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "relief_offers_tenant_isolation" ON "relief_offers" AS PERMISSIVE FOR ALL TO "xrostr_app" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "relief_requests_tenant_isolation" ON "relief_requests" AS PERMISSIVE FOR ALL TO "xrostr_app" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);