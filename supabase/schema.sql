-- Projects: each represents a prototype deployment being reviewed
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  webhook_token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Annotations: persisted agentation Annotation objects
CREATE TABLE annotations (
  id TEXT PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  element_path TEXT NOT NULL,
  element TEXT NOT NULL,
  page_url TEXT,
  x FLOAT NOT NULL,
  y FLOAT NOT NULL,
  bounding_box JSONB,
  react_components TEXT,
  css_classes TEXT,
  computed_styles TEXT,
  accessibility TEXT,
  nearby_text TEXT,
  selected_text TEXT,
  intent TEXT CHECK (intent IN ('fix', 'change', 'question', 'approve')),
  severity TEXT CHECK (severity IN ('blocking', 'important', 'suggestion')),
  kind TEXT DEFAULT 'feedback' CHECK (kind IN ('feedback', 'placement', 'rearrange')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'resolved', 'dismissed')),
  placement JSONB,
  rearrange JSONB,
  author TEXT,
  annotation_timestamp BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Screenshots: optional viewport captures
CREATE TABLE screenshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  annotation_id TEXT REFERENCES annotations(id) ON DELETE SET NULL,
  page_url TEXT NOT NULL,
  image_url TEXT NOT NULL,
  viewport JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_annotations_project_id ON annotations(project_id);
CREATE INDEX idx_annotations_status ON annotations(status);
CREATE INDEX idx_annotations_page_url ON annotations(page_url);
CREATE INDEX idx_screenshots_project_id ON screenshots(project_id);
