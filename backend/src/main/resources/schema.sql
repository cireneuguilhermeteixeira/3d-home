CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TABLE IF NOT EXISTS house_project (
  id text PRIMARY KEY,
  project_json jsonb NOT NULL,
  drawing_json jsonb NOT NULL,
  site_json jsonb NOT NULL,
  original_json jsonb,
  site_width double precision NOT NULL,
  site_depth double precision NOT NULL,
  site_geom geometry(Polygon, 0),
  site_geom_original geometry(Polygon, 0)
);
ALTER TABLE house_project ADD COLUMN IF NOT EXISTS site_geom geometry(Polygon, 0);
ALTER TABLE house_project ADD COLUMN IF NOT EXISTS site_geom_original geometry(Polygon, 0);
ALTER TABLE house_project ADD COLUMN IF NOT EXISTS original_json jsonb;
CREATE TABLE IF NOT EXISTS house_path (
  project_id text NOT NULL REFERENCES house_project(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  layer text,
  candidate_class text,
  original_json jsonb NOT NULL,
  geom geometry(Geometry, 0),
  geom_original geometry(Geometry, 0),
  PRIMARY KEY (project_id, source_id)
);
ALTER TABLE house_path ADD COLUMN IF NOT EXISTS geom_original geometry(Geometry, 0);
CREATE INDEX IF NOT EXISTS house_path_geom_idx ON house_path USING gist(geom);
CREATE INDEX IF NOT EXISTS house_path_geom_original_idx ON house_path USING gist(geom_original);
CREATE TABLE IF NOT EXISTS house_measurement (
  project_id text NOT NULL REFERENCES house_project(id) ON DELETE CASCADE,
  source_index integer NOT NULL,
  original_json jsonb NOT NULL,
  PRIMARY KEY (project_id, source_index)
);
CREATE TABLE IF NOT EXISTS house_text (
  project_id text NOT NULL REFERENCES house_project(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  original_json jsonb NOT NULL,
  geom geometry(Point, 0),
  geom_original geometry(Point, 0),
  PRIMARY KEY (project_id, source_id)
);
CREATE TABLE IF NOT EXISTS house_semantic_item (
  project_id text NOT NULL REFERENCES house_project(id) ON DELETE CASCADE,
  kind text NOT NULL,
  source_id text NOT NULL,
  original_json jsonb NOT NULL,
  geom geometry(Point, 0),
  geom_original geometry(Point, 0),
  PRIMARY KEY (project_id, kind, source_id)
);
CREATE TABLE IF NOT EXISTS house_derived_wall (
  project_id text NOT NULL REFERENCES house_project(id) ON DELETE CASCADE,
  layout_mode text NOT NULL,
  id text NOT NULL,
  source_path_ids jsonb NOT NULL,
  axis geometry(LineString, 0) NOT NULL,
  thickness double precision NOT NULL,
  height double precision,
  height_source_id text,
  status text NOT NULL,
  PRIMARY KEY (project_id, layout_mode, id)
);
CREATE INDEX IF NOT EXISTS house_derived_wall_axis_idx ON house_derived_wall USING gist(axis);
CREATE TABLE IF NOT EXISTS house_derived_opening (
  project_id text NOT NULL REFERENCES house_project(id) ON DELETE CASCADE,
  layout_mode text NOT NULL,
  id text NOT NULL,
  source_path_ids jsonb NOT NULL,
  source_text_ids jsonb NOT NULL,
  measurement_ids jsonb NOT NULL,
  wall_id text,
  type text NOT NULL,
  status text NOT NULL,
  center geometry(Point, 0) NOT NULL,
  position_along_wall double precision,
  width double precision,
  height double precision,
  sill_height double precision,
  annotation_id text,
  subtype text,
  transom_height double precision,
  span geometry(LineString, 0),
  PRIMARY KEY (project_id, layout_mode, id)
);
ALTER TABLE house_derived_opening ADD COLUMN IF NOT EXISTS annotation_id text;
ALTER TABLE house_derived_opening ADD COLUMN IF NOT EXISTS subtype text;
ALTER TABLE house_derived_opening ADD COLUMN IF NOT EXISTS transom_height double precision;
ALTER TABLE house_derived_opening ADD COLUMN IF NOT EXISTS span geometry(LineString, 0);
CREATE INDEX IF NOT EXISTS house_derived_opening_center_idx ON house_derived_opening USING gist(center);
CREATE TABLE IF NOT EXISTS house_derived_room_marker (
  project_id text NOT NULL REFERENCES house_project(id) ON DELETE CASCADE,
  layout_mode text NOT NULL,
  id text NOT NULL,
  label text NOT NULL,
  source_text_id text NOT NULL,
  center geometry(Point, 0) NOT NULL,
  status text NOT NULL,
  room_type text,
  PRIMARY KEY (project_id, layout_mode, id)
);
ALTER TABLE house_derived_room_marker ADD COLUMN IF NOT EXISTS room_type text;
