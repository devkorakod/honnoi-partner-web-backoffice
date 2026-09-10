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

const mapPartnerUserRow = (row) => {
  if (!row) return row;
  const { password, authenToken, ...safe } = row;
  return {
    ...safe,
    firstLogin: formatDateTime(row.firstLogin),
    lastLogin: formatDateTime(row.lastLogin),
    createDate: formatDateTime(row.createDate),
    updateDate: formatDateTime(row.updateDate),
    deleteUserDate: formatDateTime(row.deleteUserDate),
  };
};

const mapPartnerUserRows = (rows = []) => rows.map(mapPartnerUserRow);

const getPayload = async (data) => {
  data = await encode.aesDecrypt(data.payload);
  try {
    data = JSON.parse(data.payload);
  } catch (e) {
    data = data.payload;
  }
  return data || {};
};

const generatePartnerUserId = async () => {
  const prefix = "PTR";
  const last = await honnoi("partner_user")
    .where("userId", "like", `${prefix}%`)
    .orderBy("userId", "desc")
    .first();

  let next = 1;
  if (last?.userId) {
    const num = parseInt(String(last.userId).replace(prefix, ""), 10);
    if (!Number.isNaN(num)) next = num + 1;
  }

  return `${prefix}${String(next).padStart(6, "0")}`;
};

module.exports = {
  createPartnerUser: async function (data) {
    try {
      data = await getPayload(data);
      const {
        name = "",
        lastname = "",
        mobile = "",
        userName,
        password,
        email,
        userGroup = "",
        userLevel = "",
        userClass = "",
        companyName = "",
        department = "",
        userStatus = "1",
      } = data || {};

      if (!userName || !password || !email) {
        return {
          status_code: 10007,
          status_phrase: status_code[10007],
          message: "missing userName, password or email",
        };
      }

      const existing = await honnoi("partner_user")
        .where((q) => {
          q.where("userName", userName).orWhere("email", email);
        })
        .first();

      if (existing && existing.userName === userName) {
        return {
          status_code: 301,
          status_phrase: status_code[10010],
          message: status_code[10010],
        };
      }

      if (existing && existing.email === email) {
        return {
          status_code: 301,
          status_phrase: status_code[10011],
          message: status_code[10011],
        };
      }

      const userId = await generatePartnerUserId();
      const hashedPassword = await encode.hashData(password);
      const createDate = now();

      await honnoi("partner_user").insert({
        userId,
        name: String(name || "").slice(0, 255),
        lastname: String(lastname || "").slice(0, 255),
        mobile: String(mobile || "").slice(0, 50),
        userName: String(userName).slice(0, 255),
        password: hashedPassword,
        email: String(email).slice(0, 100),
        userGroup: String(userGroup || "").slice(0, 10),
        userLevel: String(userLevel || "").slice(0, 10),
        userClass: String(userClass || "").slice(0, 10),
        loginErrCount: 0,
        loginBlock: "0",
        userStatus: String(userStatus ?? "1").slice(0, 10),
        changePassword: "1",
        companyName: String(companyName || "").slice(0, 255),
        department: String(department || "").slice(0, 255),
        createDate,
        updateDate: createDate,
      });

      return {
        status_code: 200,
        status_phrase: status_code[200],
        message: status_code[200],
        userId,
      };
    } catch (error) {
      console.log(error);
      return {
        status_code: 301,
        status_phrase: status_code[301],
        message: status_code[302],
      };
    }
  },

  editPartnerUser: async function (data) {
    try {
      data = await getPayload(data);
      const {
        userId,
        name,
        lastname,
        mobile,
        userName,
        email,
        userGroup,
        userLevel,
        userClass,
        userStatus,
        companyName,
        department,
      } = data || {};

      if (!userId) {
        return {
          status_code: 10007,
          status_phrase: status_code[10007],
          message: "missing userId",
        };
      }

      const existing = await honnoi("partner_user").where({ userId }).first();
      if (!existing) {
        return {
          status_code: 10006,
          status_phrase: status_code[10006],
          message: status_code[10006],
        };
      }

      if (userName && userName !== existing.userName) {
        const dup = await honnoi("partner_user")
          .where({ userName })
          .andWhereNot("userId", userId)
          .first();
        if (dup) {
          return {
            status_code: 301,
            status_phrase: status_code[10010],
            message: status_code[10010],
          };
        }
      }

      if (email && email !== existing.email) {
        const dup = await honnoi("partner_user")
          .where({ email })
          .andWhereNot("userId", userId)
          .first();
        if (dup) {
          return {
            status_code: 301,
            status_phrase: status_code[10011],
            message: status_code[10011],
          };
        }
      }

      const payload = { updateDate: now() };
      if (name !== undefined) payload.name = String(name || "").slice(0, 255);
      if (lastname !== undefined) payload.lastname = String(lastname || "").slice(0, 255);
      if (mobile !== undefined) payload.mobile = String(mobile || "").slice(0, 50);
      if (userName !== undefined) payload.userName = String(userName || "").slice(0, 255);
      if (email !== undefined) payload.email = String(email || "").slice(0, 100);
      if (userGroup !== undefined) payload.userGroup = String(userGroup || "").slice(0, 10);
      if (userLevel !== undefined) payload.userLevel = String(userLevel || "").slice(0, 10);
      if (userClass !== undefined) payload.userClass = String(userClass || "").slice(0, 10);
      if (userStatus !== undefined) payload.userStatus = String(userStatus || "0").slice(0, 10);
      if (companyName !== undefined) payload.companyName = String(companyName || "").slice(0, 255);
      if (department !== undefined) payload.department = String(department || "").slice(0, 255);

      await honnoi("partner_user").where({ userId }).update(payload);

      return {
        status_code: 200,
        status_phrase: status_code[200],
        message: status_code[200],
      };
    } catch (error) {
      console.log(error);
      return {
        status_code: 301,
        status_phrase: status_code[301],
        message: status_code[302],
      };
    }
  },

  getPartnerUser: async function (data) {
    try {
      data = await getPayload(data);
      const { userId } = data || {};

      if (!userId) {
        return {
          status_code: 10007,
          status_phrase: status_code[10007],
          message: "missing userId",
        };
      }

      const row = await honnoi("partner_user").where({ userId }).first();
      if (!row) {
        return {
          status_code: 10006,
          status_phrase: status_code[10006],
          message: status_code[10006],
        };
      }

      return {
        status_code: 200,
        status_phrase: status_code[200],
        data: mapPartnerUserRow(row),
      };
    } catch (error) {
      console.log(error);
      return {
        status_code: 301,
        status_phrase: status_code[301],
        message: status_code[302],
      };
    }
  },

  searchPartnerUser: async function (data) {
    try {
      data = await getPayload(data);
      const {
        userId = "",
        name = "",
        lastname = "",
        mobile = "",
        userName = "",
        email = "",
        companyName = "",
        department = "",
        userStatus = "",
        includeDeleted = false,
        page = 1,
        pageSize = 20,
        orderBy = "createDate",
        sortBy = "desc",
      } = data || {};

      const pg = Math.max(parseInt(page, 10) || 1, 1);
      const ps = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 200);

      const allowedOrderBy = new Set([
        "userId", "name", "lastname", "mobile", "userName", "email",
        "companyName", "department", "userStatus", "loginErrCount", "loginBlock",
        "firstLogin", "lastLogin", "createDate", "updateDate",
      ]);
      const safeOrderBy = allowedOrderBy.has(orderBy) ? orderBy : "createDate";
      const safeSort = String(sortBy).toLowerCase() === "asc" ? "asc" : "desc";

      const baseQuery = honnoi("partner_user").select("*");

      if (!includeDeleted) baseQuery.whereNull("deleteUserDate");
      if (userId) baseQuery.andWhere("userId", "like", `%${userId}%`);
      if (name) baseQuery.andWhere("name", "like", `%${name}%`);
      if (lastname) baseQuery.andWhere("lastname", "like", `%${lastname}%`);
      if (mobile) baseQuery.andWhere("mobile", "like", `%${mobile}%`);
      if (userName) baseQuery.andWhere("userName", "like", `%${userName}%`);
      if (email) baseQuery.andWhere("email", "like", `%${email}%`);
      if (companyName) baseQuery.andWhere("companyName", "like", `%${companyName}%`);
      if (department) baseQuery.andWhere("department", "like", `%${department}%`);
      if (userStatus !== undefined && userStatus !== null && userStatus !== "") {
        baseQuery.andWhere("userStatus", userStatus);
      }

      const [{ count }] = await baseQuery.clone().clearSelect().count({ count: "*" });

      const rows = await baseQuery
        .clone()
        .orderBy(safeOrderBy, safeSort)
        .limit(ps)
        .offset((pg - 1) * ps);

      return {
        status_code: 200,
        status_phrase: status_code[200],
        page: pg,
        pageSize: ps,
        total: Number(count || 0),
        totalPages: Math.ceil(Number(count || 0) / ps),
        data: mapPartnerUserRows(rows),
      };
    } catch (error) {
      console.log(error);
      return {
        status_code: 301,
        status_phrase: status_code[301],
        message: status_code[302],
      };
    }
  },

  deletePartnerUser: async function (data) {
    try {
      data = await getPayload(data);
      const { userId } = data || {};

      if (!userId) {
        return {
          status_code: 10007,
          status_phrase: status_code[10007],
          message: "missing userId",
        };
      }

      const existing = await honnoi("partner_user").where({ userId }).first();
      if (!existing) {
        return {
          status_code: 10006,
          status_phrase: status_code[10006],
          message: status_code[10006],
        };
      }

      await honnoi("partner_user").where({ userId }).update({
        deleteUserDate: now(),
        updateDate: now(),
      });

      return {
        status_code: 200,
        status_phrase: status_code[200],
        message: status_code[200],
      };
    } catch (error) {
      console.log(error);
      return {
        status_code: 301,
        status_phrase: status_code[301],
        message: status_code[302],
      };
    }
  },

  // staff resets a partner's password — forces changePassword on next login
  resetPartnerPassword: async function (data) {
    try {
      data = await getPayload(data);
      const { userId, password } = data || {};

      if (!userId || !password) {
        return {
          status_code: 10007,
          status_phrase: status_code[10007],
          message: "missing userId or password",
        };
      }

      const existing = await honnoi("partner_user").where({ userId }).first();
      if (!existing) {
        return {
          status_code: 10006,
          status_phrase: status_code[10006],
          message: status_code[10006],
        };
      }

      const hashedPassword = await encode.hashData(password);

      await honnoi("partner_user").where({ userId }).update({
        password: hashedPassword,
        changePassword: "1",
        loginErrCount: 0,
        loginBlock: "0",
        updateDate: now(),
      });

      return {
        status_code: 200,
        status_phrase: status_code[200],
        message: status_code[200],
      };
    } catch (error) {
      console.log(error);
      return {
        status_code: 301,
        status_phrase: status_code[301],
        message: status_code[302],
      };
    }
  },

  // partner changes their own password while logged in
  changePassword: async function (data, auth) {
    try {
      data = await getPayload(data);
      const { currentPassword, newPassword } = data || {};
      const userId = auth?.userId;

      if (!userId || !currentPassword || !newPassword) {
        return {
          status_code: 10007,
          status_phrase: status_code[10007],
          message: "missing currentPassword or newPassword",
        };
      }

      const existing = await honnoi("partner_user").where({ userId }).first();
      if (!existing) {
        return {
          status_code: 10006,
          status_phrase: status_code[10006],
          message: status_code[10006],
        };
      }

      const isValid = await encode.compareData(currentPassword, existing.password);
      if (!isValid) {
        return {
          status_code: 301,
          status_phrase: status_code[10003],
          message: status_code[10003],
        };
      }

      const hashedPassword = await encode.hashData(newPassword);

      await honnoi("partner_user").where({ userId }).update({
        password: hashedPassword,
        changePassword: "0",
        updateDate: now(),
      });

      return {
        status_code: 200,
        status_phrase: status_code[200],
        message: status_code[200],
      };
    } catch (error) {
      console.log(error);
      return {
        status_code: 301,
        status_phrase: status_code[301],
        message: status_code[302],
      };
    }
  },

  uploadPartnerUserProfileImage: async function (data, auth) {
    try {
      data = await getPayload(data);
      const { image } = data || {};
      const userId = auth?.userId;

      if (!userId || !image) {
        return {
          status_code: 10007,
          status_phrase: status_code[10007],
          message: "missing image",
        };
      }

      const existing = await honnoi("partner_user").where({ userId }).first();
      if (!existing) {
        return {
          status_code: 10006,
          status_phrase: status_code[10006],
          message: status_code[10006],
        };
      }

      const uploaded = await file.uploadProfileImage({
        image,
        originalname: `${userId}_profile`,
        pathfile: userId,
        type: "partner_user",
      });

      if (!uploaded?.url) {
        return {
          status_code: 301,
          status_phrase: status_code[301],
          message: "upload image failed",
        };
      }

      await honnoi("partner_user").where({ userId }).update({
        profileImgUrl: uploaded.url,
        updateDate: now(),
      });

      if (existing.profileImgUrl && existing.profileImgUrl !== uploaded.url) {
        await file.deleteProfileImage({
          url: existing.profileImgUrl,
          pathfile: userId,
          type: "partner_user",
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
      return {
        status_code: 301,
        status_phrase: status_code[301],
        message: status_code[302],
      };
    }
  },
};
