
let router = require('express').Router()

router.use("/auth", require("../api/auth/routes"))
router.use("/partner_user", require("../api/partner_user/routes"))
router.use("/2fa", require("../api/two_fa/routes"))

module.exports = router
