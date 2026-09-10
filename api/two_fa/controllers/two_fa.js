const express = require("express");
const router = express.Router();
const func = require("../function/two_fa");
const { requirePartner } = require("../../../function/access_control");

router.use(requirePartner);

router.get("/status", async (req, res) => {
  try {
    const response = await func.status(req.auth);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.post("/email/requestOtp", async (req, res) => {
  try {
    const response = await func.requestEmailOtp(req.auth);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.post("/email/verify", async (req, res) => {
  try {
    const response = await func.verifyEmailOtp(req.body, req.auth);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.post("/sms/requestOtp", async (req, res) => {
  try {
    const response = await func.requestSmsOtp(req.auth);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.post("/sms/verify", async (req, res) => {
  try {
    const response = await func.verifySmsOtp(req.body, req.auth);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.post("/totp/setup", async (req, res) => {
  try {
    const response = await func.setupTotp(req.auth);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.post("/totp/verify", async (req, res) => {
  try {
    const response = await func.verifyTotp(req.body, req.auth);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.post("/disable", async (req, res) => {
  try {
    const response = await func.disable(req.body, req.auth);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

module.exports = router;
