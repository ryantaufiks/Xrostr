-- Shifts created before migration 0016 got the 'UTC' default. Give each site shift its site's
-- zone, and each roving shift its zone's first site's zone, so local dates are read correctly.
UPDATE shifts s SET timezone = l.timezone
FROM locations l
WHERE s.location_id = l.id AND s.timezone = 'UTC';--> statement-breakpoint
UPDATE shifts s SET timezone = (
  SELECT l.timezone FROM zone_locations zl JOIN locations l ON l.id = zl.location_id
  WHERE zl.zone_id = s.zone_id ORDER BY l.id LIMIT 1
)
WHERE s.zone_id IS NOT NULL AND s.timezone = 'UTC'
  AND EXISTS (SELECT 1 FROM zone_locations zl WHERE zl.zone_id = s.zone_id);--> statement-breakpoint
-- An officer on standby can be called in to work: working shifts only clash with working
-- shifts, and standby only with standby.
ALTER TABLE shifts DROP CONSTRAINT shifts_no_overlap;--> statement-breakpoint
ALTER TABLE shifts ADD CONSTRAINT shifts_no_overlap EXCLUDE USING gist (employee_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE (status <> 'cancelled' AND kind <> 'standby');--> statement-breakpoint
ALTER TABLE shifts ADD CONSTRAINT shifts_no_standby_overlap EXCLUDE USING gist (employee_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE (status <> 'cancelled' AND kind = 'standby');
