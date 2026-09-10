const express = require("express")
const router = express.Router()
router.use(require('./controllers/partner_user'))

module.exports = router
