/*
  # Planning events system

  1. New tables
    - planning_locations
      - id uuid primary key
      - name text
      - color text
      - created_at timestamptz
    - planning_providers
      - id uuid primary key
      - name text
      - created_at timestamptz
    - planning_events
      - id uuid primary key
      - event_date date
      - location_id uuid references planning_locations(id)
      - provider_ids uuid[]
      - created_at timestamptz
*/

CREATE TABLE IF NOT EXISTS planning_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text DEFAULT '#FFFFFF',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS planning_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS planning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date date NOT NULL,
  location_id uuid REFERENCES planning_locations(id) ON DELETE SET NULL,
  provider_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

