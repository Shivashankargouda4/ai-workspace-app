const { z } = require('zod');
const crypto = require('crypto');
const db = require('../config/db');
const { createAndPushNotification } = require('../utils/notificationService');

const createOrgSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters'),
  slug: z.string().min(2, 'Slug must be at least 2 characters').regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric and hyphens'),
});

const createWorkspaceSchema = z.object({
  name: z.string().min(2, 'Workspace name must be at least 2 characters'),
  description: z.string().optional(),
});

const createDepartmentSchema = z.object({
  name: z.string().min(2, 'Department name must be at least 2 characters'),
});

const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['admin', 'manager', 'member']).default('member'),
});

// List organizations user belongs to
const getMyOrgs = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT o.id, o.name, o.slug, o.created_at, om.role
       FROM organizations o
       JOIN organization_members om ON o.id = om.org_id
       WHERE om.user_id = $1
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    res.json({ organizations: result.rows });
  } catch (error) {
    console.error('Get my orgs error:', error);
    res.status(500).json({ error: 'Failed to fetch organizations.' });
  }
};

// Create a new organization
const createOrg = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const validatedData = createOrgSchema.parse(req.body);

    await client.query('BEGIN');

    // Check slug uniqueness
    const slugCheck = await client.query('SELECT id FROM organizations WHERE slug = $1', [validatedData.slug]);
    if (slugCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'An organization with this slug already exists.' });
    }

    // Insert Organization
    const orgResult = await client.query(
      `INSERT INTO organizations (name, slug, created_by)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [validatedData.name, validatedData.slug, req.user.id]
    );
    const newOrg = orgResult.rows[0];

    // Add creator as Admin
    await client.query(
      `INSERT INTO organization_members (org_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [newOrg.id, req.user.id]
    );

    // Create a default "General" workspace
    const wsResult = await client.query(
      `INSERT INTO workspaces (org_id, name, description)
       VALUES ($1, 'General Workspace', 'Default workspace for collaboration')
       RETURNING *`,
      [newOrg.id]
    );
    const defaultWorkspace = wsResult.rows[0];

    // Add member to workspace
    await client.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [defaultWorkspace.id, req.user.id]
    );

    // Create default 'general' channel
    await client.query(
      `INSERT INTO channels (workspace_id, org_id, name, type)
       VALUES ($1, $2, 'general', 'public')`,
      [defaultWorkspace.id, newOrg.id]
    );

    // Create default starter project inside default workspace
    const projResult = await client.query(
      `INSERT INTO projects (workspace_id, org_id, name, description, status, created_by)
       VALUES ($1, $2, 'Main Project', 'Default workspace project board', 'active', $3)
       RETURNING *`,
      [defaultWorkspace.id, newOrg.id, req.user.id]
    );
    const defaultProject = projResult.rows[0];

    // Create default starter collaborative document
    await client.query(
      `INSERT INTO documents (workspace_id, org_id, title, content, created_by)
       VALUES ($1, $2, 'Team Shared Notes', 'Shared workspace notes. Open this document in multiple tabs to collaborate live with multi-cursor presence.', $3)`,
      [defaultWorkspace.id, newOrg.id, req.user.id]
    );

    // Create default starter collaborative code files
    await client.query(
      `INSERT INTO code_files (workspace_id, org_id, path, language, content, created_by)
       VALUES
         ($1, $2, 'src/main.js', 'javascript', E'// Collaborative Code Studio (JS Sandbox)\nconst greeting = "Hello from Collaborative Code Studio!";\nconsole.log(greeting);\nconsole.log("2 + 2 =", 2 + 2);', $3),
         ($1, $2, 'src/hello.py', 'python', E'# Collaborative Python File\ndef greet(team: str) -> str:\n    return f"Welcome to {team} Code Studio!"\n\nprint(greet("Workspace"))', $3)`,
      [defaultWorkspace.id, newOrg.id, req.user.id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Organization created successfully',
      organization: newOrg,
      defaultWorkspace,
      defaultProject,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Create org error:', error);
    res.status(500).json({ error: 'Failed to create organization.' });
  } finally {
    client.release();
  }
};

// Get organization details with members, workspaces, and departments
const getOrgDetails = async (req, res) => {
  try {
    const orgId = req.params.orgId;

    const orgRes = await db.query('SELECT * FROM organizations WHERE id = $1', [orgId]);
    if (orgRes.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found.' });
    }

    const membersRes = await db.query(
      `SELECT u.id, u.name, u.email, u.avatar_url, om.role, om.joined_at
       FROM organization_members om
       JOIN users u ON om.user_id = u.id
       WHERE om.org_id = $1
       ORDER BY om.joined_at ASC`,
      [orgId]
    );

    const workspacesRes = await db.query(
      `SELECT * FROM workspaces WHERE org_id = $1 ORDER BY created_at ASC`,
      [orgId]
    );

    const deptRes = await db.query(
      `SELECT * FROM departments WHERE org_id = $1 ORDER BY name ASC`,
      [orgId]
    );

    const projRes = await db.query(
      `SELECT * FROM projects WHERE org_id = $1 ORDER BY created_at ASC, id ASC`,
      [orgId]
    );

    res.json({
      organization: orgRes.rows[0],
      members: membersRes.rows,
      workspaces: workspacesRes.rows,
      departments: deptRes.rows,
      projects: projRes.rows,
      currentUserRole: req.userOrgRole,
    });
  } catch (error) {
    console.error('Get org details error:', error);
    res.status(500).json({ error: 'Failed to fetch organization details.' });
  }
};

// Create department under organization (Admin only)
const createDepartment = async (req, res) => {
  try {
    const orgId = req.params.orgId;
    const validatedData = createDepartmentSchema.parse(req.body);

    const result = await db.query(
      `INSERT INTO departments (org_id, name)
       VALUES ($1, $2)
       RETURNING *`,
      [orgId, validatedData.name]
    );

    res.status(201).json({
      message: 'Department created successfully',
      department: result.rows[0],
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Create department error:', error);
    res.status(500).json({ error: 'Failed to create department.' });
  }
};

// Create workspace in organization (Manager or Admin)
const createWorkspace = async (req, res) => {
  try {
    const orgId = req.params.orgId;
    const validatedData = createWorkspaceSchema.parse(req.body);

    const wsResult = await db.query(
      `INSERT INTO workspaces (org_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [orgId, validatedData.name, validatedData.description || '']
    );
    const newWs = wsResult.rows[0];

    // Automatically join creator as workspace admin
    await db.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [newWs.id, req.user.id]
    );

    // Create default channel
    await db.query(
      `INSERT INTO channels (workspace_id, org_id, name, type)
       VALUES ($1, $2, 'general', 'public')`,
      [newWs.id, orgId]
    );

    res.status(201).json({
      message: 'Workspace created successfully',
      workspace: newWs,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Create workspace error:', error);
    res.status(500).json({ error: 'Failed to create workspace.' });
  }
};

// Create invitation link with cryptographic token
const createInvitation = async (req, res) => {
  try {
    const orgId = req.params.orgId;
    const validatedData = inviteMemberSchema.parse(req.body);

    // Generate random secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const result = await db.query(
      `INSERT INTO invitations (org_id, email, role, token, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, org_id, email, role, token, expires_at, created_at`,
      [orgId, validatedData.email, validatedData.role, token, expiresAt, req.user.id]
    );

    const invite = result.rows[0];

    res.status(201).json({
      message: 'Invitation link generated successfully',
      invitation: invite,
      inviteLink: `/invite/${token}`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Create invitation error:', error);
    res.status(500).json({ error: 'Failed to create invitation.' });
  }
};

// List pending invitations for an organization (Manager or Admin)
const listInvitations = async (req, res) => {
  try {
    const orgId = req.params.orgId;
    const result = await db.query(
      `SELECT id, org_id, email, role, token, expires_at, created_at
       FROM invitations
       WHERE org_id = $1 AND accepted_at IS NULL AND expires_at > CURRENT_TIMESTAMP
       ORDER BY created_at DESC, id DESC
       LIMIT 20`,
      [orgId]
    );
    const invitations = result.rows.map((inv) => ({
      ...inv,
      inviteLink: `/invite/${inv.token}`,
    }));
    res.json({ invitations });
  } catch (error) {
    console.error('List invitations error:', error);
    res.status(500).json({ error: 'Failed to load pending invitations.' });
  }
};

// Accept an invitation link
const acceptInvitation = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const token = String(req.params.token || '').trim();

    await client.query('BEGIN');

    const invRes = await client.query(
      'SELECT * FROM invitations WHERE token = $1',
      [token]
    );

    if (invRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invalid invitation link or token.' });
    }

    const invitation = invRes.rows[0];

    if (invitation.accepted_at) {
      await client.query('ROLLBACK');
      return res.status(410).json({ error: 'This invitation has already been accepted.' });
    }

    if (new Date() > new Date(invitation.expires_at)) {
      await client.query('ROLLBACK');
      return res.status(410).json({ error: 'This invitation has expired.' });
    }

    // Prevent an already-joined user/admin from consuming or downgrading via their own invite
    const existingMember = await client.query(
      'SELECT role FROM organization_members WHERE org_id = $1 AND user_id = $2',
      [invitation.org_id, req.user.id]
    );
    if (existingMember.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `You are already a ${existingMember.rows[0].role} of this organization. Open the invite link from a different user account or Incognito browser to join as a teammate.`,
      });
    }

    // Add user to organization members
    await client.query(
      `INSERT INTO organization_members (org_id, user_id, role)
       VALUES ($1, $2, $3)`,
      [invitation.org_id, req.user.id, invitation.role]
    );

    // Mark invitation as accepted
    await client.query(
      'UPDATE invitations SET accepted_at = CURRENT_TIMESTAMP WHERE id = $1',
      [invitation.id]
    );

    await client.query('COMMIT');

    if (invitation.created_by && invitation.created_by !== req.user.id) {
      await createAndPushNotification(req.app.get('io'), {
        userId: invitation.created_by,
        orgId: invitation.org_id,
        type: 'invitation_accepted',
        title: 'Team Member Joined',
        message: `${req.user.name} accepted an invite and joined as ${invitation.role}.`,
      });
    }

    res.json({
      message: 'Invitation accepted successfully! You have joined the organization.',
      orgId: invitation.org_id,
      role: invitation.role,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Accept invitation error:', error);
    res.status(500).json({ error: 'Failed to accept invitation.' });
  } finally {
    client.release();
  }
};

module.exports = {
  getMyOrgs,
  createOrg,
  getOrgDetails,
  listInvitations,
  createDepartment,
  createWorkspace,
  createInvitation,
  acceptInvitation,
};
