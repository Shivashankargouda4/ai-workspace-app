const db = require('../config/db');

// Resolve every tenant-scoped resource back to its organization through its workspace,
// and verify membership in `organization_members` for the authenticated user.
const RESOURCE_QUERIES = {
  workspace: `
    SELECT w.*, w.org_id AS resolved_org_id, om.role AS member_role
    FROM workspaces w
    JOIN organization_members om ON om.org_id = w.org_id
    WHERE w.id = $1 AND om.user_id = $2
  `,
  project: `
    SELECT p.*, w.org_id AS resolved_org_id, om.role AS member_role
    FROM projects p
    JOIN workspaces w ON p.workspace_id = w.id
    JOIN organization_members om ON om.org_id = w.org_id
    WHERE p.id = $1 AND om.user_id = $2
  `,
  task: `
    SELECT t.*, w.org_id AS resolved_org_id, om.role AS member_role
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    JOIN workspaces w ON p.workspace_id = w.id
    JOIN organization_members om ON om.org_id = w.org_id
    WHERE t.id = $1 AND om.user_id = $2
  `,
  channel: `
    SELECT c.*, w.org_id AS resolved_org_id, om.role AS member_role
    FROM channels c
    JOIN workspaces w ON c.workspace_id = w.id
    JOIN organization_members om ON om.org_id = w.org_id
    WHERE c.id = $1 AND om.user_id = $2
  `,
  file: `
    SELECT f.*, w.org_id AS resolved_org_id, om.role AS member_role
    FROM files f
    JOIN workspaces w ON f.workspace_id = w.id
    JOIN organization_members om ON om.org_id = w.org_id
    WHERE f.id = $1 AND om.user_id = $2
  `,
};

/**
 * Look up a resource by ID only if the user is a member of its resolved organization.
 * Returns the row with `resolved_org_id` and `member_role`, or null when missing/unauthorized.
 */
async function resolveAuthorizedResource(resourceType, resourceId, userId, queryRunner = db) {
  const sql = RESOURCE_QUERIES[resourceType];
  if (!sql) {
    throw new Error(`Unsupported resource type: ${resourceType}`);
  }

  const parsedResourceId = Number(resourceId);
  const parsedUserId = Number(userId);
  if (!Number.isInteger(parsedResourceId) || parsedResourceId <= 0) {
    return null;
  }
  if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) {
    return null;
  }

  const result = await queryRunner.query(sql, [parsedResourceId, parsedUserId]);
  return result.rows[0] || null;
}

module.exports = {
  resolveAuthorizedResource,
};
