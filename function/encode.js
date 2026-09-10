const crypto = require('crypto')
const jwt = require("jsonwebtoken")

const bcrypt = require('bcrypt')
const saltRounds = 10

const aesEncrypt = async (plainText) => {
  return new Promise(async (resolve) => {
    try {
      let bufSecret = Buffer.from(global.aesKey, 'base64')
      let bufIv = Buffer.from(global.aesIv, 'base64')
      let cipher = crypto.createCipheriv(
        'aes-256-cbc', bufSecret, bufIv)
      let encrypted = cipher.update(plainText)
      encrypted = Buffer.concat([encrypted, cipher.final()])
      let cipherText = encrypted.toString('base64')
      return resolve({ payload: cipherText })
    } catch (error) {
      console.log(error)
      return resolve(error)
    }
  })
}
const aesDecrypt = async (cipherText) => {
  return new Promise(async (resolve) => {
    try {
      let bufSecret = Buffer.from(global.aesKey, 'base64')
      let bufIv = Buffer.from(global.aesIv, 'base64')
      let decipher = crypto.createDecipheriv('aes-256-cbc', bufSecret, bufIv)
      let decrypted = decipher.update(cipherText, 'base64', 'utf8')
      decrypted += decipher.final('utf8')
      return resolve({ payload: decrypted })
    } catch (error) {
      console.log(error)
      return resolve(error)
    }
  })
}
const compareData = (data, hash) => {
  return new Promise(async (resolve) => {
    try {
      bcrypt.compare(data, hash, function (err, match) {
        resolve(match)
      })
    } catch (error) {
      console.log(error)
      resolve(false)
    }
  })
}
const jwtEncode = (user_profile) => {
  return new Promise((resolve) => {
    try {
      if (!jwtSecret || typeof jwtSecret !== 'string') {
        throw new Error('JWT_SECRET_KEY is missing or invalid')
      }

      const accessToken = jwt.sign(user_profile, jwtSecret, {
        algorithm: 'HS256',
        expiresIn: '4h'
      })

      resolve(accessToken)
    } catch (error) {
      console.error('JWT encode failed:', error.message)
      resolve({
        error: 'JWT encode failed',
        message: error.message
      })
    }
  })
}

// short-lived token used for the pending-2FA step between password/google
// verification and the otp/totp verify call — never carries a full session.
const jwtEncodeCustom = (payload, expiresIn = '5m') => {
  return new Promise((resolve, reject) => {
    try {
      if (!jwtSecret || typeof jwtSecret !== 'string') {
        throw new Error('JWT_SECRET_KEY is missing or invalid')
      }

      const token = jwt.sign(payload, jwtSecret, {
        algorithm: 'HS256',
        expiresIn
      })

      resolve(token)
    } catch (error) {
      console.error('JWT custom encode failed:', error.message)
      reject(error)
    }
  })
}

const jwtDecodeCustom = (token) => {
  try {
    if (!jwtSecret || typeof jwtSecret !== 'string') return null
    return jwt.verify(token, jwtSecret, { algorithms: ['HS256'] })
  } catch (error) {
    console.log('jwtDecodeCustom error:', error.message)
    return null
  }
}

const hashData = (data) => {
  return new Promise(async (resolve) => {
    try {
      bcrypt.hash(data, saltRounds, function (err, hash) {
        resolve(hash)
      })
    } catch (error) {
      console.log(error)
      resolve(data)
    }
  })
}

module.exports = {
  compareData, jwtEncode, jwtEncodeCustom, jwtDecodeCustom, hashData, aesEncrypt, aesDecrypt
}
