const express = require("express");
const app = express();
const bodyParser = require("body-parser");
global.dayjs = require("dayjs");

const session = require("express-session");
const passport = require("passport");

const morgan = require("morgan");
require("dotenv").config();
const port = parseInt(process.env.PORT);
const { expressjwt } = require("express-jwt");
const compression = require("compression");
const cors = require("cors");
const cron = require("node-cron");
const getSecretManager = require("./function/secret_manager");

(async () => {
  try {
    let aesIv = await getSecretManager(`${process.env.SECRETMANAGER_PROJECT}${process.env.SECRETMANAGER_ID_AES_IV}/versions/latest`);
    let aesKey = await getSecretManager(`${process.env.SECRETMANAGER_PROJECT}${process.env.SECRETMANAGER_ID_AES_KEY}/versions/latest`);
    let dbPassword = await getSecretManager(`${process.env.SECRETMANAGER_PROJECT}${process.env.SECRETMANAGER_ID_DB_PASSWORD}/versions/latest`);
    let dbUsername = await getSecretManager(`${process.env.SECRETMANAGER_PROJECT}${process.env.SECRETMANAGER_ID_DB_USERNAME}/versions/latest`);
    let jwtSecret = await getSecretManager(`${process.env.SECRETMANAGER_PROJECT}${process.env.SECRETMANAGER_ID_JWT}/versions/latest`);

    global.aesIv = aesIv;
    global.aesKey = aesKey;
    global.dbPassword = dbPassword;
    global.dbUsername = dbUsername;
    global.jwtSecret = jwtSecret;

    console.log("secret manager fetch success");

    global.router = express.Router();
    global.knexDB = require("./knex/knexfile");

    app.use(compression());
    app.use(
      morgan(":method :url [:date[clf]] :status :res[content-length] - :response-time ms")
    );

    const allowedDomains = [
      process.env.CORS_ORIGIN_1,
      process.env.CORS_ORIGIN_2,
      process.env.CORS_ORIGIN_3,
      process.env.CORS_ORIGIN_4,
      process.env.CORS_ORIGIN_5
    ].filter(Boolean);

    const corsOptions = {
      origin: function (origin, callback) {
        if (!origin) return callback(null, true);

        if (allowedDomains.includes(origin)) {
          return callback(null, true);
        } else {
          return callback(new Error("Not allowed by CORS"));
        }
      },
      credentials: true
    };

    app.use(cors(corsOptions));

    app.use("/public", express.static("public"));

    app.use(
      bodyParser.urlencoded({
        limit: "50mb",
        extended: true
      })
    );
    app.use(
      bodyParser.json({
        limit: "50mb"
      })
    );

    app.get('/favicon.ico', (req, res) => res.status(204).end());

    app.use(
      session({
        secret: process.env.SESSION_SECRET || "super-secret",
        resave: false,
        saveUninitialized: false,
        cookie: {
          httpOnly: true,
          secure: false,
          maxAge: 24 * 60 * 60 * 1000
        }
      })
    );

    app.use(passport.initialize());
    app.use(passport.session());

    app.use(
      expressjwt({
        secret: global.jwtSecret,
        algorithms: ["HS256"],
        credentialsRequired: true,
        getToken: function (req) {
          if (
            req.headers.authorization &&
            req.headers.authorization.split(" ")[0] === "Bearer"
          ) {
            return req.headers.authorization.split(" ")[1];
          } else if (req.query && req.query.token) {
            return req.query.token;
          }
          return null;
        }
      }).unless({
        path: [
          "/",
          "/apitest",
          "/auth/login_bo_user",
          "/auth/login",
          "/auth/google",
          "/auth/google/login",
          "/auth/google/callback",
          "/auth/google/fail",
          "/auth/2fa/send-otp",
          "/auth/2fa/verify"
        ]
      })
    );

    app.get("/", function (req, res) {
      res.send(`listening port ${port}`);
    });

    app.post("/apitest", async function (req, res) {
      try {
        res.send({
          status_code: "200",
          status_phrase: "OK",
          service_tag: process.env.SERVICE_TAG,
          message: "API TEST SUCCESS"
        });
      } catch (error) {
        res.status(500).send({
          status_code: "500",
          status_phrase: "Internal Server Error",
          message: "Error fetching secret",
          error: error.message
        });
      }
    });

    app.use(require("./router"));

    const servers = app.listen(port, function (err) {
      cron.schedule("59 23 * * *", async function () {
        try {
          const { honnoi } = require("./knex/knexfile");
          const reset = await honnoi("partner_user")
            .where("loginErrCount", ">", 0)
            .orWhere("loginBlock", "1")
            .update({
              loginErrCount: 0,
              loginBlock: "0",
              updateDate: global.dayjs().format("YYYY-MM-DD HH:mm:ss")
            });
          console.log(`daily partner lockout reset: ${reset} row(s)`);
        } catch (error) {
          console.log("daily partner lockout reset failed:", error);
        }
      });

      if (err) {
        console.log("something went wrong", err);
      } else {
        console.log("Server is listening on port " + port);
      }
    });

    servers.setTimeout(parseInt(process.env.TIMEOUT));
    module.exports = app;

  } catch (error) {
    console.error("Error fetching secret:", error);
  }
})();
