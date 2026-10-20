const express = require("express");
const router = express.Router();
const func = require("../function/location");

router.route("/getThailandState").post(async (req, res) => {
  try {
    const response = await func.getThailandState();
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/getThailandDistrict").post(async (req, res) => {
  try {
    const response = await func.getThailandDistrict();
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/getThailandSubDistrict").post(async (req, res) => {
  try {
    const response = await func.getThailandSubDistrict();
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/getThailandDistrictByStateId").post(async (req, res) => {
  try {
    const response = await func.getThailandDistrictByStateId(req.body);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

router.route("/getThailandSubDistrictByDistrictId").post(async (req, res) => {
  try {
    const response = await func.getThailandSubDistrictByDistrictId(req.body);
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

module.exports = router;
