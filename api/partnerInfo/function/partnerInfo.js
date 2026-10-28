const encode = require("../../../function/encode");
const status_code = require("../../../error/error_code");
const { honnoi } = require("../../../knex/knexfile");
const dayjs = require("dayjs");
const file = require("../../../function/file");

const now = () => dayjs().format("YYYY-MM-DD HH:mm:ss");

const formatDateTime = (value) => {
  if (!value) return null;
  const d = dayjs(value);
  return d.isValid() ? d.format("YYYY-MM-DD HH:mm:ss") : null;
};

// fileCorporate / imageCorporate are stored as comma-separated urls (same as corporate_info)
const splitUrls = (value) => (value ? String(value).split(",").filter(Boolean) : []);

const mapPartnerInfoRow = (row) => {
  if (!row) return row;
  return {
    ...row,
    fileCorporate: splitUrls(row.fileCorporate),
    imageCorporate: splitUrls(row.imageCorporate),
    createDate: formatDateTime(row.createDate),
    updateDate: formatDateTime(row.updateDate),
  };
};

const getPayload = async (data) => {
  data = await encode.aesDecrypt(data?.payload);
  try {
    data = JSON.parse(data.payload);
  } catch (e) {
    data = data.payload;
  }
  return data || {};
};

const fail = (message = status_code[302]) => ({
  status_code: 301,
  status_phrase: status_code[301],
  message,
});

const validationError = (message) => ({
  status_code: 10007,
  status_phrase: status_code[10007],
  message,
});

const PARTNER_STATUS = ["0", "1", "2"];

// fields a staff can set through create/update; files, images, profile and the
// location *Text columns are handled separately
const EDITABLE_FIELDS = [
  "partnerNameLocal", "partnerNameEN", "companySegment", "companyType",
  "companyBusinessType", "companyTaxId", "address1", "address2", "moo", "village",
  "subdistrictId", "districtId", "stateId", "countryId", "countryCode", "zipCode",
  "latitude", "longitude", "partnerStatus", "memberCreateId", "memberRefId", "refCode",
];

// memberCreateId / memberRefId are varchar(13) in partner_info
const MEMBER_ID_MAX_LENGTH = 13;

const validateMemberIds = (fields) => {
  for (const key of ["memberCreateId", "memberRefId"]) {
    if (fields[key] !== undefined && String(fields[key]).length > MEMBER_ID_MAX_LENGTH) {
      return validationError(`${key} must be at most ${MEMBER_ID_MAX_LENGTH} characters`);
    }
  }
  return null;
};

const pickEditable = (data) => {
  const out = {};
  for (const key of EDITABLE_FIELDS) {
    if (data[key] !== undefined && data[key] !== null) out[key] = data[key];
  }
  return out;
};

// partner_info + segment / business type names + creator name, like getCorporateFile
const partnerInfoQuery = () =>
  honnoi("partner_info as pi")
    .leftJoin("company_segment as cs", "cs.segmentId", "pi.companySegment")
    .leftJoin("company_business_type as cbt", "cbt.business_id", "pi.companyBusinessType")
    .leftJoin("bo_user as bu", "bu.staffId", "pi.memberCreateId")
    .select(
      "pi.*",
      "cs.segmentName",
      "cbt.business_name as businessName",
      honnoi.raw("TRIM(CONCAT(COALESCE(bu.name, ''), ' ', COALESCE(bu.lastname, ''))) as memberCreateName")
    );

// returns the name fields that already belong to another partner, e.g. ["partnerNameLocal"]
const findDuplicateNames = async ({ partnerNameLocal, partnerNameEN, excludeId }) => {
  if (!partnerNameLocal && !partnerNameEN) return [];

  const query = honnoi("partner_info").where(function () {
    if (partnerNameLocal) this.orWhere("partnerNameLocal", partnerNameLocal);
    if (partnerNameEN) this.orWhere("partnerNameEN", partnerNameEN);
  });
  if (excludeId) query.andWhere("id", "!=", excludeId);

  const rows = await query;
  if (rows.length === 0) return [];

  const duplicated = [];
  if (partnerNameLocal && rows.some((r) => r.partnerNameLocal === partnerNameLocal)) duplicated.push("partnerNameLocal");
  if (partnerNameEN && rows.some((r) => r.partnerNameEN === partnerNameEN)) duplicated.push("partnerNameEN");
  return duplicated;
};

const duplicateNameError = (duplicated) => ({
  status_code: 10031,
  status_phrase: status_code[10031],
  message: `duplicate : ${duplicated.join(" and ")}`,
});

// escapes LIKE wildcards so user input is matched literally
const escapeLike = (value) => String(value).replace(/[\\%_]/g, (c) => `\\${c}`);

// checks companySegment / companyBusinessType against their master tables
const validateMasterData = async ({ companySegment, companyBusinessType }) => {
  if (companySegment) {
    const segment = await honnoi("company_segment").where({ segmentId: companySegment }).first();
    if (!segment) {
      return { status_code: 10029, status_phrase: status_code[10029], message: status_code[10029] };
    }
  }
  if (companyBusinessType) {
    const business = await honnoi("company_business_type").where({ business_id: companyBusinessType }).first();
    if (!business) {
      return { status_code: 10028, status_phrase: status_code[10028], message: status_code[10028] };
    }
  }
  return null;
};

// validates the state > district > sub-district chain against the thailand_* tables
// and returns the matching Thai names for the *Text columns
const resolveLocation = async ({ stateId, districtId, subdistrictId }) => {
  const invalid = (message) => ({
    error: { status_code: 10032, status_phrase: status_code[10032], message },
  });
  const texts = {};

  if (stateId) {
    const state = await honnoi("thailand_state").where({ state_id: stateId }).first();
    if (!state) return invalid("stateId not found");
    texts.stateText = state.state_name_tha;
  } else {
    texts.stateText = "";
  }

  if (districtId) {
    const district = await honnoi("thailand_district").where({ district_id: districtId }).first();
    if (!district) return invalid("districtId not found");
    if (String(district.state_id) !== String(stateId)) return invalid("districtId does not belong to stateId");
    texts.districtText = district.district_name_tha;
  } else {
    texts.districtText = "";
  }

  if (subdistrictId) {
    const sub = await honnoi("thailand_sub_district").where({ sub_district_id: subdistrictId }).first();
    if (!sub) return invalid("subdistrictId not found");
    if (String(sub.district_id) !== String(districtId)) return invalid("subdistrictId does not belong to districtId");
    texts.subdistrictText = sub.sub_district_name_tha;
  } else {
    texts.subdistrictText = "";
  }

  return { texts };
};

// uploads every data url; if any one fails the ones already uploaded are removed
// so a record never points at a half-replaced file list
const uploadList = async ({ list, id, subfolder, prefix }) => {
  const urls = [];
  for (const item of list) {
    const uploaded = await file.uploadDocument({
      file: item,
      originalname: prefix,
      pathfile: String(id),
      subfolder,
      type: "partner_info",
    });
    if (!uploaded?.url) {
      await deleteList({ urls, id, subfolder });
      return { ok: false, message: uploaded?.message || "upload file failed" };
    }
    urls.push(uploaded.url);
  }
  return { ok: true, urls };
};

const deleteList = async ({ urls, id, subfolder }) => {
  for (const url of urls) {
    await file.deleteDocument({ url, pathfile: String(id), subfolder, type: "partner_info" });
  }
};

const isDataUrlList = (value) =>
  Array.isArray(value) && value.every((v) => /^data:[\w.+-]+\/[\w.+-]+;base64,/.test(String(v || "")));

// shared body of updatePartnerFile / updatePartnerImage
const replaceFiles = async ({ data, listKey, column, subfolder, prefix }) => {
  data = await getPayload(data);
  const { id } = data || {};
  const list = data?.[listKey];

  if (!id) return validationError("missing id");
  if (!isDataUrlList(list)) return validationError(`${listKey} must be an array of base64 data urls`);

  const existing = await honnoi("partner_info").where({ id }).first();
  if (!existing) {
    return { status_code: 10030, status_phrase: status_code[10030], message: status_code[10030] };
  }

  const uploaded = await uploadList({ list, id, subfolder, prefix });
  if (!uploaded.ok) return fail(uploaded.message);

  await honnoi("partner_info").where({ id }).update({
    [column]: uploaded.urls.join(","),
    updateDate: now(),
  });

  // old files are removed only after the new list is saved
  await deleteList({ urls: splitUrls(existing[column]), id, subfolder });

  return {
    status_code: 200,
    status_phrase: status_code[200],
    message: status_code[200],
    data: uploaded.urls,
  };
};

module.exports = {
  createPartnerInfo: async function (data, auth) {
    try {
      data = await getPayload(data);
      const fields = pickEditable(data || {});
      const fileList = data?.file || [];
      const imageList = data?.image || [];

      if (!fields.partnerNameLocal) return validationError("missing partnerNameLocal");
      if (fields.partnerStatus !== undefined && !PARTNER_STATUS.includes(String(fields.partnerStatus))) {
        return validationError("partnerStatus must be 0, 1 or 2");
      }
      const memberIdError = validateMemberIds(fields);
      if (memberIdError) return memberIdError;
      if (!isDataUrlList(fileList)) return validationError("file must be an array of base64 data urls");
      if (!isDataUrlList(imageList)) return validationError("image must be an array of base64 data urls");

      const duplicated = await findDuplicateNames(fields);
      if (duplicated.length) return duplicateNameError(duplicated);

      const masterError = await validateMasterData(fields);
      if (masterError) return masterError;

      const location = await resolveLocation(fields);
      if (location.error) return location.error;

      const [id] = await honnoi("partner_info").insert({
        ...fields,
        ...location.texts,
        // falls back to the logged-in staff when the request does not send one
        memberCreateId: fields.memberCreateId || auth?.staffId || "",
        createDate: now(),
        updateDate: now(),
      });

      const files = await uploadList({ list: fileList, id, subfolder: "file", prefix: "file" });
      if (!files.ok) {
        await honnoi("partner_info").where({ id }).del();
        return fail(files.message);
      }
      const images = await uploadList({ list: imageList, id, subfolder: "image", prefix: "image" });
      if (!images.ok) {
        await deleteList({ urls: files.urls, id, subfolder: "file" });
        await honnoi("partner_info").where({ id }).del();
        return fail(images.message);
      }

      if (files.urls.length || images.urls.length) {
        await honnoi("partner_info").where({ id }).update({
          fileCorporate: files.urls.join(","),
          imageCorporate: images.urls.join(","),
        });
      }

      return {
        status_code: 200,
        status_phrase: status_code[200],
        message: status_code[200],
        id,
      };
    } catch (error) {
      console.log(error);
      return fail();
    }
  },

  updatePartnerInfo: async function (data) {
    try {
      data = await getPayload(data);
      const { id } = data || {};
      const fields = pickEditable(data || {});

      if (!id) return validationError("missing id");
      if (fields.partnerNameLocal === "") return validationError("partnerNameLocal cannot be empty");
      if (fields.partnerStatus !== undefined && !PARTNER_STATUS.includes(String(fields.partnerStatus))) {
        return validationError("partnerStatus must be 0, 1 or 2");
      }
      const memberIdError = validateMemberIds(fields);
      if (memberIdError) return memberIdError;

      const existing = await honnoi("partner_info").where({ id }).first();
      if (!existing) {
        return { status_code: 10030, status_phrase: status_code[10030], message: status_code[10030] };
      }

      const duplicated = await findDuplicateNames({ ...fields, excludeId: id });
      if (duplicated.length) return duplicateNameError(duplicated);

      const masterError = await validateMasterData(fields);
      if (masterError) return masterError;

      let locationTexts = {};
      if (["stateId", "districtId", "subdistrictId"].some((k) => fields[k] !== undefined)) {
        const location = await resolveLocation({
          stateId: fields.stateId ?? existing.stateId,
          districtId: fields.districtId ?? existing.districtId,
          subdistrictId: fields.subdistrictId ?? existing.subdistrictId,
        });
        if (location.error) return location.error;
        locationTexts = location.texts;
      }

      await honnoi("partner_info").where({ id }).update({
        ...fields,
        ...locationTexts,
        updateDate: now(),
      });

      return {
        status_code: 200,
        status_phrase: status_code[200],
        message: status_code[200],
      };
    } catch (error) {
      console.log(error);
      return fail();
    }
  },

  getPartnerInfo: async function (data) {
    try {
      data = await getPayload(data);
      const { id } = data || {};

      if (!id) return validationError("missing id");

      const row = await partnerInfoQuery().where("pi.id", id).first();
      if (!row) {
        return { status_code: 10030, status_phrase: status_code[10030], message: status_code[10030] };
      }

      return {
        status_code: 200,
        status_phrase: status_code[200],
        data: mapPartnerInfoRow(row),
      };
    } catch (error) {
      console.log(error);
      return fail();
    }
  },

  searchPartnerInfo: async function (data) {
    try {
      data = await getPayload(data);
      const {
        partnerName = "",
        companyTaxId = "",
        companySegment = "",
        companyBusinessType = "",
        stateId = "",
        partnerStatus = "",
        createStart = "",
        createStop = "",
        page = 1,
        pageSize = 20,
        orderBy = "createDate",
        sortBy = "desc",
      } = data || {};

      const pg = Math.max(parseInt(page, 10) || 1, 1);
      const ps = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 200);

      const allowedOrderBy = new Set([
        "id", "partnerNameLocal", "partnerNameEN", "companySegment", "companyBusinessType",
        "companyTaxId", "stateId", "partnerStatus", "createDate", "updateDate",
      ]);
      const safeOrderBy = allowedOrderBy.has(orderBy) ? orderBy : "createDate";
      const safeSort = String(sortBy).toLowerCase() === "asc" ? "asc" : "desc";

      // a date-only value (YYYY-MM-DD) covers the whole day
      const isDateOnly = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v));
      let fromDate = null;
      let toDate = null;
      if (createStart) {
        const d = dayjs(createStart);
        if (!d.isValid()) return validationError("invalid createStart");
        fromDate = (isDateOnly(createStart) ? d.startOf("day") : d).format("YYYY-MM-DD HH:mm:ss");
      }
      if (createStop) {
        const d = dayjs(createStop);
        if (!d.isValid()) return validationError("invalid createStop");
        toDate = (isDateOnly(createStop) ? d.endOf("day") : d).format("YYYY-MM-DD HH:mm:ss");
      }
      if (fromDate && toDate && fromDate > toDate) {
        return validationError("createStart must be before createStop");
      }

      const baseQuery = partnerInfoQuery();

      if (partnerName) {
        baseQuery.andWhere(function () {
          this.where("pi.partnerNameLocal", "like", `%${partnerName}%`)
            .orWhere("pi.partnerNameEN", "like", `%${partnerName}%`);
        });
      }
      if (companyTaxId) baseQuery.andWhere("pi.companyTaxId", "like", `%${companyTaxId}%`);
      if (companySegment) baseQuery.andWhere("pi.companySegment", companySegment);
      if (companyBusinessType) baseQuery.andWhere("pi.companyBusinessType", companyBusinessType);
      if (stateId) baseQuery.andWhere("pi.stateId", stateId);
      if (partnerStatus !== undefined && partnerStatus !== null && partnerStatus !== "") {
        baseQuery.andWhere("pi.partnerStatus", partnerStatus);
      }
      if (fromDate) baseQuery.andWhere("pi.createDate", ">=", fromDate);
      if (toDate) baseQuery.andWhere("pi.createDate", "<=", toDate);

      const [{ count }] = await baseQuery.clone().clearSelect().count({ count: "*" });

      const rows = await baseQuery
        .clone()
        .orderBy(`pi.${safeOrderBy}`, safeSort)
        .limit(ps)
        .offset((pg - 1) * ps);

      return {
        status_code: 200,
        status_phrase: status_code[200],
        page: pg,
        pageSize: ps,
        total: Number(count || 0),
        totalPages: Math.ceil(Number(count || 0) / ps),
        data: rows.map(mapPartnerInfoRow),
      };
    } catch (error) {
      console.log(error);
      return fail();
    }
  },

  searchMemberRefId: async function (data) {
    try {
      data = await getPayload(data);
      const { memberRefId = "", exact = false, page = 1, pageSize = 20 } = data || {};
      const refId = String(memberRefId ?? "").trim();

      if (!refId) return validationError("missing memberRefId");
      if (refId.length > MEMBER_ID_MAX_LENGTH) {
        return validationError(`memberRefId must be at most ${MEMBER_ID_MAX_LENGTH} characters`);
      }

      const pg = Math.max(parseInt(page, 10) || 1, 1);
      const ps = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 200);

      const baseQuery = partnerInfoQuery();
      if (exact === true) {
        baseQuery.where("pi.memberRefId", refId);
      } else {
        baseQuery.where("pi.memberRefId", "like", `%${escapeLike(refId)}%`);
      }

      const [{ count }] = await baseQuery.clone().clearSelect().count({ count: "*" });

      const rows = await baseQuery
        .clone()
        .orderBy("pi.createDate", "desc")
        .limit(ps)
        .offset((pg - 1) * ps);

      return {
        status_code: 200,
        status_phrase: status_code[200],
        page: pg,
        pageSize: ps,
        total: Number(count || 0),
        totalPages: Math.ceil(Number(count || 0) / ps),
        data: rows.map(mapPartnerInfoRow),
      };
    } catch (error) {
      console.log(error);
      return fail();
    }
  },

  // lets the create / edit form check a name before submitting;
  // send excludeId when editing so the partner's own row is not counted
  checkPartnerName: async function (data) {
    try {
      data = await getPayload(data);
      const { excludeId } = data || {};
      const partnerNameLocal = data?.partnerNameLocal ? String(data.partnerNameLocal) : "";
      const partnerNameEN = data?.partnerNameEN ? String(data.partnerNameEN) : "";

      if (!partnerNameLocal && !partnerNameEN) {
        return validationError("missing partnerNameLocal or partnerNameEN");
      }

      const duplicateFields = await findDuplicateNames({ partnerNameLocal, partnerNameEN, excludeId });

      // null = that name was not sent, so it was not checked
      const availability = (key, value) => (value ? !duplicateFields.includes(key) : null);

      return {
        status_code: 200,
        status_phrase: status_code[200],
        duplicated: duplicateFields.length > 0,
        duplicateFields,
        available: {
          partnerNameLocal: availability("partnerNameLocal", partnerNameLocal),
          partnerNameEN: availability("partnerNameEN", partnerNameEN),
        },
      };
    } catch (error) {
      console.log(error);
      return fail();
    }
  },

  checkSaleAgent: async function (data) {
    try {
      data = await getPayload(data);
      const saleAgentId = String(data?.saleAgentId ?? "").trim();

      if (!saleAgentId) return validationError("missing saleAgentId");

      // TODO: confirm sale_agent column names against the real schema
      const agent = await honnoi("sale_agent")
        .where({ saleAgentId })
        .first("firstNameTH", "lastNameTH", "firstNameEN", "lastNameEN", "refCode");
      if (!agent) {
        return { status_code: 10034, status_phrase: status_code[10034], message: "result not found" };
      }

      const fullName = (first, last) => [first, last].filter(Boolean).join(" ").trim();

      return {
        status_code: 200,
        status_phrase: status_code[200],
        data: {
          nameTH: fullName(agent.firstNameTH, agent.lastNameTH),
          nameEN: fullName(agent.firstNameEN, agent.lastNameEN),
          refCode: agent.refCode,
        },
      };
    } catch (error) {
      console.log(error);
      return fail();
    }
  },

  updatePartnerFile: async function (data) {
    try {
      return await replaceFiles({ data, listKey: "file", column: "fileCorporate", subfolder: "file", prefix: "file" });
    } catch (error) {
      console.log(error);
      return fail();
    }
  },

  updatePartnerImage: async function (data) {
    try {
      return await replaceFiles({ data, listKey: "image", column: "imageCorporate", subfolder: "image", prefix: "image" });
    } catch (error) {
      console.log(error);
      return fail();
    }
  },

  uploadPartnerProfileImage: async function (data) {
    try {
      data = await getPayload(data);
      const { id, image } = data || {};

      if (!id || !image) return validationError("missing id or image");

      const existing = await honnoi("partner_info").where({ id }).first();
      if (!existing) {
        return { status_code: 10030, status_phrase: status_code[10030], message: status_code[10030] };
      }

      const uploaded = await file.uploadProfileImage({
        image,
        originalname: `${id}_profile`,
        pathfile: String(id),
        type: "partner_info",
      });

      if (!uploaded?.url) return fail("upload image failed");

      await honnoi("partner_info").where({ id }).update({
        profileImage: uploaded.url,
        updateDate: now(),
      });

      if (existing.profileImage && existing.profileImage !== uploaded.url) {
        await file.deleteProfileImage({
          url: existing.profileImage,
          pathfile: String(id),
          type: "partner_info",
        });
      }

      return {
        status_code: 200,
        status_phrase: status_code[200],
        message: "upload image success",
        url: uploaded.url,
      };
    } catch (error) {
      console.log(error);
      return fail();
    }
  },
};
