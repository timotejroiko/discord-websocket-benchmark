const token = "BOT TOKEN";

const type = "messages"; // guilds | messages
const encoding = "etf"; // json | etf
const zlib = true; // true | false
const lib = "djs"; // djs | eris | detritus | tiny
const extended = false; // extended test, emit 10x more events, incompatible with zlib

// ###########################################################
// ###########################################################
// ###########################################################

const Djs = require("discord.js");
const Eris = require("eris");
const Detritus = require("detritus-client");
const Tiny = require("tiny-discord");
const fs = require("fs");

const testData = require(`./${type}${encoding === "etf" ? "-etf" : ""}${zlib ? "-zlib" : ""}.json`);
if(extended) {
    testData.data = testData.data.slice(1);
    testData.count -= 1;
    const d = [...testData.data];
    for(let i = 0; i < 9; i++) {
        testData.data.push(...d);
    }
    testData.count *= 10;
    if(testData.count > 50000) { testData.count = 50000; } // make sure all files are limited to the same number of events for fair comparison
} else {
    if(testData.count > 5000) { testData.count = 5000; } // make sure all files are limited to the same number of events for fair comparison
}
if(zlib) {
    testData.count -=2; // some packets rely on future data that was not captured
}
const mapped = testData.data.map(x => Buffer.from(x));
let time;
let count = 0;

try {
    require("zlib-sync");
    if(!zlib && (lib === "djs" || lib === "eris")) {
        console.log("this test requires removing zlib-sync");
        process.exit();
    }
} catch(e) {
    if(zlib && (lib === "djs" || lib === "eris")) {
        console.log("this test requires installing zlib-sync");
        process.exit();
    }
}

try {
    require("erlpack");
    if(lib !== "tiny" && encoding !== "etf") {
        console.log("this test requires removing erlpack");
        process.exit();
    }
} catch(e) {
    if(lib !== "tiny" && encoding === "etf") {
        console.log("this test requires installing discord/erlpack");
        process.exit();
    }
}

console.log(`TESTING type=${type} lib=${lib} zlib=${zlib} encoding=${encoding}`);

switch(lib) {
    case "djs": return testDjs();
    case "eris": return testEris();
    case "detritus": return testDetritus();
    case "tiny": return testTiny();
}

function end() {
    const result = performance.now() - time;
    console.log(result, "MS");
    console.log(count / result * 1000, "OP/s");
    process.exit();
}

function testDjs() {
    const client = new Djs.Client({intents: 0, shards: [0], shardCount: 10});
    global.begin = () => {
        console.log("begin test");
        console.log(`processing ${testData.count} events`);
        time = performance.now();
        for(let i = 0; i < mapped.length; i++) {
            client.ws.shards.first().connection._socket.push(mapped[i]);
        }
    }
    client.on("raw", r => {
        if(++count === testData.count) {
            end();
        }
    });
    client.login(token);
}

function testEris() {
    const client = new Eris.Client(token, {intents:0, maxShards: 10, firstShardID: 0, lastShardID: 1, compress: zlib});
    global.begin = () => {
        console.log("begin test");
        console.log(`processing ${testData.count} events`);
        time = performance.now();
        for(let i = 0; i < mapped.length; i++) {
            client.shards.get(0).ws._socket.push(mapped[i]);
        }
    }
    client.on("rawWS", () => {
        if(++count === testData.count) {
            end();
        }
    })
    client.connect();
}

function testDetritus() {
    const client = new Detritus.ShardClient(token, {gateway:{intents:0, compress: zlib, encoding, shardId: 0, shardCount: 10}});
    global.begin = () => {
        console.log("begin test");
        console.log(`processing ${testData.count} events`);
        time = performance.now();
        for(let i = 0; i < mapped.length; i++) {
            client.gateway.socket.socket._socket.push(mapped[i]);
        }
    }
    client.on("raw", r => {
        if(++count === testData.count) {
            end();
        }
    })
    client.run();
}

function testTiny() {
    const client = new Tiny.InternalSharder({total: 10, ids:[0], options:{token, intents:0, compression: zlib ? 2 : 0, encoding}});
    count = 2; // HELLO and READY are not emitted by "event"
    global.begin = () => {
        console.log("begin test");
        console.log(`processing ${testData.count} events`);
        time = performance.now();
        for(let i = 0; i < mapped.length; i++) {
            client.shards.get(0)._socket.push(mapped[i]);
        }
    }
    client.on("event", r => {
        if(++count === testData.count) {
            end();
        }
    })
    client.connect();
}
