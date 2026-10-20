const express = require("express");
const router = express.Router();
const func = require("../function/partnerMessage");
const { requireStaff, requirePartner } = require("../../../function/access_control");

// back office: staff create messages and track who has read them
router.route("/createPartnerMessage").post(requireStaff, async (req, res) => {
  try {
    const response = await func.createPartnerMessage(req.body, req.auth);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/searchPartnerMessage").post(requireStaff, async (req, res) => {
  try {
    const response = await func.searchPartnerMessage(req.body);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/getPartnerMessageSummary").post(requireStaff, async (req, res) => {
  try {
    const response = await func.getPartnerMessageSummary(req.body);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/getPartnerMessage").post(requireStaff, async (req, res) => {
  try {
    const response = await func.getPartnerMessage(req.body);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/getPartnerMessageRecipient").post(requireStaff, async (req, res) => {
  try {
    const response = await func.getPartnerMessageRecipient(req.body);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/deletePartnerMessage").post(requireStaff, async (req, res) => {
  try {
    const response = await func.deletePartnerMessage(req.body);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

// partner: inbox of the logged-in partner's company
router.route("/getInboxCount").post(requirePartner, async (req, res) => {
  try {
    const response = await func.getInboxCount(req.body, req.auth);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/searchInbox").post(requirePartner, async (req, res) => {
  try {
    const response = await func.searchInbox(req.body, req.auth);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/readInbox").post(requirePartner, async (req, res) => {
  try {
    const response = await func.readInbox(req.body, req.auth);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

module.exports = router;
