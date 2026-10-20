const express = require("express")
const router = express.Router()
router.use(require('./controllers/location'))

module.exports = router
