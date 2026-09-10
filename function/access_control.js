const status_code = require("../error/error_code");

// bo_user (staff) tokens carry staffId, partner_user tokens carry userId —
// these two middlewares tell the two apart so staff-only management routes
// can't be called with a partner's own token and vice versa.
const requireStaff = (req, res, next) => {
  const auth = req.auth || {};

  if (!auth.staffId) {
    return res.status(401).json({
      status_code: 10008,
      status_phrase: status_code[10008],
      message: "requires staff login",
    });
  }

  next();
};

const requirePartner = (req, res, next) => {
  const auth = req.auth || {};

  if (!auth.userId) {
    return res.status(401).json({
      status_code: 10008,
      status_phrase: status_code[10008],
      message: "requires partner login",
    });
  }

  next();
};

module.exports = { requireStaff, requirePartner };
