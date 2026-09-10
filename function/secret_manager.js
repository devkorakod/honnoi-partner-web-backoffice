const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

const getSecretManager = async function (name) {
    const client = new SecretManagerServiceClient();
    const [version] = await client.accessSecretVersion({
        name: name,
    });
    const payload = version.payload.data.toString();
    return payload;
}

module.exports = getSecretManager
