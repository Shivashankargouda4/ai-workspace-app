-- 005_code_and_meetings.sql
-- Adds collaborative VS Code-style code_files table (Yjs CRDT + PostgreSQL persistence)
-- and workspace video meetings table with shared notes / transcript persistence.

CREATE TABLE IF NOT EXISTS code_files (
    id SERIAL PRIMARY KEY,
    workspace_id INT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    path VARCHAR(255) NOT NULL,
    language VARCHAR(50) NOT NULL DEFAULT 'javascript',
    content TEXT NOT NULL DEFAULT '',
    yjs_state BYTEA,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workspace_id, path)
);

CREATE INDEX IF NOT EXISTS idx_code_files_workspace ON code_files(workspace_id, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS meetings (
    id SERIAL PRIMARY KEY,
    workspace_id INT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    room_code VARCHAR(64) UNIQUE NOT NULL,
    transcript TEXT NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_meetings_workspace ON meetings(workspace_id, created_at DESC, id DESC);
