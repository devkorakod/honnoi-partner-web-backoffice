const nodemailer = require('nodemailer')
const { Resend } = require('resend')
const crypto = require('crypto')

const sendViaSmtp = async ({ from, to, replyTo, subject, text, html, headers }) => {
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || 'false') === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    })

    const info = await transporter.sendMail({ from, to, replyTo, subject, text, html, headers })
    return info
}

const sendViaResend = async ({ from, to, replyTo, subject, text, html, headers }) => {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { data, error } = await resend.emails.send({ from, to, reply_to: replyTo, subject, text, html, headers })

    if (error) {
        throw new Error(error.message || 'resend send failed')
    }

    return data.id
}

exports.sendOtpEmail = async ({ email }) => {
    try {
        const otp = Math.floor(100000 + Math.random() * 900000).toString()
        const refCode = crypto.randomBytes(6)
            .toString('base64')
            .replace(/[^A-Za-z]/g, '')
            .substring(0, 6)
            .toUpperCase()

        const html = `
        <!DOCTYPE html>
        <html lang="th">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>OTP Email</title>
        </head>
        <body style="margin:0;padding:0;background-color:#f8f4ff;font-family:Arial,Helvetica,sans-serif;color:#3d2c4f;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(180deg,#f8f4ff 0%,#fffaf2 100%);padding:30px 15px;">
                <tr>
                    <td align="center">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background:rgba(255,255,255,0.95);border-radius:24px;overflow:hidden;box-shadow:0 10px 35px rgba(125,78,175,0.15);">
                            <tr>
                                <td style="background:linear-gradient(135deg,#7b4dff 0%,#b388ff 55%,#f5e7c6 100%);padding:36px 24px;text-align:center;">
                                    <div style="font-size:28px;font-weight:700;color:#ffffff;">
                                        OTP Verification
                                    </div>
                                    <div style="margin-top:8px;font-size:14px;color:#f8f1ff;">
                                        รหัสยืนยันสำหรับการเข้าสู่ระบบ Partner
                                    </div>
                                </td>
                            </tr>

                            <tr>
                                <td style="padding:36px 30px 20px 30px;">
                                    <div style="font-size:18px;font-weight:700;color:#5b3a75;margin-bottom:12px;">
                                        สวัสดี
                                    </div>
                                    <div style="font-size:15px;line-height:1.8;color:#5f5670;margin-bottom:22px;">
                                        มีคำขอส่งรหัส OTP สำหรับอีเมล
                                        <span style="font-weight:700;color:#7b4dff;">${email}</span>
                                        กรุณาใช้รหัสด้านล่างเพื่อยืนยันตัวตน
                                    </div>

                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
                                        <tr>
                                            <td align="center">
                                                <div style="display:inline-block;padding:20px 32px;border-radius:20px;background:linear-gradient(135deg,#fff7ec 0%,#f5edff 100%);border:1px solid #eadcff;">
                                                    <div style="font-size:13px;color:#8a73a6;letter-spacing:1px;margin-bottom:8px;">
                                                        OTP CODE
                                                    </div>
                                                    <div style="font-size:40px;font-weight:800;letter-spacing:10px;color:#6d3df2;">
                                                        ${otp}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    </table>

                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;background:#fff9ef;border:1px solid #f1e0bf;border-radius:16px;">
                                        <tr>
                                            <td style="padding:16px 18px;">
                                                <div style="font-size:13px;color:#8c6b2d;margin-bottom:6px;">Reference Code</div>
                                                <div style="font-size:18px;font-weight:700;color:#6c4c1f;">${refCode}</div>
                                            </td>
                                        </tr>
                                    </table>

                                    <div style="margin-top:24px;font-size:14px;line-height:1.8;color:#6b6477;">
                                        รหัสนี้มีอายุประมาณ <b>${process.env.OTP_EXPIRED || 5} นาที</b> และควรใช้เพียงครั้งเดียวเท่านั้น<br/>
                                        ถ้าไม่ได้เป็นคนขอ กรุณาเพิกเฉยต่ออีเมลนี้และแจ้งเจ้าหน้าที่
                                    </div>

                                    <div style="margin-top:28px;padding:16px 18px;background:#f7f0ff;border-radius:14px;font-size:13px;line-height:1.7;color:#6b5a84;border:1px solid #eadcff;">
                                        เพื่อความปลอดภัย กรุณาอย่าแชร์รหัส OTP นี้กับผู้อื่น
                                    </div>
                                </td>
                            </tr>

                            <tr>
                                <td style="padding:20px 30px 30px 30px;text-align:center;">
                                    <div style="font-size:12px;color:#9b90ab;line-height:1.8;">
                                        This is an automated email. Please do not reply.<br/>
                                        © HONNOI Partner. All rights reserved.
                                    </div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        `

        const provider = String(process.env.MAIL_PROVIDER || 'smtp').toLowerCase()
        const senderAddress = provider === 'resend'
            ? (process.env.RESEND_FROM || 'onboarding@resend.dev')
            : (process.env.SMTP_FROM || process.env.SMTP_USER)

        const mailPayload = {
            from: `"Honnoi Partner" <${senderAddress}>`,
            to: email,
            replyTo: senderAddress,
            subject: 'รหัส OTP สำหรับยืนยันตัวตน',
            text: `สวัสดี\n\nรหัส OTP ของคุณคือ: ${otp}\nรหัสอ้างอิง: ${refCode}\n\nรหัสนี้มีอายุ ${process.env.OTP_EXPIRED || 5} นาที ใช้ได้เพียงครั้งเดียว\nหากไม่ได้เป็นผู้ขอ กรุณาเพิกเฉยต่ออีเมลนี้\n\n© HONNOI Partner. All rights reserved.`,
            html,
            headers: {
                'X-Mailer': 'HONNOI Partner Mailer',
                'X-Priority': '3',
                'Precedence': 'transactional',
                'List-Unsubscribe': `<mailto:${senderAddress}?subject=unsubscribe>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
            }
        }

        const info = provider === 'resend'
            ? await sendViaResend(mailPayload)
            : await sendViaSmtp(mailPayload)

        const messageId = info?.messageId || info?.id || info

        return {
            status: true,
            message: 'send email success',
            otp,
            refCode,
            messageId
        }
    }
    catch (error) {
        console.log('sendOtpEmail error:', error)
        return {
            status: false,
            message: 'send email fail',
            error: error.message
        }
    }
}
