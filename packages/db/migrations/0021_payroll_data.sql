CREATE TABLE "employee_bank_accounts" (
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid PRIMARY KEY NOT NULL,
	"bank_name" text NOT NULL,
	"account_no_enc" text NOT NULL,
	"account_name" text NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_bank_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pay_policies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"overtime_enabled" boolean DEFAULT true NOT NULL,
	"rounding_minutes" integer DEFAULT 15 NOT NULL,
	"late_grace_minutes" integer DEFAULT 0 NOT NULL,
	"late_deduction" text DEFAULT 'none' NOT NULL,
	"standby_rate" bigint DEFAULT 0 NOT NULL,
	"standby_unit" text DEFAULT 'shift' NOT NULL,
	"callout_amount" bigint DEFAULT 0 NOT NULL,
	"night_allowance" bigint DEFAULT 0 NOT NULL,
	"tax_method" text DEFAULT 'gross' NOT NULL,
	"bank_format" text,
	"pay_day" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "pay_policies_entity_uq" UNIQUE("legal_entity_id")
);
--> statement-breakpoint
ALTER TABLE "pay_policies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pay_profile_allowances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"kind" text NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pay_profile_allowances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pay_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"pay_cycle" text NOT NULL,
	"pay_basis" text NOT NULL,
	"base_amount" bigint DEFAULT 0 NOT NULL,
	"work_days_per_week" integer NOT NULL,
	"overtime_eligible" boolean DEFAULT true NOT NULL,
	"tax_method" text,
	"ptkp_status" text,
	"tax_id_enc" text,
	"bpjs_tk_no_enc" text,
	"bpjs_kes_no_enc" text,
	"sg_residency" text,
	"sg_shg_fund" text,
	"pwm_grade" text,
	"date_of_birth_enc" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_profiles_version_uq" UNIQUE("employee_id","effective_from")
);
--> statement-breakpoint
ALTER TABLE "pay_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "timesheet_corrections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"check_in_set" boolean DEFAULT false NOT NULL,
	"check_in_at" timestamp with time zone,
	"check_out_set" boolean DEFAULT false NOT NULL,
	"check_out_at" timestamp with time zone,
	"reason" text NOT NULL,
	"corrected_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "timesheet_corrections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "employee_bank_accounts" ADD CONSTRAINT "employee_bank_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_bank_accounts" ADD CONSTRAINT "employee_bank_accounts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_policies" ADD CONSTRAINT "pay_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_policies" ADD CONSTRAINT "pay_policies_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_profile_allowances" ADD CONSTRAINT "pay_profile_allowances_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_profile_allowances" ADD CONSTRAINT "pay_profile_allowances_profile_id_pay_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."pay_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_profiles" ADD CONSTRAINT "pay_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_profiles" ADD CONSTRAINT "pay_profiles_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_corrections" ADD CONSTRAINT "timesheet_corrections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_corrections" ADD CONSTRAINT "timesheet_corrections_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pay_profile_allowances_profile_idx" ON "pay_profile_allowances" USING btree ("profile_id","position");--> statement-breakpoint
CREATE INDEX "timesheet_corrections_shift_idx" ON "timesheet_corrections" USING btree ("shift_id","created_at");--> statement-breakpoint
CREATE POLICY "employee_bank_accounts_tenant_isolation" ON "employee_bank_accounts" AS PERMISSIVE FOR ALL TO "xrostr_app" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "pay_policies_tenant_isolation" ON "pay_policies" AS PERMISSIVE FOR ALL TO "xrostr_app" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "pay_profile_allowances_tenant_isolation" ON "pay_profile_allowances" AS PERMISSIVE FOR ALL TO "xrostr_app" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "pay_profiles_tenant_isolation" ON "pay_profiles" AS PERMISSIVE FOR ALL TO "xrostr_app" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "timesheet_corrections_tenant_isolation" ON "timesheet_corrections" AS PERMISSIVE FOR ALL TO "xrostr_app" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
-- Adds the payroll permissions to the built-in tenant_admin and hr roles of existing tenants.
UPDATE roles SET permissions = ARRAY['tenant.settings.read', 'tenant.settings.manage', 'entities.read', 'entities.manage', 'users.read', 'users.manage', 'roles.read', 'roles.manage', 'audit.read', 'employees.read', 'employees.manage', 'locations.read', 'locations.manage', 'schedules.read', 'schedules.manage', 'leave.approve', 'holidays.manage', 'patrols.read', 'patrols.manage', 'alerts.respond', 'payroll.read', 'payroll.manage', 'payroll.approve']::text[] WHERE is_system AND key = 'tenant_admin';--> statement-breakpoint
UPDATE roles SET permissions = ARRAY['tenant.settings.read', 'entities.read', 'users.read', 'users.manage', 'audit.read', 'employees.read', 'employees.manage', 'locations.read', 'schedules.read', 'leave.approve', 'holidays.manage', 'patrols.read', 'payroll.read', 'payroll.manage']::text[] WHERE is_system AND key = 'hr';
