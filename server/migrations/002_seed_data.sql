-- 002_seed_data.sql
-- Demo seed data for AI-Powered Collaborative Workspace

-- 1. Demo Users (passwords hashed for 'password123')
INSERT INTO users (id, name, email, password_hash, avatar_url) VALUES
(1, 'Admin Shiva', 'admin@workspace.local', '$2a$10$RP148cJ6WI30EZqJBNcaDe9OM8L3pNEK15O2Uw6pZkDujl6K4d9P2', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Shiva'),
(2, 'Priya Manager', 'priya@workspace.local', '$2a$10$RP148cJ6WI30EZqJBNcaDe9OM8L3pNEK15O2Uw6pZkDujl6K4d9P2', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Priya'),
(3, 'Rahul Member', 'rahul@workspace.local', '$2a$10$RP148cJ6WI30EZqJBNcaDe9OM8L3pNEK15O2Uw6pZkDujl6K4d9P2', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Rahul')
ON CONFLICT (id) DO NOTHING;

ALTER SEQUENCE users_id_seq RESTART WITH 4;

-- 2. Organization
INSERT INTO organizations (id, name, slug, created_by) VALUES
(1, 'Kishkindha Innovation Lab', 'kishkindha-lab', 1)
ON CONFLICT (id) DO NOTHING;

ALTER SEQUENCE organizations_id_seq RESTART WITH 2;

-- 3. Org Members
INSERT INTO organization_members (org_id, user_id, role) VALUES
(1, 1, 'admin'),
(1, 2, 'manager'),
(1, 3, 'member')
ON CONFLICT (org_id, user_id) DO NOTHING;

-- 4. Workspace
INSERT INTO workspaces (id, org_id, name, description) VALUES
(1, 1, 'Main MCA Development Hub', 'Core workspace for collaborative projects and AI tasks')
ON CONFLICT (id) DO NOTHING;

ALTER SEQUENCE workspaces_id_seq RESTART WITH 2;

-- 5. Workspace Members
INSERT INTO workspace_members (workspace_id, user_id, role) VALUES
(1, 1, 'admin'),
(1, 2, 'manager'),
(1, 3, 'member')
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- 6. Project
INSERT INTO projects (id, workspace_id, org_id, name, description, status, created_by) VALUES
(1, 1, 1, 'AI Collaborative Workspace Project', 'Building the real-time collaboration and predictive analytics platform', 'active', 1)
ON CONFLICT (id) DO NOTHING;

ALTER SEQUENCE projects_id_seq RESTART WITH 2;

-- 7. Demo Tasks
INSERT INTO tasks (id, project_id, org_id, title, description, priority, status, complexity, estimated_days, progress, due_date, created_by) VALUES
(1, 1, 1, 'Design Database Schema and ER Diagram', 'Set up 16 PostgreSQL tables with foreign keys and indexes', 'high', 'done', 4, 2, 100, CURRENT_TIMESTAMP + INTERVAL '2 days', 1),
(2, 1, 1, 'Build JWT Authentication with Refresh Tokens', 'Implement /register, /login, /refresh with httpOnly cookies and Zod validation', 'high', 'in_progress', 5, 3, 50, CURRENT_TIMESTAMP + INTERVAL '3 days', 2),
(3, 1, 1, 'Develop Real-Time Chat System', 'Implement Socket.IO channels, DMs, typing indicators, and message persistence', 'medium', 'todo', 6, 4, 0, CURRENT_TIMESTAMP + INTERVAL '6 days', 3),
(4, 1, 1, 'Train Random Forest Delay Prediction Model', 'Generate synthetic dataset and evaluate with accuracy, F1, ROC-AUC', 'high', 'todo', 7, 4, 0, CURRENT_TIMESTAMP + INTERVAL '10 days', 1)
ON CONFLICT (id) DO NOTHING;

ALTER SEQUENCE tasks_id_seq RESTART WITH 5;

-- 8. Assignees
INSERT INTO task_assignees (task_id, user_id) VALUES
(1, 1),
(2, 2),
(3, 3),
(4, 1)
ON CONFLICT (task_id, user_id) DO NOTHING;

-- 9. Task Status History
INSERT INTO task_status_history (task_id, old_status, new_status, old_progress, new_progress, changed_by) VALUES
(1, 'todo', 'in_progress', 0, 50, 1),
(1, 'in_progress', 'done', 50, 100, 1),
(2, 'todo', 'in_progress', 0, 50, 2);

-- 10. Channel
INSERT INTO channels (id, workspace_id, org_id, name, type) VALUES
(1, 1, 1, 'general', 'public'),
(2, 1, 1, 'project-discussion', 'public')
ON CONFLICT (id) DO NOTHING;

ALTER SEQUENCE channels_id_seq RESTART WITH 3;

-- 11. Initial Messages
INSERT INTO messages (channel_id, user_id, content) VALUES
(1, 1, 'Welcome everyone to the AI-Powered Collaborative Workspace! 🚀'),
(1, 2, 'Great to be here! The backend API setup is progressing smoothly.'),
(2, 3, 'I am reviewing the task board and preparing the chat components.');
