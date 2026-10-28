const express = require("express");
const router = express.Router();
const func = require("../function/partnerInfo");
const { requireStaff } = require("../../../function/access_control");

// partner company records are managed by back-office staff only
router.use(requireStaff);

router.route("/createPartnerInfo").post(async (req, res) => {
  try {
    const response = await func.createPartnerInfo(req.body, req.auth);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/updatePartnerInfo").post(async (req, res) => {
  try {
    const response = await func.updatePartnerInfo(req.body);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/getPartnerInfo").post(async (req, res) => {
  try {
    const response = await func.getPartnerInfo(req.body);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/searchPartnerInfo").post(async (req, res) => {
  try {
    const response = await func.searchPartnerInfo(req.body);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/searchMemberRefId").post(async (req, res) => {
  try {
    const response = await func.searchMemberRefId(req.body);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/checkPartnerName").post(async (req, res) => {
  try {
    const response = await func.checkPartnerName(req.body);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/checkSaleAgent").post(async (req, res) => {
  try {
    const response = await func.checkSaleAgent(req.body);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/updatePartnerFile").post(async (req, res) => {
  try {
    const response = await func.updatePartnerFile(req.body);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/updatePartnerImage").post(async (req, res) => {
  try {
    const response = await func.updatePartnerImage(req.body);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/uploadPartnerProfileImage").post(async (req, res) => {
  try {
    const response = await func.uploadPartnerProfileImage(req.body);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

module.exports = router;
