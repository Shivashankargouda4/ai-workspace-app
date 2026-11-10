-- 004_v2_features.sql
-- Adds document version snapshots table and 1-to-1 direct message channel uniqueness key

CREATE TABLE IF NOT EXISTS document_snapshots (
    id SERIAL PRIMARY KEY,
    document_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    label VARCHAR(255) NOT NULL,
    content TEXT,
    yjs_state BYTEA NOT NULL,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_doc_snapshots_doc ON document_snapshots(document_id, created_at DESC);

ALTER TABLE channels ADD COLUMN IF NOT EXISTS dm_key VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_org_dm_key
ON channels(org_id, dm_key)
WHERE dm_key IS NOT NULL;
