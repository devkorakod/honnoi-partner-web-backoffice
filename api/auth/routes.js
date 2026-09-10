const express = require("express")
const router = express.Router()
router.use(require('./controllers/auth'))

module.exports = router
