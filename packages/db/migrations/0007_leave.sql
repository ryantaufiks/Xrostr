CREATE TABLE "holiday_calendars" (
	"tenant_id" uuid NOT NULL,
	"country_code" text NOT NULL,
	"year" integer NOT NULL,
	"seeded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holiday_calendars_tenant_id_country_code_year_pk" PRIMARY KEY("tenant_id","country_code","year")
);
--> statement-breakpoint
ALTER TABLE "holiday_calendars" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"leave_type" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"days" integer NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leave_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "public_holidays" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"country_code" text NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_holidays_day_uq" UNIQUE("tenant_id","country_code","date")
);
--> statement-breakpoint
ALTER TABLE "public_holidays" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "holiday_calendars" ADD CONSTRAINT "holiday_calendars_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_holidays" ADD CONSTRAINT "public_holidays_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leave_requests_employee_idx" ON "leave_requests" USING btree ("employee_id","start_date");--> statement-breakpoint
CREATE INDEX "leave_requests_status_idx" ON "leave_requests" USING btree ("status");--> statement-breakpoint
CREATE POLICY "holiday_calendars_tenant_isolation" ON "holiday_calendars" AS PERMISSIVE FOR ALL TO "xrostr_app" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "leave_requests_tenant_isolation" ON "leave_requests" AS PERMISSIVE FOR ALL TO "xrostr_app" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "public_holidays_tenant_isolation" ON "public_holidays" AS PERMISSIVE FOR ALL TO "xrostr_app" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);