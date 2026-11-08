// Demo Seed Script - Ensures database always starts with verified, demo-ready records
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const bcrypt = require('bcryptjs');
const db = require('./src/config/db');

async function seedDemo() {
  console.log('==================================================');
  console.log('  SEEDING DATABASE WITH MCA DEMO RECORDS');
  console.log('==================================================\n');

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Generate live bcrypt hash with salt rounds = 12
    console.log('1. Generating bcrypt hash (salt rounds: 12)...');
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash('password123', salt);

    // 2. Insert Users
    console.log('2. Seeding demo users...');
    const users = [
      { id: 1, name: 'Admin Shiva', email: 'admin@workspace.local', role: 'admin' },
      { id: 2, name: 'Priya Manager', email: 'priya@workspace.local', role: 'manager' },
      { id: 3, name: 'Rahul Member', email: 'rahul@workspace.local', role: 'member' },
    ];

    for (const u of users) {
      await client.query(
        `INSERT INTO users (id, name, email, password_hash, avatar_url)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE 
         SET name = EXCLUDED.name, email = EXCLUDED.email, password_hash = EXCLUDED.password_hash`,
        [u.id, u.name, u.email, passwordHash, `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.name}`]
      );
    }
    await client.query(`SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));`);
    console.log('   ✅ 3 users seeded (password for all: password123)');

    // 3. Insert Organization
    console.log('3. Seeding Organization 1 (Kishkindha Innovation Lab)...');
    await client.query(
      `INSERT INTO organizations (id, name, slug, created_by)
       VALUES (1, 'Kishkindha Innovation Lab', 'kishkindha-lab', 1)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug`
    );
    await client.query(`SELECT setval('organizations_id_seq', (SELECT MAX(id) FROM organizations));`);

    // 4. Assign Organization Members
    for (const u of users) {
      await client.query(
        `INSERT INTO organization_members (org_id, user_id, role)
         VALUES (1, $1, $2)
         ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
        [u.id, u.role]
      );
    }
    console.log('   ✅ Organization memberships assigned with roles (admin, manager, member)');

    // 5. Insert Workspace
    console.log('5. Seeding Workspace...');
    await client.query(
      `INSERT INTO workspaces (id, org_id, name, description)
       VALUES (1, 1, 'Main MCA Development Hub', 'Core workspace for collaborative projects and predictive analytics')
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`
    );
    await client.query(`SELECT setval('workspaces_id_seq', (SELECT MAX(id) FROM workspaces));`);

    // 6. Assign Workspace Members
    for (const u of users) {
      await client.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role)
         VALUES (1, $1, $2)
         ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
        [u.id, u.role]
      );
    }

    // 7. Insert Project
    console.log('7. Seeding Project...');
    await client.query(
      `INSERT INTO projects (id, workspace_id, org_id, name, description, status, created_by)
       VALUES (1, 1, 1, 'AI Collaborative Workspace Project', 'Building the real-time collaboration and predictive analytics platform', 'active', 1)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`
    );
    await client.query(`SELECT setval('projects_id_seq', (SELECT MAX(id) FROM projects));`);

    // 8. Insert Tasks across all 4 Kanban columns
    console.log('8. Seeding tasks across Kanban columns...');
    const tasks = [
      {
        id: 1,
        title: 'Design 16-Table PostgreSQL Schema',
        desc: 'Define tables, foreign keys, and indexes for multi-tenant isolation',
        priority: 'high',
        status: 'done',
        complexity: 6,
        days: 3,
        progress: 100,
        risk: 'low',
        prob: 0.12,
        assignee: 1,
      },
      {
        id: 2,
        title: 'Train Task Delay Predictor Model',
        desc: 'Train Random Forest on synthetic dataset and compare to Logistic Regression',
        priority: 'high',
        status: 'done',
        complexity: 7,
        days: 4,
        progress: 100,
        risk: 'low',
        prob: 0.15,
        assignee: 1,
      },
      {
        id: 3,
        title: 'WebSocket Live Chat Persistence',
        desc: 'Implement persist-then-broadcast message handling in Socket.IO',
        priority: 'medium',
        status: 'in_progress',
        complexity: 5,
        days: 3,
        progress: 60,
        risk: 'medium',
        prob: 0.48,
        assignee: 2,
      },
      {
        id: 4,
        title: 'Recharts Visual Analytics Dashboard',
        desc: 'Build donut charts for workflow stages and member workload bar charts',
        priority: 'high',
        status: 'in_progress',
        complexity: 8,
        days: 5,
        progress: 25,
        risk: 'high',
        prob: 0.91,
        assignee: 1,
      },
      {
        id: 5,
        title: 'PWA Manifest & Mobile Viewport',
        desc: 'Configure web app manifest and test mobile responsive layout',
        priority: 'low',
        status: 'todo',
        complexity: 3,
        days: 2,
        progress: 0,
        risk: 'low',
        prob: 0.22,
        assignee: 3,
      },
    ];

    for (const t of tasks) {
      await client.query(
        `INSERT INTO tasks (id, project_id, org_id, title, description, priority, status, complexity, estimated_days, progress, due_date, created_by)
         VALUES ($1, 1, 1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP + INTERVAL '3 days', 1)
         ON CONFLICT (id) DO UPDATE 
         SET title = EXCLUDED.title, status = EXCLUDED.status, priority = EXCLUDED.priority, 
             complexity = EXCLUDED.complexity, estimated_days = EXCLUDED.estimated_days, progress = EXCLUDED.progress`,
        [t.id, t.title, t.desc, t.priority, t.status, t.complexity, t.days, t.progress]
      );

      // Assignee
      await client.query(
        `INSERT INTO task_assignees (task_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (task_id, user_id) DO NOTHING`,
        [t.id, t.assignee]
      );

      // Task prediction
      await client.query(
        `INSERT INTO task_predictions (task_id, delay_probability, risk_level, model_version)
         VALUES ($1, $2, $3, 'rf-v1.0')
         ON CONFLICT DO NOTHING`,
        [t.id, t.prob, t.risk]
      );

      // Audit history
      await client.query(
        `INSERT INTO task_status_history (task_id, old_status, new_status, changed_by)
         VALUES ($1, 'todo', $2, 1)`,
        [t.id, t.status]
      );
    }
    await client.query(`SELECT setval('tasks_id_seq', (SELECT MAX(id) FROM tasks));`);
    console.log('   ✅ 5 tasks seeded with assignees, ML predictions, and audit history');

    // 9. Channel and Messages
    console.log('9. Seeding Chat Channel and Messages...');
    await client.query(
      `INSERT INTO channels (id, workspace_id, org_id, name, type)
       VALUES (1, 1, 1, 'general', 'public')
       ON CONFLICT (id) DO NOTHING`
    );
    await client.query(`SELECT setval('channels_id_seq', (SELECT MAX(id) FROM channels));`);

    const messages = [
      { userId: 1, text: 'Welcome to the MCA Real-Time Collaborative Workspace platform!' },
      { userId: 2, text: 'PostgreSQL database and REST controllers are verified with 100% test coverage.' },
      { userId: 3, text: 'Machine Learning delay forecasts are rendering live risk badges on the Kanban cards.' },
    ];

    for (const m of messages) {
      await client.query(
        `INSERT INTO messages (channel_id, user_id, content)
         VALUES (1, $1, $2)`,
        [m.userId, m.text]
      );
    }
    console.log('   ✅ Seeded #general channel with sample team messages');

    await client.query('COMMIT');
    console.log('\n==================================================');
    console.log('  DEMO DATABASE SEEDING COMPLETED SUCCESSFULLY!');
    console.log('==================================================');
    console.log('\nDemo Logins (Password for all accounts: password123):');
    console.log('  - Admin:   admin@workspace.local');
    console.log('  - Manager: priya@workspace.local');
    console.log('  - Member:  rahul@workspace.local\n');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Seed error:', error);
  } finally {
    client.release();
    await db.pool.end();
  }
}

seedDemo();
