const token = "BOT TOKEN";
const type = "messages"; // guilds | messages
const encoding = "etf"; // json | etf
const zlib = true; // true | false

// ######################################################################################
// ######################################################################################
// ######################################################################################

const Djs = require("discord.js");
const fs = require("fs");
global.gather = true;
global.array = [];

try {
    require("zlib-sync");
    if(!zlib) {
        console.log("this test requires removing zlib-sync");
        process.exit();
    }
} catch(e) {
    if(zlib) {
        console.log("this test requires installing zlib-sync");
        process.exit();
    }
}

try {
    require("erlpack");
    if(encoding !== "etf") {
        console.log("this test requires removing erlpack");
        process.exit();
    }
} catch(e) {
    if(encoding === "etf") {
        console.log("this test requires installing discord/erlpack");
        process.exit();
    }
}

const client = new Djs.Client({intents: type === "guilds" ? 1 : 512, shards: [2], shardCount: 4});

let count = 0;
client.on("raw", () => {
    if(++count === 10000) {
        end();
    }
})

client.on("ready", () => {
    if(type === "guilds") {
        end();
    }
    client.ws.shards.first().on("close", () => {
        end();
    });
});

client.login(token);

function end() {
    fs.writeFileSync(`./${type}${encoding === "etf" ? "-etf" : ""}${zlib ? "-zlib" : ""}.json`, JSON.stringify({count, data: global.array}));
    process.exit();
}

setInterval(() => console.log(`captured ${global.array.length} stream packets for ${count} events`), 10000);
