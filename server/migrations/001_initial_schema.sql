-- 001_initial_schema.sql
-- Complete schema for AI-Powered Collaborative Workspace
-- All timestamps are stored as TIMESTAMPTZ (UTC)

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Organizations
CREATE TABLE IF NOT EXISTS organizations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Organization Members (Roles: 'admin', 'manager', 'member')
CREATE TABLE IF NOT EXISTS organization_members (
    id SERIAL PRIMARY KEY,
    org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member' CHECK (role IN ('admin', 'manager', 'member')),
    joined_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(org_id, user_id)
);

-- 4. Workspaces
CREATE TABLE IF NOT EXISTS workspaces (
    id SERIAL PRIMARY KEY,
    org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. Workspace Members
CREATE TABLE IF NOT EXISTS workspace_members (
    id SERIAL PRIMARY KEY,
    workspace_id INT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member' CHECK (role IN ('admin', 'manager', 'member')),
    joined_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workspace_id, user_id)
);

-- 6. Projects
CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    workspace_id INT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'archived', 'completed')),
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. Tasks
CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    priority VARCHAR(50) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    status VARCHAR(50) DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
    complexity INT DEFAULT 3 CHECK (complexity BETWEEN 1 AND 10),
    estimated_days INT DEFAULT 3,
    progress INT DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    due_date TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8. Task Assignees (Many-to-Many)
CREATE TABLE IF NOT EXISTS task_assignees (
    id SERIAL PRIMARY KEY,
    task_id INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(task_id, user_id)
);

-- 9. Task Comments
CREATE TABLE IF NOT EXISTS task_comments (
    id SERIAL PRIMARY KEY,
    task_id INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 10. Task Status History (Audit trail & ML feature source)
CREATE TABLE IF NOT EXISTS task_status_history (
    id SERIAL PRIMARY KEY,
    task_id INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    old_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    old_progress INT,
    new_progress INT NOT NULL,
    changed_by INT REFERENCES users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 11. Channels
CREATE TABLE IF NOT EXISTS channels (
    id SERIAL PRIMARY KEY,
    workspace_id INT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) DEFAULT 'public' CHECK (type IN ('public', 'direct')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 12. Messages
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    channel_id INT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 13. Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 14. Documents (Collaborative editor state)
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    workspace_id INT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    yjs_state BYTEA,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 15. Files
CREATE TABLE IF NOT EXISTS files (
    id SERIAL PRIMARY KEY,
    workspace_id INT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    path TEXT NOT NULL,
    mime_type VARCHAR(100),
    size INT,
    uploaded_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 16. Task Predictions (ML delay forecast)
CREATE TABLE IF NOT EXISTS task_predictions (
    id SERIAL PRIMARY KEY,
    task_id INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    delay_probability FLOAT NOT NULL,
    risk_level VARCHAR(20) NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
    model_version VARCHAR(50) DEFAULT 'rf-v1.0',
    predicted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance & multi-tenant isolation
CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(org_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_org ON tasks(org_id);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_status_history_task ON task_status_history(task_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
