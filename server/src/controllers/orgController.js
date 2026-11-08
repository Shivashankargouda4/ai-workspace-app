const { z } = require('zod');
const db = require('../config/db');

const createOrgSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters'),
  slug: z.string().min(2, 'Slug must be at least 2 characters').regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric and hyphens'),
});

const createWorkspaceSchema = z.object({
  name: z.string().min(2, 'Workspace name must be at least 2 characters'),
  description: z.string().optional(),
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

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Organization created successfully',
      organization: newOrg,
      defaultWorkspace,
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

// Get organization details with members & workspaces
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

    res.json({
      organization: orgRes.rows[0],
      members: membersRes.rows,
      workspaces: workspacesRes.rows,
      currentUserRole: req.userOrgRole,
    });
  } catch (error) {
    console.error('Get org details error:', error);
    res.status(500).json({ error: 'Failed to fetch organization details.' });
  }
};

// Create workspace in organization
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

module.exports = {
  getMyOrgs,
  createOrg,
  getOrgDetails,
  createWorkspace,
};
