const { authenticator } = require('otplib')
const QRCode = require('qrcode')

authenticator.options = { window: 1 }

const ISSUER = process.env.TOTP_ISSUER || 'Honnoi Partner'

const generateSecret = () => {
    return authenticator.generateSecret()
}

const otpauthUrl = (secret, accountLabel) => {
    return authenticator.keyuri(accountLabel, ISSUER, secret)
}

const qrDataUrl = async (secret, accountLabel) => {
    const url = otpauthUrl(secret, accountLabel)
    return QRCode.toDataURL(url)
}

const verifyToken = (secret, token) => {
    try {
        if (!secret || !token) return false
        return authenticator.verify({ token: String(token), secret })
    } catch (error) {
        console.log('totp verifyToken error:', error.message)
        return false
    }
}

module.exports = { generateSecret, otpauthUrl, qrDataUrl, verifyToken }
