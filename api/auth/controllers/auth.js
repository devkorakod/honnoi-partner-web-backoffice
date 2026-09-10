const express = require('express')
const router = express.Router()

const func = require('../function/auth')
const passport = require('passport')
const GoogleStrategy = require('passport-google-oidc').Strategy

const FE_BASE = process.env.WEB_HONNOI_PARTNER_URL || ''

const mustEnv = [
  'WEB_HONNOI_PARTNER_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_CALLBACK_URL'
]

for (const k of mustEnv) {
  if (!process.env[k]) {
    console.log(`[AUTH ENV MISSING] ${k} is missing`)
  }
}

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      scope: ['openid', 'profile', 'email']
    },
    async function verify(issuer, profile, cb) {
      try {
        return cb(null, profile)
      } catch (err) {
        return cb(err)
      }
    }
  )
)

passport.serializeUser((user, cb) => cb(null, user))
passport.deserializeUser((obj, cb) => cb(null, obj))

router.post('/login_bo_user', async (req, res) => {
  try {
    const response = await func.login_bo_user(req.body)
    res.status(200).json(response)
  } catch (error) {
    console.log('login_bo_user error:', error)
    res.status(500).json({ error: error.message || error })
  }
})

router.post('/login', async (req, res) => {
  try {
    const response = await func.loginPartner(req.body)
    res.status(200).json(response)
  } catch (error) {
    console.log('login error:', error)
    res.status(500).json({ error: error.message || error })
  }
})

router.get('/google', passport.authenticate('google', { session: false }))
router.get('/google/login', passport.authenticate('google', { session: false }))

router.get('/google/callback', (req, res, next) => {
  if (req.query.error === 'access_denied') {
    return res.redirect(`${FE_BASE}/login?error=google_cancelled`)
  }
  passport.authenticate('google', { session: false }, async (err, profile) => {
    try {
      if (err || !profile) {
        return res.redirect(`${FE_BASE}/login?error=google_failed`)
      }

      const response = await func.loginPartnerWithGoogle(profile)

      if (!response || response.status_code !== 200) {
        return res.redirect(`${FE_BASE}/login?error=google_failed`)
      }

      if (response.twofa_required) {
        const pendingToken = encodeURIComponent(response.pendingToken)
        const methods = encodeURIComponent(response.methods.join(','))
        return res.redirect(`${FE_BASE}/login/2fa?pendingToken=${pendingToken}&methods=${methods}`)
      }

      const token = encodeURIComponent(response.token || '')
      return res.redirect(`${FE_BASE}/auth/callback?provider=google&token=${token}`)
    } catch (e) {
      console.log('google callback error:', e)
      return res.redirect(`${FE_BASE}/login?error=internal`)
    }
  })(req, res, next)
})

router.get('/google/fail', (req, res) => {
  return res.redirect(`${FE_BASE}/login?error=google_failed`)
})

router.post('/2fa/send-otp', async (req, res) => {
  try {
    const response = await func.sendTwoFaOtp(req.body)
    res.status(200).json(response)
  } catch (error) {
    console.log('2fa/send-otp error:', error)
    res.status(500).json({ error: error.message || error })
  }
})

router.post('/2fa/verify', async (req, res) => {
  try {
    const response = await func.verifyTwoFa(req.body)
    res.status(200).json(response)
  } catch (error) {
    console.log('2fa/verify error:', error)
    res.status(500).json({ error: error.message || error })
  }
})

module.exports = router
