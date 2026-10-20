const express = require("express");
const router = express.Router();
const func = require("../function/getData");

router.route("/getCompanyBusinessType").post(async (req, res) => {
  try {
    const response = await func.getCompanyBusinessType();
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/getCompanyBusinessTypeById").post(async (req, res) => {
  try {
    const response = await func.getCompanyBusinessTypeById(req.body);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/getCompanySegment").post(async (req, res) => {
  try {
    const response = await func.getCompanySegment();
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/getCompanySegmentById").post(async (req, res) => {
  try {
    const response = await func.getCompanySegmentById(req.body);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

module.exports = router;
