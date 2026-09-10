require("dotenv").config()
let IsProd = process.env.NODE_ENV === "production" ? true : false
console.log(`The app is running on : ${process.env.NODE_ENV === "production" ? "product" : "development"} mode.`)
const knex = require('knex')
module.exports = {

    honnoi: knex({
        client: 'mysql',
        connection: {
            host: IsProd ? process.env.PROD_MYSQL_HOST : process.env.DEV_MYSQL_HOST,
            user: IsProd ? global.dbUsername : global.dbUsername,
            port: IsProd ? parseInt(process.env.PROD_MYSQL_PORT) : parseInt(process.env.DEV_MYSQL_PORT),
            password: IsProd ? global.dbPassword : global.dbPassword,
            database: IsProd ? process.env.PROD_MYSQL_DATABASE_HONNOI : process.env.DEV_MYSQL_DATABASE_HONNOI,
            charset: 'utf8mb4'
        },
        pool: { min: 0, max: 80, idleTimeoutMillis: 10000, propagateCreateError: false },
        acquireConnectionTimeout: 30000
    })

}
