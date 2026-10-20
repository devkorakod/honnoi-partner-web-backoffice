const express = require("express")
const router = express.Router()
router.use(require('./controllers/getData'))

module.exports = router
