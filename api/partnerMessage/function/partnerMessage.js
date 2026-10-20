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

const messageNotFound = () => ({
  status_code: 10033,
  status_phrase: status_code[10033],
  message: status_code[10033],
});

const TARGET_TYPE = ["ALL", "PARTNER"];
const PRIORITY = ["NORMAL", "IMPORTANT", "URGENT"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILE_COUNT = 10;

const toPaging = ({ page = 1, pageSize = 20 }) => {
  const pg = Math.max(parseInt(page, 10) || 1, 1);
  const ps = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 200);
  return { pg, ps };
};

const pagingResult = ({ pg, ps, count, data }) => ({
  status_code: 200,
  status_phrase: status_code[200],
  page: pg,
  pageSize: ps,
  total: Number(count || 0),
  totalPages: Math.ceil(Number(count || 0) / ps),
  data,
});

// readStatus filter accepts 0/1 as number or string; anything else means "all"
const parseReadStatus = (value) => (["0", "1"].includes(String(value)) ? Number(value) : null);

const DATA_URL = /^data:([\w.+-]+\/[\w.+-]+);base64,(.+)$/;

// decoded size of a base64 payload without allocating the buffer
const base64Size = (b64) => {
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
};

// files: [{ fileName, file: "data:<mime>;base64,..." }]
const validateFiles = (files) => {
  if (!Array.isArray(files)) return { error: validationError("files must be an array") };
  if (files.length > MAX_FILE_COUNT) return { error: validationError(`files must be at most ${MAX_FILE_COUNT} items`) };

  const list = [];
  for (const item of files) {
    const fileName = String(item?.fileName || "").trim();
    const match = DATA_URL.exec(String(item?.file || ""));
    if (!fileName) return { error: validationError("missing fileName") };
    if (fileName.length > 255) return { error: validationError("fileName must be at most 255 characters") };
    if (!match) return { error: validationError(`${fileName}: file must be a base64 data url`) };

    const fileSize = base64Size(match[2]);
    if (fileSize > MAX_FILE_SIZE) return { error: validationError(`${fileName}: file must be at most 10MB`) };

    list.push({ fileName, file: item.file, mimeType: match[1], fileSize });
  }
  return { list };
};

// the GCS object name only keeps a safe version of the original name; the real
// fileName is stored on partner_message_file for display/download
const safeBaseName = (fileName) =>
  fileName.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_").slice(0, 50) || "file";

const uploadFiles = async ({ list, messageId }) => {
  const uploaded = [];
  for (const item of list) {
    const result = await file.uploadDocument({
      file: item.file,
      originalname: safeBaseName(item.fileName),
      pathfile: String(messageId),
      subfolder: "file",
      type: "partner_message",
    });
    if (!result?.url) {
      await deleteFiles({ urls: uploaded.map((f) => f.fileUrl), messageId });
      return { ok: false, message: result?.message || "upload file failed" };
    }
    uploaded.push({ fileName: item.fileName, fileUrl: result.url, mimeType: item.mimeType, fileSize: item.fileSize });
  }
  return { ok: true, uploaded };
};

const deleteFiles = async ({ urls, messageId }) => {
  for (const url of urls) {
    await file.deleteDocument({ url, pathfile: String(messageId), subfolder: "file", type: "partner_message" });
  }
};

const getFiles = (messageId) =>
  honnoi("partner_message_file")
    .where({ messageId })
    .select("id", "fileName", "fileUrl", "mimeType", "fileSize")
    .orderBy("id");

const mapMessageRow = (row) => ({
  ...row,
  totalUnread: Number(row.totalRecipient || 0) - Number(row.totalRead || 0),
  createDate: formatDateTime(row.createDate),
  updateDate: formatDateTime(row.updateDate),
});

// a partner login is tied to one company; every inbox query is scoped by it
const getPartnerInfoId = async (auth) => {
  const user = await honnoi("partner_user")
    .where({ userId: auth?.userId })
    .whereNull("deleteUserDate")
    .first("partnerInfoId");
  return user?.partnerInfoId || null;
};

const partnerNotLinked = () => ({
  status_code: 10030,
  status_phrase: status_code[10030],
  message: "partner user is not linked to any partner_info",
});

const inboxQuery = (partnerInfoId) =>
  honnoi("partner_message_recipient as r")
    .join("partner_message as m", "m.id", "r.messageId")
    .where("r.partnerInfoId", partnerInfoId)
    .whereNull("m.deleteDate");

module.exports = {
  // ---------------- back office (staff) ----------------

  createPartnerMessage: async function (data, auth) {
    try {
      data = await getPayload(data);
      const targetType = String(data?.targetType || "").toUpperCase();
      const priority = String(data?.priority || "NORMAL").toUpperCase();
      const title = String(data?.title || "").trim();
      const body = String(data?.body || "").trim();

      if (!TARGET_TYPE.includes(targetType)) return validationError("targetType must be ALL or PARTNER");
      if (!PRIORITY.includes(priority)) return validationError("priority must be NORMAL, IMPORTANT or URGENT");
      if (!title) return validationError("missing title");
      if (title.length > 255) return validationError("title must be at most 255 characters");
      if (!body) return validationError("missing body");

      const files = validateFiles(data?.files || []);
      if (files.error) return files.error;

      let partnerInfoIds = [];
      if (targetType === "PARTNER") {
        if (!Array.isArray(data?.partnerInfoIds) || data.partnerInfoIds.length === 0) {
          return validationError("missing partnerInfoIds");
        }
        partnerInfoIds = [...new Set(data.partnerInfoIds.map((id) => parseInt(id, 10)))];
        if (partnerInfoIds.some((id) => !Number.isInteger(id) || id <= 0)) {
          return validationError("partnerInfoIds must be an array of partner_info id");
        }

        const found = await honnoi("partner_info").whereIn("id", partnerInfoIds).pluck("id");
        const missing = partnerInfoIds.filter((id) => !found.includes(id));
        if (missing.length) {
          return { status_code: 10030, status_phrase: status_code[10030], message: `partner not found : ${missing.join(",")}` };
        }
      }

      const staff = await honnoi("bo_user").where({ staffId: auth?.staffId }).first();
      if (!staff) return { status_code: 10006, status_phrase: status_code[10006], message: status_code[10006] };

      const trx = await honnoi.transaction();
      let id = null;
      let uploadedUrls = [];
      try {
        [id] = await trx("partner_message").insert({
          targetType,
          priority,
          title,
          body,
          senderStaffId: staff.staffId,
          // snapshot so the message keeps the sender shown at send time
          senderName: [staff.name, staff.lastname].filter(Boolean).join(" "),
          senderRole: staff.userLevel || null,
          createDate: now(),
          updateDate: now(),
        });

        // fan out one recipient row per partner_info; a broadcast only reaches
        // partners that are active right now
        let totalRecipient = 0;
        if (targetType === "ALL") {
          const [result] = await trx.raw(
            `INSERT IGNORE INTO partner_message_recipient (messageId, partnerInfoId, readStatus, createDate)
             SELECT ?, id, 0, ? FROM partner_info WHERE partnerStatus = '1'`,
            [id, now()]
          );
          totalRecipient = result.affectedRows;
        } else {
          const rows = partnerInfoIds.map((partnerInfoId) => ({
            messageId: id,
            partnerInfoId,
            readStatus: 0,
            createDate: now(),
          }));
          await trx.batchInsert("partner_message_recipient", rows, 500);
          totalRecipient = rows.length;
        }

        if (totalRecipient === 0) {
          await trx.rollback();
          return validationError("no active partner to send to");
        }

        await trx("partner_message").where({ id }).update({ totalRecipient });

        const upload = await uploadFiles({ list: files.list, messageId: id });
        if (!upload.ok) {
          await trx.rollback();
          return fail(upload.message);
        }
        uploadedUrls = upload.uploaded.map((f) => f.fileUrl);
        if (upload.uploaded.length) {
          await trx("partner_message_file").insert(
            upload.uploaded.map((f) => ({ ...f, messageId: id, createDate: now() }))
          );
        }

        await trx.commit();

        return {
          status_code: 200,
          status_phrase: status_code[200],
          message: status_code[200],
          id,
          totalRecipient,
        };
      } catch (error) {
        await trx.rollback();
        // the message row is gone, so files uploaded for it would be orphaned
        if (uploadedUrls.length) await deleteFiles({ urls: uploadedUrls, messageId: id });
        throw error;
      }
    } catch (error) {
      console.log(error);
      return fail();
    }
  },

  searchPartnerMessage: async function (data) {
    try {
      data = await getPayload(data);
      const { search = "", targetType = "", priority = "", readStatus = "" } = data || {};
      const { pg, ps } = toPaging(data || {});
      const read = parseReadStatus(readStatus);

      const baseQuery = honnoi("partner_message as m").whereNull("m.deleteDate");

      if (search) {
        baseQuery.andWhere(function () {
          this.where("m.title", "like", `%${search}%`)
            .orWhere("m.body", "like", `%${search}%`)
            .orWhereExists(function () {
              this.select(honnoi.raw(1))
                .from("partner_message_recipient as r")
                .join("partner_info as pi", "pi.id", "r.partnerInfoId")
                .whereRaw("r.messageId = m.id")
                .andWhere(function () {
                  this.where("pi.partnerNameLocal", "like", `%${search}%`)
                    .orWhere("pi.partnerNameEN", "like", `%${search}%`);
                });
            });
        });
      }
      if (targetType) baseQuery.andWhere("m.targetType", String(targetType).toUpperCase());
      if (priority) baseQuery.andWhere("m.priority", String(priority).toUpperCase());
      // a message counts as read only once every recipient has opened it
      if (read === 1) baseQuery.andWhereRaw("m.totalRead >= m.totalRecipient");
      if (read === 0) baseQuery.andWhereRaw("m.totalRead < m.totalRecipient");

      const [{ count }] = await baseQuery.clone().count({ count: "*" });

      const rows = await baseQuery
        .clone()
        .select(
          "m.id", "m.targetType", "m.priority", "m.title", "m.body",
          "m.totalRecipient", "m.totalRead", "m.senderStaffId", "m.senderName", "m.senderRole",
          "m.createDate", "m.updateDate"
        )
        .orderBy("m.createDate", "desc")
        .limit(ps)
        .offset((pg - 1) * ps);

      // last open time per message, and partner names for non-broadcast rows
      // so the list can show who it was sent to without opening the detail
      const ids = rows.map((r) => r.id);
      const partnerIds = rows.filter((r) => r.targetType === "PARTNER").map((r) => r.id);
      const [lastRead, partners] = await Promise.all([
        ids.length
          ? honnoi("partner_message_recipient").whereIn("messageId", ids).groupBy("messageId")
            .select("messageId", honnoi.raw("MAX(readDate) as lastReadDate"))
          : [],
        partnerIds.length
          ? honnoi("partner_message_recipient as r")
            .join("partner_info as pi", "pi.id", "r.partnerInfoId")
            .whereIn("r.messageId", partnerIds)
            .select("r.messageId", "pi.id", "pi.partnerNameLocal", "pi.partnerNameEN")
            .orderBy("pi.id")
          : [],
      ]);

      const data_ = rows.map((row) => ({
        ...mapMessageRow(row),
        lastReadDate: formatDateTime(lastRead.find((l) => l.messageId === row.id)?.lastReadDate),
        partners: partners
          .filter((p) => p.messageId === row.id)
          .map(({ id, partnerNameLocal, partnerNameEN }) => ({ id, partnerNameLocal, partnerNameEN })),
      }));

      return pagingResult({ pg, ps, count, data: data_ });
    } catch (error) {
      console.log(error);
      return fail();
    }
  },

  getPartnerMessageSummary: async function () {
    try {
      const [row] = await honnoi("partner_message")
        .whereNull("deleteDate")
        .select(
          honnoi.raw("COUNT(*) as totalMessage"),
          honnoi.raw("COALESCE(SUM(totalRead >= totalRecipient), 0) as totalRead"),
          honnoi.raw("COALESCE(SUM(totalRead < totalRecipient), 0) as totalUnread")
        );

      return {
        status_code: 200,
        status_phrase: status_code[200],
        data: {
          totalMessage: Number(row.totalMessage || 0),
          totalRead: Number(row.totalRead || 0),
          totalUnread: Number(row.totalUnread || 0),
        },
      };
    } catch (error) {
      console.log(error);
      return fail();
    }
  },

  getPartnerMessage: async function (data) {
    try {
      data = await getPayload(data);
      const { id } = data || {};
      if (!id) return validationError("missing id");

      const row = await honnoi("partner_message").where({ id }).whereNull("deleteDate").first();
      if (!row) return messageNotFound();

      return {
        status_code: 200,
        status_phrase: status_code[200],
        data: { ...mapMessageRow(row), files: await getFiles(id) },
      };
    } catch (error) {
      console.log(error);
      return fail();
    }
  },

  getPartnerMessageRecipient: async function (data) {
    try {
      data = await getPayload(data);
      const { id, search = "", readStatus = "" } = data || {};
      const { pg, ps } = toPaging(data || {});
      const read = parseReadStatus(readStatus);

      if (!id) return validationError("missing id");

      const message = await honnoi("partner_message").where({ id }).whereNull("deleteDate").first("id");
      if (!message) return messageNotFound();

      const baseQuery = honnoi("partner_message_recipient as r")
        .join("partner_info as pi", "pi.id", "r.partnerInfoId")
        .where("r.messageId", id);

      if (read !== null) baseQuery.andWhere("r.readStatus", read);
      if (search) {
        baseQuery.andWhere(function () {
          this.where("pi.partnerNameLocal", "like", `%${search}%`)
            .orWhere("pi.partnerNameEN", "like", `%${search}%`);
        });
      }

      const [{ count }] = await baseQuery.clone().count({ count: "*" });

      const rows = await baseQuery
        .clone()
        .leftJoin("partner_user as pu", "pu.userId", "r.readByUserId")
        .select(
          "r.id as recipientId", "r.partnerInfoId", "pi.partnerNameLocal", "pi.partnerNameEN",
          "pi.profileImage", "r.readStatus", "r.readDate", "r.readByUserId",
          honnoi.raw("TRIM(CONCAT(COALESCE(pu.name, ''), ' ', COALESCE(pu.lastname, ''))) as readByName")
        )
        // unread first so staff see who still has to open it
        .orderBy([{ column: "r.readStatus", order: "asc" }, { column: "pi.partnerNameLocal", order: "asc" }])
        .limit(ps)
        .offset((pg - 1) * ps);

      return pagingResult({
        pg,
        ps,
        count,
        data: rows.map((r) => ({ ...r, readDate: formatDateTime(r.readDate) })),
      });
    } catch (error) {
      console.log(error);
      return fail();
    }
  },

  deletePartnerMessage: async function (data) {
    try {
      data = await getPayload(data);
      const { id } = data || {};
      if (!id) return validationError("missing id");

      const updated = await honnoi("partner_message")
        .where({ id })
        .whereNull("deleteDate")
        .update({ deleteDate: now(), updateDate: now() });
      if (!updated) return messageNotFound();

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

  // ---------------- partner inbox ----------------

  getInboxCount: async function (data, auth) {
    try {
      const partnerInfoId = await getPartnerInfoId(auth);
      if (!partnerInfoId) return partnerNotLinked();

      const [row] = await inboxQuery(partnerInfoId).select(
        honnoi.raw("COUNT(*) as total"),
        honnoi.raw("COALESCE(SUM(r.readStatus = 0), 0) as unread"),
        honnoi.raw("COALESCE(SUM(r.readStatus = 1), 0) as `read`")
      );

      return {
        status_code: 200,
        status_phrase: status_code[200],
        data: {
          total: Number(row.total || 0),
          unread: Number(row.unread || 0),
          read: Number(row.read || 0),
        },
      };
    } catch (error) {
      console.log(error);
      return fail();
    }
  },

  searchInbox: async function (data, auth) {
    try {
      data = await getPayload(data);
      const { tab = "all", search = "" } = data || {};
      const { pg, ps } = toPaging(data || {});

      const partnerInfoId = await getPartnerInfoId(auth);
      if (!partnerInfoId) return partnerNotLinked();

      const baseQuery = inboxQuery(partnerInfoId);
      if (tab === "unread") baseQuery.andWhere("r.readStatus", 0);
      if (tab === "read") baseQuery.andWhere("r.readStatus", 1);
      if (search) {
        baseQuery.andWhere(function () {
          this.where("m.title", "like", `%${search}%`).orWhere("m.body", "like", `%${search}%`);
        });
      }

      const [{ count }] = await baseQuery.clone().count({ count: "*" });

      const rows = await baseQuery
        .clone()
        .select(
          "r.id as recipientId", "r.messageId", "r.readStatus", "r.readDate",
          "m.priority", "m.title", "m.body", "m.senderName", "m.senderRole", "m.createDate"
        )
        .orderBy("m.createDate", "desc")
        .limit(ps)
        .offset((pg - 1) * ps);

      return pagingResult({
        pg,
        ps,
        count,
        data: rows.map((r) => ({
          ...r,
          readDate: formatDateTime(r.readDate),
          createDate: formatDateTime(r.createDate),
        })),
      });
    } catch (error) {
      console.log(error);
      return fail();
    }
  },

  // returns the message and marks it read for the partner's company
  readInbox: async function (data, auth) {
    try {
      data = await getPayload(data);
      const { recipientId } = data || {};
      if (!recipientId) return validationError("missing recipientId");

      const partnerInfoId = await getPartnerInfoId(auth);
      if (!partnerInfoId) return partnerNotLinked();

      const row = await inboxQuery(partnerInfoId)
        .where("r.id", recipientId)
        .first(
          "r.id as recipientId", "r.messageId", "r.readStatus", "r.readDate",
          "m.priority", "m.title", "m.body", "m.senderName", "m.senderRole", "m.createDate"
        );
      if (!row) return messageNotFound();

      if (row.readStatus === 0) {
        const readDate = now();
        await honnoi.transaction(async (trx) => {
          // readStatus = 0 in the where keeps the first open time and stops
          // two users of the same company from counting the message twice
          const updated = await trx("partner_message_recipient")
            .where({ id: row.recipientId, partnerInfoId, readStatus: 0 })
            .update({ readStatus: 1, readDate, readByUserId: auth.userId });
          if (updated) {
            await trx("partner_message").where({ id: row.messageId }).increment("totalRead", 1);
            row.readStatus = 1;
            row.readDate = readDate;
          }
        });
      }

      return {
        status_code: 200,
        status_phrase: status_code[200],
        data: {
          ...row,
          readDate: formatDateTime(row.readDate),
          createDate: formatDateTime(row.createDate),
          files: await getFiles(row.messageId),
        },
      };
    } catch (error) {
      console.log(error);
      return fail();
    }
  },
};
