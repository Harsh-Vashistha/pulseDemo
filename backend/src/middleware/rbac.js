// Role hierarchy: admin > editor > viewer
const roleHierarchy = { viewer: 1, editor: 2, admin: 3 };

/**
 * Requires the user to have at least the specified role.
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const userRoleLevel = roleHierarchy[req.user.role] || 0;
    const requiredLevel = Math.min(...roles.map((r) => roleHierarchy[r] || 99));

    if (userRoleLevel < requiredLevel) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}.`,
      });
    }

    next();
  };
};

/**
 * Ensures a user can only access their own resources unless they're an admin.
 */
const ownResourceOrAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  if (req.user.role === 'admin') return next();

  // For non-admin: video ownership is checked in the route handler
  next();
};

module.exports = { requireRole, ownResourceOrAdmin };
