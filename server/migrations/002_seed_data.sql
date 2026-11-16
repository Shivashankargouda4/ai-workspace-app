-- 002_seed_data.sql
-- Demo seed data for AI-Powered Collaborative Workspace

-- 1. Demo Users (passwords hashed for 'password123' with bcrypt cost 12)
INSERT INTO users (id, name, email, password_hash, avatar_url) VALUES
(1, 'Admin Shiva', 'admin@workspace.local', '$2a$12$t/GqWA6xpfpw1mXaKXrZSe2lo74KQVH1SjXuNftL3DRjiWSGv0E3K', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Shiva'),
(2, 'Priya Manager', 'priya@workspace.local', '$2a$12$t/GqWA6xpfpw1mXaKXrZSe2lo74KQVH1SjXuNftL3DRjiWSGv0E3K', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Priya'),
(3, 'Rahul Member', 'rahul@workspace.local', '$2a$12$t/GqWA6xpfpw1mXaKXrZSe2lo74KQVH1SjXuNftL3DRjiWSGv0E3K', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Rahul')
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

-- 12. Starter Collaborative Document
INSERT INTO documents (id, workspace_id, org_id, title, content, created_by) VALUES
(1, 1, 1, 'Project Sprint Notes', 'Shared team notes for Kishkindha Innovation Lab. Open this page in two browser tabs to test real-time CRDT editing and live multi-cursor presence.', 1)
ON CONFLICT (id) DO NOTHING;

SELECT setval('documents_id_seq', GREATEST((SELECT COALESCE(MAX(id), 1) FROM documents), 1));

-- 13. Starter Collaborative Code Files (Code Studio)
INSERT INTO code_files (id, workspace_id, org_id, path, language, content, created_by) VALUES
(1, 1, 1, 'src/main.js', 'javascript', E'// Collaborative VS Code Studio (CRDT + Monaco)\nfunction calculateSprintVelocity(completed, total) {\n  if (!total) return 0;\n  return Math.round((completed / total) * 100);\n}\n\nconsole.log("Workspace Velocity:", calculateSprintVelocity(4, 5) + "%");\nconsole.log("Ready for live multi-cursor pair programming!");', 1),
(2, 1, 1, 'src/risk_check.py', 'python', E'# Collaborative Python Script (Runs safely in browser WebAssembly via Pyodide)\ndef estimate_risk(complexity: int, progress: int) -> str:\n    score = (complexity * 10) - progress\n    if score >= 50:\n        return "HIGH"\n    if score >= 20:\n        return "MEDIUM"\n    return "LOW"\n\nfor c, p in [(8, 20), (3, 75)]:\n    print(f"Complexity={c}, Progress={p}% -> Risk={estimate_risk(c, p)}")', 1),
(3, 1, 1, 'src/preview.html', 'html', E'<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    body { font-family: system-ui, sans-serif; padding: 24px; background: #f8fafc; color: #0f172a; }\n    .card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; max-width: 420px; box-shadow: 0 4px 12px rgba(15,23,42,.06); }\n    .badge { display: inline-block; background: #4f46e5; color: #fff; font-size: 12px; padding: 4px 10px; border-radius: 999px; }\n  </style>\n</head>\n<body>\n  <div class="card">\n    <span class="badge">Live Sandbox Preview</span>\n    <h2>Workspace Code Studio</h2>\n    <p>Edit this HTML and click <strong>Run</strong> to update the preview safely in real time.</p>\n  </div>\n</body>\n</html>', 1)
ON CONFLICT (id) DO NOTHING;

SELECT setval('code_files_id_seq', GREATEST((SELECT COALESCE(MAX(id), 1) FROM code_files), 1));
