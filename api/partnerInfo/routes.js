const express = require("express")
const router = express.Router()
router.use(require('./controllers/partnerInfo'))

module.exports = router
