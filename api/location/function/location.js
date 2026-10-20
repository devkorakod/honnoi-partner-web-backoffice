const encode = require("../../../function/encode");
const status_code = require("../../../error/error_code");
const { honnoi } = require("../../../knex/knexfile");

const getPayload = async (data) => {
  data = await encode.aesDecrypt(data?.payload);
  try {
    data = JSON.parse(data.payload);
  } catch (e) {
    data = data.payload;
  }
  return data || {};
};

const success = (rows) => ({
  status_code: 200,
  status_phrase: status_code[200],
  message: status_code[200],
  total: rows.length,
  data: rows,
});

const fail = () => ({
  status_code: 301,
  status_phrase: status_code[301],
  message: status_code[302],
});

module.exports = {
  getThailandState: async function () {
    try {
      const rows = await honnoi("thailand_state").select("*").orderBy("state_id", "asc");
      return success(rows);
    } catch (error) {
      console.log(error);
      return fail();
    }
  },

  getThailandDistrict: async function () {
    try {
      const rows = await honnoi("thailand_district").select("*").orderBy("district_id", "asc");
      return success(rows);
    } catch (error) {
      console.log(error);
      return fail();
    }
  },

  getThailandSubDistrict: async function () {
    try {
      const rows = await honnoi("thailand_sub_district").select("*").orderBy("sub_district_id", "asc");
      return success(rows);
    } catch (error) {
      console.log(error);
      return fail();
    }
  },

  getThailandDistrictByStateId: async function (data) {
    try {
      data = await getPayload(data);
      const { state_id } = data || {};

      if (!state_id) {
        return {
          status_code: 10007,
          status_phrase: status_code[10007],
          message: "missing state_id",
        };
      }

      const rows = await honnoi("thailand_district")
        .select("*")
        .where({ state_id })
        .orderBy("district_id", "asc");
      return success(rows);
    } catch (error) {
      console.log(error);
      return fail();
    }
  },

  getThailandSubDistrictByDistrictId: async function (data) {
    try {
      data = await getPayload(data);
      const { district_id } = data || {};

      if (!district_id) {
        return {
          status_code: 10007,
          status_phrase: status_code[10007],
          message: "missing district_id",
        };
      }

      const rows = await honnoi("thailand_sub_district")
        .select("*")
        .where({ district_id })
        .orderBy("sub_district_id", "asc");
      return success(rows);
    } catch (error) {
      console.log(error);
      return fail();
    }
  },
};
