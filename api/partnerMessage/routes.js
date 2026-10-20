const express = require("express")
const router = express.Router()
router.use(require('./controllers/partnerMessage'))

module.exports = router
