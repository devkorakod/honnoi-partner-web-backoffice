const express = require("express")
const router = express.Router()
router.use(require('./controllers/two_fa'))

module.exports = router
