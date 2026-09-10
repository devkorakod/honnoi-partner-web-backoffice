const express = require("express");
const router = express.Router();
const func = require("../function/partner_user");
const { requireStaff, requirePartner } = require("../../../function/access_control");

// ---- staff-only management (requires a bo_user JWT) ----
router.route("/createPartnerUser").post(requireStaff, async (req, res) => {
  try {
    const response = await func.createPartnerUser(req.body);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/editPartnerUser").post(requireStaff, async (req, res) => {
  try {
    const response = await func.editPartnerUser(req.body);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/getPartnerUser").post(requireStaff, async (req, res) => {
  try {
    const response = await func.getPartnerUser(req.body);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/searchPartnerUser").post(requireStaff, async (req, res) => {
  try {
    const response = await func.searchPartnerUser(req.body);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/deletePartnerUser").post(requireStaff, async (req, res) => {
  try {
    const response = await func.deletePartnerUser(req.body);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/resetPartnerPassword").post(requireStaff, async (req, res) => {
  try {
    const response = await func.resetPartnerPassword(req.body);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

// ---- partner self-service (requires the partner's own JWT) ----
router.route("/changePassword").post(requirePartner, async (req, res) => {
  try {
    const response = await func.changePassword(req.body, req.auth);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/uploadProfileImage").post(requirePartner, async (req, res) => {
  try {
    const response = await func.uploadPartnerUserProfileImage(req.body, req.auth);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

module.exports = router;
