const jwt = require('jsonwebtoken');
const db = require('../config/db');

/**
 * Middleware to verify JWT Access Token
 */
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET || 'super_secret_access_token_key');

    // Retrieve user from DB to verify active status
    const result = await db.query('SELECT id, name, email, avatar_url FROM users WHERE id = $1', [decoded.userId]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User no longer exists.' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid authentication token.' });
  }
};

/**
 * Middleware to verify organization membership and optional role requirement
 * @param {'admin'|'manager'|'member'} minimumRole
 */
const requireRole = (minimumRole = 'member') => {
  const roleWeights = { member: 1, manager: 2, admin: 3 };

  return async (req, res, next) => {
    try {
      const orgId = req.params.orgId || req.body.org_id || req.query.org_id || req.headers['x-org-id'];
      if (!orgId) {
        return res.status(400).json({ error: 'Organization ID is required for this operation.' });
      }

      const membership = await db.query(
        'SELECT role FROM organization_members WHERE org_id = $1 AND user_id = $2',
        [orgId, req.user.id]
      );

      if (membership.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied. You are not a member of this organization.' });
      }

      const userRole = membership.rows[0].role;
      req.userOrgRole = userRole;
      req.orgId = parseInt(orgId);

      if (roleWeights[userRole] < roleWeights[minimumRole]) {
        return res.status(403).json({
          error: `Access denied. Requires '${minimumRole}' privileges, but you have '${userRole}'.`
        });
      }

      next();
    } catch (error) {
      console.error('Role check error:', error);
      res.status(500).json({ error: 'Internal server error verifying role permissions.' });
    }
  };
};

module.exports = {
  requireAuth,
  requireRole,
};
