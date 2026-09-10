const dayjs = require("dayjs");
const axios = require("axios");
const encode = require("../../../function/encode");
const emailFunction = require("../../../function/email");
const totp = require("../../../function/totp");
const status_code = require("../../../error/error_code");
const { honnoi } = require("../../../knex/knexfile");

const OTP_EXPIRED_MIN = parseInt(process.env.OTP_EXPIRED || "5", 10);
const OTP_DAILY_LIMIT = parseInt(process.env.OTP_DAILY_LIMIT || "10", 10);

const now = () => dayjs().format("YYYY-MM-DD HH:mm:ss");

const getPayload = async (data) => {
  data = await encode.aesDecrypt(data.payload);
  try {
    data = JSON.parse(data.payload);
  } catch (e) {
    data = data.payload;
  }
  return data || {};
};

const checkDailyCapAndIssueOtp = async ({ identityField, identityValue, method }) => {
  const startOfDay = dayjs().startOf("day").format("YYYY-MM-DD HH:mm:ss");
  const [{ count }] = await honnoi("otp_verify")
    .where({ type: "PARTNER" })
    .andWhere(identityField, identityValue)
    .andWhere("createDate", ">=", startOfDay)
    .count({ count: "*" });

  if (Number(count || 0) >= OTP_DAILY_LIMIT) {
    return { ok: false, status_code: 301, status_phrase: status_code[10022], message: status_code[10022] };
  }

  let otp;
  let refCode;

  if (method === "EMAIL") {
    const sent = await emailFunction.sendOtpEmail({ email: identityValue });
    if (!sent.status) {
      return { ok: false, status_code: 301, status_phrase: status_code[10015], message: status_code[10015] };
    }
    otp = sent.otp;
    refCode = sent.refCode;
  } else {
    try {
      const otpRes = await axios({
        method: "post",
        url: process.env.OTP_URL,
        headers: { "Content-Type": "application/json" },
        data: { mobile_no: identityValue },
      });
      refCode = otpRes.data.OTP_ref;
      otp = "";
    } catch (smsError) {
      console.log("send sms otp error:", smsError.message);
      return { ok: false, status_code: 301, status_phrase: status_code[10026], message: status_code[10026] };
    }
  }

  await honnoi("otp_verify")
    .where({ type: "PARTNER", status: "0" })
    .andWhere(identityField, identityValue)
    .update({ status: "2", cancelDate: now(), updateDate: now() });

  await honnoi("otp_verify").insert({
    refCode,
    status: "0",
    otp: otp || "",
    email: method === "EMAIL" ? identityValue : null,
    mobile: method === "SMS" ? identityValue : null,
    type: "PARTNER",
    createDate: now(),
    updateDate: now(),
  });

  return {
    ok: true,
    status_code: 200,
    status_phrase: status_code[200],
    refCode,
    expiredIn: dayjs().add(OTP_EXPIRED_MIN, "minute").format("YYYY-MM-DD HH:mm:ss"),
  };
};

const verifyOtpRow = async ({ identityField, identityValue, method, refCode, otp }) => {
  const where = { type: "PARTNER", status: "0", refCode };
  where[identityField] = identityValue;
  if (method === "EMAIL") where.otp = otp;

  const row = await honnoi("otp_verify").where(where).orderBy("createDate", "desc").first();
  if (!row) return { ok: false, status_code: 301, status_phrase: status_code[10014], message: status_code[10014] };

  const expiredAt = dayjs(row.createDate).add(OTP_EXPIRED_MIN, "minute");
  if (dayjs().isAfter(expiredAt)) {
    return { ok: false, status_code: 301, status_phrase: status_code[10016], message: status_code[10016] };
  }

  if (method === "SMS") {
    try {
      const verifyRes = await axios({
        method: "post",
        url: process.env.END_POINT_OTP_VERIFY,
        headers: { "Content-Type": "application/json" },
        data: { mobile_no: identityValue, otp_ref: refCode, otp_pin: otp },
      });
      if (String(verifyRes.data.status_code) !== "200") {
        return { ok: false, status_code: 301, status_phrase: status_code[10014], message: status_code[10014] };
      }
    } catch (smsError) {
      console.log("verify sms otp error:", smsError.message);
      return { ok: false, status_code: 301, status_phrase: status_code[10014], message: status_code[10014] };
    }
  }

  await honnoi("otp_verify").where({ id: row.id }).update({ status: "1", cancelDate: now(), updateDate: now() });
  return { ok: true };
};

module.exports = {
  status: async function (auth) {
    try {
      const userId = auth?.userId;
      const rows = await honnoi("partner_2fa_method")
        .select("method", "target", "enabled", "createDate", "updateDate")
        .where({ userId, enabled: 1 });

      return {
        status_code: 200,
        status_phrase: status_code[200],
        data: rows,
      };
    } catch (error) {
      console.log(error);
      return { status_code: 301, status_phrase: status_code[301], message: status_code[302] };
    }
  },

  requestEmailOtp: async function (auth) {
    try {
      const userId = auth?.userId;
      const user = await honnoi("partner_user").where({ userId }).whereNull("deleteUserDate").first();
      if (!user) return { status_code: 301, status_phrase: status_code[10006], message: status_code[10006] };
      if (!user.email) return { status_code: 301, status_phrase: status_code[10007], message: "email is required" };

      const result = await checkDailyCapAndIssueOtp({ identityField: "email", identityValue: user.email, method: "EMAIL" });
      if (!result.ok) return result;

      return { status_code: 200, status_phrase: status_code[200], refCode: result.refCode, expiredIn: result.expiredIn };
    } catch (error) {
      console.log(error);
      return { status_code: 301, status_phrase: status_code[301], message: status_code[302] };
    }
  },

  verifyEmailOtp: async function (data, auth) {
    try {
      data = await getPayload(data);
      const { refCode, otp } = data || {};
      const userId = auth?.userId;

      const user = await honnoi("partner_user").where({ userId }).whereNull("deleteUserDate").first();
      if (!user) return { status_code: 301, status_phrase: status_code[10006], message: status_code[10006] };

      const verified = await verifyOtpRow({ identityField: "email", identityValue: user.email, method: "EMAIL", refCode, otp });
      if (!verified.ok) return verified;

      await honnoi("partner_2fa_method")
        .insert({ userId, method: "EMAIL", target: user.email, enabled: 1, createDate: now(), updateDate: now() })
        .onConflict(["userId", "method"])
        .merge({ target: user.email, enabled: 1, updateDate: now() });

      return { status_code: 200, status_phrase: status_code[200], message: status_code[200] };
    } catch (error) {
      console.log(error);
      return { status_code: 301, status_phrase: status_code[301], message: status_code[302] };
    }
  },

  requestSmsOtp: async function (auth) {
    try {
      const userId = auth?.userId;
      const user = await honnoi("partner_user").where({ userId }).whereNull("deleteUserDate").first();
      if (!user) return { status_code: 301, status_phrase: status_code[10006], message: status_code[10006] };
      if (!user.mobile) return { status_code: 301, status_phrase: status_code[10027], message: status_code[10027] };

      const result = await checkDailyCapAndIssueOtp({ identityField: "mobile", identityValue: user.mobile, method: "SMS" });
      if (!result.ok) return result;

      return { status_code: 200, status_phrase: status_code[200], refCode: result.refCode, expiredIn: result.expiredIn };
    } catch (error) {
      console.log(error);
      return { status_code: 301, status_phrase: status_code[301], message: status_code[302] };
    }
  },

  verifySmsOtp: async function (data, auth) {
    try {
      data = await getPayload(data);
      const { refCode, otp } = data || {};
      const userId = auth?.userId;

      const user = await honnoi("partner_user").where({ userId }).whereNull("deleteUserDate").first();
      if (!user) return { status_code: 301, status_phrase: status_code[10006], message: status_code[10006] };

      const verified = await verifyOtpRow({ identityField: "mobile", identityValue: user.mobile, method: "SMS", refCode, otp });
      if (!verified.ok) return verified;

      await honnoi("partner_2fa_method")
        .insert({ userId, method: "SMS", target: user.mobile, enabled: 1, createDate: now(), updateDate: now() })
        .onConflict(["userId", "method"])
        .merge({ target: user.mobile, enabled: 1, updateDate: now() });

      return { status_code: 200, status_phrase: status_code[200], message: status_code[200] };
    } catch (error) {
      console.log(error);
      return { status_code: 301, status_phrase: status_code[301], message: status_code[302] };
    }
  },

  // secret is stored on partner_user.authenToken (not on partner_2fa_method) —
  // partner_2fa_method just tracks that TOTP is enrolled/enabled for this user.
  setupTotp: async function (auth) {
    try {
      const userId = auth?.userId;
      const user = await honnoi("partner_user").where({ userId }).whereNull("deleteUserDate").first();
      if (!user) return { status_code: 301, status_phrase: status_code[10006], message: status_code[10006] };

      const secret = totp.generateSecret();
      const qrDataUrl = await totp.qrDataUrl(secret, user.userName);

      // stored disabled until verifyTotp confirms the app is set up correctly
      await honnoi("partner_user").where({ userId }).update({ authenToken: secret, updateDate: now() });

      await honnoi("partner_2fa_method")
        .insert({ userId, method: "TOTP", enabled: 0, createDate: now(), updateDate: now() })
        .onConflict(["userId", "method"])
        .merge({ enabled: 0, updateDate: now() });

      return {
        status_code: 200,
        status_phrase: status_code[200],
        secret,
        otpauthUrl: totp.otpauthUrl(secret, user.userName),
        qrDataUrl,
      };
    } catch (error) {
      console.log(error);
      return { status_code: 301, status_phrase: status_code[301], message: status_code[302] };
    }
  },

  verifyTotp: async function (data, auth) {
    try {
      data = await getPayload(data);
      const { code } = data || {};
      const userId = auth?.userId;

      const user = await honnoi("partner_user").where({ userId }).whereNull("deleteUserDate").first();
      if (!user || !user.authenToken) {
        return { status_code: 301, status_phrase: status_code[10019], message: status_code[10019] };
      }

      const valid = totp.verifyToken(user.authenToken, code);
      if (!valid) return { status_code: 301, status_phrase: status_code[10021], message: status_code[10021] };

      await honnoi("partner_2fa_method")
        .insert({ userId, method: "TOTP", enabled: 1, createDate: now(), updateDate: now() })
        .onConflict(["userId", "method"])
        .merge({ enabled: 1, updateDate: now() });

      return { status_code: 200, status_phrase: status_code[200], message: status_code[200] };
    } catch (error) {
      console.log(error);
      return { status_code: 301, status_phrase: status_code[301], message: status_code[302] };
    }
  },

  disable: async function (data, auth) {
    try {
      data = await getPayload(data);
      const { method } = data || {};
      const userId = auth?.userId;

      if (!["EMAIL", "SMS", "TOTP"].includes(method)) {
        return { status_code: 10007, status_phrase: status_code[10007], message: "method must be EMAIL, SMS or TOTP" };
      }

      await honnoi("partner_2fa_method").where({ userId, method }).del();

      if (method === "TOTP") {
        await honnoi("partner_user").where({ userId }).update({ authenToken: null, updateDate: now() });
      }

      return { status_code: 200, status_phrase: status_code[200], message: status_code[200] };
    } catch (error) {
      console.log(error);
      return { status_code: 301, status_phrase: status_code[301], message: status_code[302] };
    }
  },
};
