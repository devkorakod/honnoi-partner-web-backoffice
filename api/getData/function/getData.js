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

const fail = () => ({
  status_code: 301,
  status_phrase: status_code[301],
  message: status_code[302],
});

module.exports = {
  getCompanyBusinessType: async function () {
    try {
      const rows = await honnoi("company_business_type").select("*").orderBy("business_id", "asc");
      return {
        status_code: 200,
        status_phrase: status_code[200],
        message: status_code[200],
        total: rows.length,
        data: rows,
      };
    } catch (error) {
      console.log(error);
      return fail();
    }
  },

  getCompanyBusinessTypeById: async function (data) {
    try {
      data = await getPayload(data);
      const { business_id } = data || {};

      if (!business_id) {
        return {
          status_code: 10007,
          status_phrase: status_code[10007],
          message: "missing business_id",
        };
      }

      const row = await honnoi("company_business_type").where({ business_id }).first();
      if (!row) {
        return {
          status_code: 10028,
          status_phrase: status_code[10028],
          message: status_code[10028],
        };
      }

      return {
        status_code: 200,
        status_phrase: status_code[200],
        message: status_code[200],
        data: row,
      };
    } catch (error) {
      console.log(error);
      return fail();
    }
  },

  getCompanySegment: async function () {
    try {
      const rows = await honnoi("company_segment").select("*").orderBy("segmentId", "asc");
      return {
        status_code: 200,
        status_phrase: status_code[200],
        message: status_code[200],
        total: rows.length,
        data: rows,
      };
    } catch (error) {
      console.log(error);
      return fail();
    }
  },

  getCompanySegmentById: async function (data) {
    try {
      data = await getPayload(data);
      const { segmentId } = data || {};

      if (!segmentId) {
        return {
          status_code: 10007,
          status_phrase: status_code[10007],
          message: "missing segmentId",
        };
      }

      const row = await honnoi("company_segment").where({ segmentId }).first();
      if (!row) {
        return {
          status_code: 10029,
          status_phrase: status_code[10029],
          message: status_code[10029],
        };
      }

      return {
        status_code: 200,
        status_phrase: status_code[200],
        message: status_code[200],
        data: row,
      };
    } catch (error) {
      console.log(error);
      return fail();
    }
  },
};
