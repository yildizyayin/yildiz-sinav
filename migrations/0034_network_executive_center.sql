PRAGMA foreign_keys = ON;

-- A network is managed as a real hierarchy. A role can be limited to one unit;
-- descendants are resolved with a recursive CTE by the API.
CREATE TABLE IF NOT EXISTS network_units (
  id TEXT PRIMARY KEY,
  network_id TEXT NOT NULL REFERENCES institution_networks(id) ON DELETE CASCADE,
  parent_unit_id TEXT REFERENCES network_units(id),
  unit_type TEXT NOT NULL CHECK(unit_type IN ('HEADQUARTERS','REGION','PROVINCE','DISTRICT','CAMPUS')),
  institution_id TEXT REFERENCES institutions(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  city TEXT,
  district TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(network_id, code)
);

CREATE INDEX IF NOT EXISTS idx_network_units_tree
  ON network_units(network_id, parent_unit_id, active, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS idx_network_units_institution
  ON network_units(network_id, institution_id)
  WHERE institution_id IS NOT NULL AND active=1;

ALTER TABLE institution_network_members ADD COLUMN unit_id TEXT REFERENCES network_units(id);
ALTER TABLE network_user_roles ADD COLUMN scope_unit_id TEXT REFERENCES network_units(id);

CREATE INDEX IF NOT EXISTS idx_network_members_unit
  ON institution_network_members(network_id, unit_id, active);
CREATE INDEX IF NOT EXISTS idx_network_roles_scope
  ON network_user_roles(network_id, user_id, scope_unit_id, active);

