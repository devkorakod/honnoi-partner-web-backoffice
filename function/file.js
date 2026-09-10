const { Storage } = require("@google-cloud/storage")
const { format } = require("util")
const crypto = require("crypto")
const storage = new Storage({})
const bucket = storage.bucket(process.env.GCS_BUCKET_NAME)

const BANK_FOLDER_BY_TYPE = {
    partner_user: process.env.GCS_FOLDER_PARTNER_PROFILE,
}

const uploadProfileImage = async (data) => {
    return new Promise(async (resolve) => {
        try {
            let pathfile = data.pathfile
            let folder = BANK_FOLDER_BY_TYPE[data.type]

            const match = /^data:image\/(\w+);base64,(.+)$/.exec(data.image || '')
            if (!match) {
                return resolve({
                    "status_code": "301",
                    "status_phrase": "FAIL",
                    "message": "image must be a base64 data url"
                })
            }
            const mimeType = match[1]
            const ext = mimeType === 'jpeg' ? 'jpg' : mimeType
            const buffer = Buffer.from(match[2], 'base64')
            const originalname = `${data.originalname}_${crypto.randomUUID()}.${ext}`

            var blob = bucket.file(`${folder}/${pathfile}/profile/${originalname}`)
            const blobStream = blob.createWriteStream({
                resumable: false,
                contentType: `image/${mimeType}`,
            })
            blobStream.on("error", (err) => {
                console.log({ message: err.message })
                return resolve({
                    "status_code": "301",
                    "status_phrase": "FAIL",
                    "message": err.message
                })
            })
            blobStream.on("finish", async () => {
                const publicUrl = format(
                    `https://storage.googleapis.com/${bucket.name}/${blob.name}`
                )
                return resolve({
                    message: "Uploaded the file successfully: " + originalname,
                    url: publicUrl,
                })
            })
            blobStream.end(buffer)
        } catch (error) {
            console.log(error)
            return resolve({
                "status_code": "301",
                "status_phrase": "FAIL",
                "message": `Correct Data Error!!`,
                "sqlmessage": error.sqlMessage
            })
        }
    })
}

const deleteProfileImage = async (data) => {
    try {
        const { url, pathfile, type } = data || {}
        if (!url || !pathfile || !type) return false

        const folder = BANK_FOLDER_BY_TYPE[type]
        if (!folder) return false

        // only ever delete a file that lives inside this exact record's own
        // profile folder, so a bad/foreign url can never trigger a delete
        const expectedPrefix = `https://storage.googleapis.com/${bucket.name}/${folder}/${pathfile}/profile/`
        if (!String(url).startsWith(expectedPrefix)) {
            console.log('skip deleteProfileImage: url outside expected path =>', url)
            return false
        }

        const filename = String(url).replace(`https://storage.googleapis.com/${bucket.name}/`, '')
        const blob = bucket.file(filename)
        const [exists] = await blob.exists()
        if (!exists) return false

        await blob.delete()
        return true
    } catch (error) {
        console.log('deleteProfileImage error =>', error)
        return false
    }
}

module.exports = { uploadProfileImage, deleteProfileImage }
