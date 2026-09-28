CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TABLE IF NOT EXISTS house_project (
  id text PRIMARY KEY,
  project_json jsonb NOT NULL,
  drawing_json jsonb NOT NULL,
  site_json jsonb NOT NULL,
  original_json jsonb,
  site_width double precision NOT NULL,
  site_depth double precision NOT NULL,
  site_geom geometry(Polygon, 0)
);
ALTER TABLE house_project ADD COLUMN IF NOT EXISTS site_geom geometry(Polygon, 0);
ALTER TABLE house_project ADD COLUMN IF NOT EXISTS original_json jsonb;
CREATE TABLE IF NOT EXISTS house_path (
  project_id text NOT NULL REFERENCES house_project(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  layer text,
  candidate_class text,
  original_json jsonb NOT NULL,
  geom geometry(Geometry, 0),
  PRIMARY KEY (project_id, source_id)
);
CREATE INDEX IF NOT EXISTS house_path_geom_idx ON house_path USING gist(geom);
CREATE TABLE IF NOT EXISTS house_measurement (
  project_id text NOT NULL REFERENCES house_project(id) ON DELETE CASCADE,
  source_index integer NOT NULL,
  original_json jsonb NOT NULL,
  PRIMARY KEY (project_id, source_index)
);
