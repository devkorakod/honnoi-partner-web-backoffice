
let router = require('express').Router()

router.use("/auth", require("../api/auth/routes"))
router.use("/partner_user", require("../api/partner_user/routes"))
router.use("/2fa", require("../api/two_fa/routes"))
router.use("/location", require("../api/location/routes"))
router.use("/getData", require("../api/getData/routes"))
router.use("/partnerInfo", require("../api/partnerInfo/routes"))

module.exports = router
