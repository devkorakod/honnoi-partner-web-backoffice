const dayjs = require('dayjs')
const axios = require('axios')
const encode = require('../../../function/encode')
const emailFunction = require('../../../function/email')
const totp = require('../../../function/totp')
const status_code = require('../../../error/error_code')
const { honnoi } = require('../../../knex/knexfile')

const LOGIN_MAX_ATTEMPTS = parseInt(process.env.PARTNER_LOGIN_MAX_ATTEMPTS || '5', 10)
const OTP_EXPIRED_MIN = parseInt(process.env.OTP_EXPIRED || '5', 10)
const OTP_DAILY_LIMIT = parseInt(process.env.OTP_DAILY_LIMIT || '10', 10)
const PENDING_TOKEN_EXPIRES_MIN = parseInt(process.env.TWOFA_PENDING_TOKEN_EXPIRES_MIN || '5', 10)

const now = () => dayjs().format('YYYY-MM-DD HH:mm:ss')

const getPayload = async (data) => {
  let decrypted = await encode.aesDecrypt(data.payload)
  try {
    decrypted = JSON.parse(decrypted.payload)
  } catch (e) {
    decrypted = decrypted.payload
  }
  return decrypted || {}
}

const genOtp = () => Math.floor(100000 + Math.random() * 900000).toString()
const genRefCode = () => require('crypto').randomBytes(6).toString('base64').replace(/[^A-Za-z]/g, '').substring(0, 6).toUpperCase()

const insertLoginLog = async ({ userId, userName, mobileNo, result, channel }) => {
  try {
    await honnoi('partner_login_log').insert({
      logInId: `PTLOG${dayjs().format('YYYYMMDD')}-${require('crypto').randomBytes(8).toString('hex')}`,
      userId: userId || '',
      userName: userName || '',
      mobileNo: mobileNo || '',
      result: result || '',
      channel: channel || '',
      createDate: now()
    })
  } catch (error) {
    console.log('insertLoginLog error:', error)
  }
}

const partnerProfile = (user) => ({
  userId: user.userId,
  name: user.name,
  lastname: user.lastname,
  userName: user.userName,
  email: user.email,
  mobile: user.mobile,
  userGroup: user.userGroup,
  userLevel: user.userLevel,
  userClass: user.userClass,
  userStatus: user.userStatus,
  changePassword: user.changePassword,
  companyName: user.companyName,
  department: user.department,
  profileImgUrl: user.profileImgUrl || null
})

const getEnabledTwoFaMethods = async (userId) => {
  const rows = await honnoi('partner_2fa_method')
    .select('method')
    .where({ userId, enabled: 1 })
  return rows.map((r) => r.method)
}

const issuePendingTwoFa = async (user, channel, methods) => {
  const pendingToken = await encode.jwtEncodeCustom(
    { userId: user.userId, purpose: '2fa_pending', channel },
    `${PENDING_TOKEN_EXPIRES_MIN}m`
  )

  await insertLoginLog({
    userId: user.userId,
    userName: user.userName,
    mobileNo: user.mobile,
    result: 'PENDING_2FA',
    channel
  })

  return {
    status_code: 200,
    status_phrase: status_code[200],
    twofa_required: true,
    methods,
    pendingToken,
    expiresInMin: PENDING_TOKEN_EXPIRES_MIN
  }
}

const issueFullLogin = async (user, channel) => {
  const updatePayload = {
    lastLogin: now(),
    loginErrCount: 0,
    loginBlock: '0',
    updateDate: now()
  }
  if (!user.firstLogin) {
    updatePayload.firstLogin = now()
  }

  await honnoi('partner_user').where({ userId: user.userId }).update(updatePayload)

  const freshUser = await honnoi('partner_user').where({ userId: user.userId }).first()
  const user_profile = partnerProfile(freshUser)
  const token = await encode.jwtEncode(user_profile)

  await insertLoginLog({
    userId: user.userId,
    userName: user.userName,
    mobileNo: user.mobile,
    result: 'SUCCESS',
    channel
  })

  return {
    status_code: 200,
    status_phrase: status_code[200],
    message: status_code[200],
    token,
    user_profile
  }
}

const continueAfterCredentialCheck = async (user, channel) => {
  const methods = await getEnabledTwoFaMethods(user.userId)

  if (!methods.length) {
    return await issueFullLogin(user, channel)
  }

  return await issuePendingTwoFa(user, channel, methods)
}

const decodePendingToken = (pendingToken) => {
  const decoded = encode.jwtDecodeCustom(pendingToken)
  if (!decoded || decoded.purpose !== '2fa_pending' || !decoded.userId) {
    return null
  }
  return decoded
}

module.exports = {
  partnerProfile,

  // ---- staff login (bo_user), reused as-is from the existing back-office pattern ----
  login_bo_user: async function (data) {
    try {
      data = await getPayload(data)
      const { userName, password } = data || {}

      if (!userName || !password) {
        return {
          status_code: 10007,
          status_phrase: status_code[10007],
          message: 'userName and password are required'
        }
      }

      const user = await honnoi('bo_user').where({ userName }).first()

      if (!user) {
        return {
          status_code: 301,
          status_phrase: status_code[301],
          userName,
          message: "User doesn't Exist!!"
        }
      }

      const currentLoginErrCount = parseInt(user.loginErrCount || 0, 10)
      const currentLoginBlock = parseInt(user.loginBlock || 0, 10)

      if (currentLoginBlock === 1 || currentLoginErrCount >= 5) {
        await honnoi('bo_user').where({ userName }).update({
          loginBlock: 1,
          updateDate: now()
        })

        return {
          status_code: 301,
          status_phrase: status_code[301],
          userName,
          message: 'User Block',
          login_err_count: currentLoginErrCount,
          login_block: 1
        }
      }

      const isValidPassword = await encode.compareData(password, user.password)

      if (!isValidPassword) {
        const nextLoginErrCount = currentLoginErrCount + 1
        const nextLoginBlock = nextLoginErrCount >= 5 ? 1 : 0

        await honnoi('bo_user').where({ userName }).update({
          loginErrCount: nextLoginErrCount,
          loginBlock: nextLoginBlock,
          updateDate: now()
        })

        return {
          status_code: 301,
          status_phrase: status_code[301],
          userName,
          message: 'Password Not Correct!!',
          login_err_count: nextLoginErrCount,
          login_block: nextLoginBlock
        }
      }

      const updatePayload = {
        lastLogin: now(),
        loginErrCount: 0,
        loginBlock: 0,
        updateDate: now()
      }
      if (!user.firstLogin) {
        updatePayload.firstLogin = now()
      }
      await honnoi('bo_user').where({ userName }).update(updatePayload)

      const user_profile = {
        staffId: user.staffId,
        name: user.name,
        lastname: user.lastname,
        userName: user.userName,
        userGroup: user.userGroup,
        userLevel: user.userLevel,
        userClass: user.userClass,
        userStatus: user.userStatus,
        changePassword: user.changePassword,
        profileImgUrl: user.profileImgUrl || null
      }

      return {
        status_code: 200,
        status_phrase: status_code[200],
        userName,
        message: 'Username & Password Correct!!',
        token: await encode.jwtEncode(user_profile),
        user_profile,
        login_err_count: 0,
        login_block: 0
      }
    } catch (error) {
      console.log('login_bo_user error:', error)
      return {
        status_code: 301,
        status_phrase: status_code[301],
        message: status_code[302]
      }
    }
  },

  // ---- partner login: username/password ----
  loginPartner: async function (data) {
    try {
      data = await getPayload(data)
      const { userName, password } = data || {}

      if (!userName || !password) {
        return {
          status_code: 10007,
          status_phrase: status_code[10007],
          message: 'userName and password are required'
        }
      }

      const user = await honnoi('partner_user')
        .where({ userName })
        .whereNull('deleteUserDate')
        .first()

      if (!user) {
        return {
          status_code: 301,
          status_phrase: status_code[10002],
          message: status_code[10002]
        }
      }

      if (String(user.loginBlock) === '1') {
        await insertLoginLog({ userId: user.userId, userName, mobileNo: user.mobile, result: 'BLOCKED', channel: 'PASSWORD' })
        return {
          status_code: 301,
          status_phrase: status_code[10017],
          message: status_code[10017],
          loginErrCount: parseInt(user.loginErrCount || 0, 10),
          loginBlock: 1
        }
      }

      const isValid = await encode.compareData(password, user.password)

      if (!isValid) {
        const nextErrCount = parseInt(user.loginErrCount || 0, 10) + 1
        const nextBlock = nextErrCount >= LOGIN_MAX_ATTEMPTS ? '1' : '0'

        await honnoi('partner_user').where({ userId: user.userId }).update({
          loginErrCount: nextErrCount,
          loginBlock: nextBlock,
          updateDate: now()
        })

        await insertLoginLog({ userId: user.userId, userName, mobileNo: user.mobile, result: 'INVALID_PASSWORD', channel: 'PASSWORD' })

        return {
          status_code: 301,
          status_phrase: status_code[10003],
          message: status_code[10003],
          loginErrCount: nextErrCount,
          loginBlock: nextBlock === '1' ? 1 : 0
        }
      }

      return await continueAfterCredentialCheck(user, 'PASSWORD')
    } catch (error) {
      console.log('loginPartner error:', error)
      return {
        status_code: 301,
        status_phrase: status_code[301],
        message: status_code[302]
      }
    }
  },

  // ---- partner login: Google OAuth (no auto-create — account must already exist) ----
  loginPartnerWithGoogle: async function (googleProfile) {
    try {
      const email = googleProfile?.emails?.[0]?.value || null
      const googleId = googleProfile?.id || null

      if (!email) {
        return {
          status_code: 301,
          status_phrase: status_code[301],
          message: 'Google account has no email'
        }
      }

      let user = await honnoi('partner_user')
        .where({ email })
        .whereNull('deleteUserDate')
        .first()

      if (!user && googleId) {
        user = await honnoi('partner_user')
          .where({ google_id: googleId })
          .whereNull('deleteUserDate')
          .first()
      }

      if (!user) {
        return {
          status_code: 301,
          status_phrase: status_code[10023],
          message: status_code[10023]
        }
      }

      if (String(user.loginBlock) === '1') {
        await insertLoginLog({ userId: user.userId, userName: user.userName, mobileNo: user.mobile, result: 'BLOCKED', channel: 'GOOGLE' })
        return {
          status_code: 301,
          status_phrase: status_code[10017],
          message: status_code[10017],
          loginErrCount: parseInt(user.loginErrCount || 0, 10),
          loginBlock: 1
        }
      }

      if (googleId && !user.google_id) {
        await honnoi('partner_user').where({ userId: user.userId }).update({
          google_id: googleId,
          updateDate: now()
        })
        user = { ...user, google_id: googleId }
      }

      return await continueAfterCredentialCheck(user, 'GOOGLE')
    } catch (error) {
      console.log('loginPartnerWithGoogle error:', error)
      return {
        status_code: 301,
        status_phrase: status_code[301],
        message: status_code[302]
      }
    }
  },

  // ---- 2FA step 2a: request an OTP for EMAIL/SMS (not needed for TOTP) ----
  // uses the shared `otp_verify` table (type='PARTNER'), matched by email/mobile — same table BO and USER flows use.
  sendTwoFaOtp: async function (data) {
    try {
      const { pendingToken, method } = data || {}
      const decoded = decodePendingToken(pendingToken)

      if (!decoded) {
        return { status_code: 301, status_phrase: status_code[10024], message: status_code[10024] }
      }

      if (!['EMAIL', 'SMS'].includes(method)) {
        return { status_code: 301, status_phrase: status_code[10007], message: 'method must be EMAIL or SMS (TOTP does not need an OTP request)' }
      }

      const user = await honnoi('partner_user').where({ userId: decoded.userId }).whereNull('deleteUserDate').first()
      if (!user) {
        return { status_code: 301, status_phrase: status_code[10006], message: status_code[10006] }
      }

      const enrolled = await honnoi('partner_2fa_method').where({ userId: user.userId, method, enabled: 1 }).first()
      if (!enrolled) {
        return { status_code: 301, status_phrase: status_code[10019], message: status_code[10019] }
      }

      const identityField = method === 'EMAIL' ? 'email' : 'mobile'
      const identityValue = enrolled.target || user[identityField]
      if (!identityValue) {
        return {
          status_code: 301,
          status_phrase: status_code[method === 'EMAIL' ? 10007 : 10027],
          message: method === 'EMAIL' ? 'email is required' : status_code[10027]
        }
      }

      const startOfDay = dayjs().startOf('day').format('YYYY-MM-DD HH:mm:ss')
      const [{ count }] = await honnoi('otp_verify')
        .where({ type: 'PARTNER' })
        .andWhere(identityField, identityValue)
        .andWhere('createDate', '>=', startOfDay)
        .count({ count: '*' })

      if (Number(count || 0) >= OTP_DAILY_LIMIT) {
        return { status_code: 301, status_phrase: status_code[10022], message: status_code[10022] }
      }

      let otp
      let refCode

      if (method === 'EMAIL') {
        const sent = await emailFunction.sendOtpEmail({ email: identityValue })
        if (!sent.status) {
          return { status_code: 301, status_phrase: status_code[10015], message: status_code[10015] }
        }
        otp = sent.otp
        refCode = sent.refCode
      } else {
        try {
          const otpRes = await axios({
            method: 'post',
            url: process.env.OTP_URL,
            headers: { 'Content-Type': 'application/json' },
            data: { mobile_no: identityValue }
          })
          refCode = otpRes.data.OTP_ref
          otp = ''
        } catch (smsError) {
          console.log('send sms otp error:', smsError.message)
          return { status_code: 301, status_phrase: status_code[10026], message: status_code[10026] }
        }
      }

      // invalidate any still-active OTPs for this identity so an old code can't be replayed
      await honnoi('otp_verify')
        .where({ type: 'PARTNER', status: '0' })
        .andWhere(identityField, identityValue)
        .update({ status: '2', cancelDate: now(), updateDate: now() })

      await honnoi('otp_verify').insert({
        refCode,
        status: '0',
        otp: otp || '',
        email: method === 'EMAIL' ? identityValue : null,
        mobile: method === 'SMS' ? identityValue : null,
        type: 'PARTNER',
        createDate: now(),
        updateDate: now()
      })

      return {
        status_code: 200,
        status_phrase: status_code[200],
        refCode,
        expiredIn: dayjs().add(OTP_EXPIRED_MIN, 'minute').format('YYYY-MM-DD HH:mm:ss')
      }
    } catch (error) {
      console.log('sendTwoFaOtp error:', error)
      return { status_code: 301, status_phrase: status_code[301], message: status_code[302] }
    }
  },

  // ---- 2FA step 2b: verify the chosen method and issue the real session token ----
  verifyTwoFa: async function (data) {
    try {
      const { pendingToken, method, refCode, otp } = data || {}
      const decoded = decodePendingToken(pendingToken)

      if (!decoded) {
        return { status_code: 301, status_phrase: status_code[10024], message: status_code[10024] }
      }

      const user = await honnoi('partner_user').where({ userId: decoded.userId }).whereNull('deleteUserDate').first()
      if (!user) {
        return { status_code: 301, status_phrase: status_code[10006], message: status_code[10006] }
      }

      const enrolled = await honnoi('partner_2fa_method').where({ userId: user.userId, method, enabled: 1 }).first()
      if (!enrolled) {
        return { status_code: 301, status_phrase: status_code[10019], message: status_code[10019] }
      }

      if (method === 'TOTP') {
        const valid = totp.verifyToken(user.authenToken, otp)
        if (!valid) {
          return { status_code: 301, status_phrase: status_code[10021], message: status_code[10021] }
        }
      } else {
        const identityField = method === 'EMAIL' ? 'email' : 'mobile'
        const identityValue = enrolled.target || user[identityField]

        const where = { type: 'PARTNER', status: '0', refCode }
        where[identityField] = identityValue
        if (method === 'EMAIL') where.otp = otp

        const row = await honnoi('otp_verify').where(where).orderBy('createDate', 'desc').first()

        if (!row) {
          return { status_code: 301, status_phrase: status_code[10014], message: status_code[10014] }
        }

        const expiredAt = dayjs(row.createDate).add(OTP_EXPIRED_MIN, 'minute')
        if (dayjs().isAfter(expiredAt)) {
          return { status_code: 301, status_phrase: status_code[10016], message: status_code[10016] }
        }

        if (method === 'SMS') {
          try {
            const verifyRes = await axios({
              method: 'post',
              url: process.env.END_POINT_OTP_VERIFY,
              headers: { 'Content-Type': 'application/json' },
              data: { mobile_no: identityValue, otp_ref: refCode, otp_pin: otp }
            })
            if (String(verifyRes.data.status_code) !== '200') {
              return { status_code: 301, status_phrase: status_code[10014], message: status_code[10014] }
            }
          } catch (smsError) {
            console.log('verify sms otp error:', smsError.message)
            return { status_code: 301, status_phrase: status_code[10014], message: status_code[10014] }
          }
        }

        await honnoi('otp_verify').where({ id: row.id }).update({ status: '1', cancelDate: now(), updateDate: now() })
      }

      return await issueFullLogin(user, decoded.channel)
    } catch (error) {
      console.log('verifyTwoFa error:', error)
      return { status_code: 301, status_phrase: status_code[301], message: status_code[302] }
    }
  }
}
