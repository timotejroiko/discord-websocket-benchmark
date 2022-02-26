# Discord Websocket Benchmarks

This test attempts to benchmark and compare low level websocket performance in various Discord libraries for nodejs.

The goal is to measure the time taken for packets to go from a raw TCP stream to being emitted by each library's `raw` event, which includes websocket decoding, json/etf parsing and zlib inflating. This test benchmarks a single websocket connection, aka a single shard.

## Methodology

Correctly benchmarking this is not an easy task, measurements are often biased and inconsistent due to network delays, packet size differences, TCP chunking and other factors.

To circumvent these issues and achieve fair measurement, this test is essentially a local replay attack. We first capture naturally occuring TCP packets during a regular connection, then we create a blank connection and inject the captured packets into the stream all at once, which removes inconsistencies and provides a fair and natural measurement.

### Gathering

The first step is to record raw TCP packets from a normal websocket connection to Discord.

This was done by modifying the `ws` library as per [Addendum 1](#addendum-1) and then running the script `gather-data.js`, which creates a json file containing all the raw TCP packets received during the duration of the script.

### Injection

The second step is to inject the captured TCP packets into the stream to simulate receiving them naturally but without the usual inconsistencies and delays.

This was done by modifying the `ws` and `tiny-discord` libraries as per [Addendum 2](#addendum-2) and then running the script `discord-socket-test.js` to inject and benchmark the previously recorded data packets.

## Results

The following results were obtained from injecting 2450 captured GUILD_CREATE events and 5000 captured MESSAGE_CREATE events, both captured separately for each different encoding and compression configurations, running on node.js v17.2.0 on an Intel(R) Core(TM) i5-7300HQ CPU @ 2.50GHz.

The following results show the average number of packets per second that each library can process on a given configuration on a single shard. This test is unfair in favor of `tiny-discord` because it does little to no additional data processing but it shows the differences in data processing performance between the other major libraries.

|test/lib|discord.js|eris|detritus|tiny-discord|
|-|-|-|-|-|
|guilds json|976|1346|803|2479|
|guilds json+zlib|949|1403|716|2601|
|guilds etf|681|705|500|2147|
|guilds etf+zlib|602|808|514|1943|
|messages json|29482|31759|8081|56917|
|messages json zlib|25986|22898|5271|39353|
|messages etf|17684|18003|7505|30621|
|messages etf zlib|15562|14559|4005|26631|

The following shows the same but with data processing completely disabled as per [Addendum 3](#addendum-3), focusing purely on websocket.

|test/lib|discord.js|eris|detritus|tiny-discord|
|-|-|-|-|-|
|guilds json|2266|2273|2056|2479|
|guilds json+zlib|2580|2411|1707|2601|
|guilds etf|976|998|891|2147|
|guilds etf+zlib|1088|1071|891|1943|
|messages json|45729|43737|21153|56917|
|messages json zlib|39616|32470|11788|39753|
|messages etf|22944|21989|16574|31864|
|messages etf zlib|18007|16695|8362|26631|

Bonus: tech used by each library's internals:

|tech/lib|discord.js|eris|detritus|tiny-discord|
|-|-|-|-|-|
|websocket|ws|ws|ws|custom (node:https)|
|etf|erlpack|erlpack|erlpack|custom (pure js)|
|zlib|zlib-sync|zlib-sync|node:zlib (async)|node:zlib (sync)|

## Notes and Findings

This benchmark was made initially to test my library `tiny-discord` against the other major players in the field, but it also demonstrates how much overhead can exist in data processing when creating each library's structures.

Native packages such as `discord/erlpack` are not always faster than pure js alternatives. During isolated testing, `tiny-discord`'s pure js unpacker consistently outperformed discord's native erlpack library.

`detritus` was surprisingly underwhelming in this test. Part of it can be attributed to its usage of asynchronous zlib, however more needs to be investigated.

Both optional `ws` extensions are installed in this test. removing `bufferutil` made virtually no difference, removing `utf-8-validate` reduced performance by 2-3%.

`erlpack` for some reason wont be removed from node_modules when uninstalled, so you have to manually delete it from there before you will be able to test json again in libraries that pick it up automatically like `discord.js` and `eris`.

`ws` modifications must check each library for the existence of a custom `ws` version inside its own node_modules folder, and either modify that version, or delete it so the root version will be picked up correctly. In this test, `detritus-client-socket` insisted in having its own `ws` instead of the root one, which i had to manually remove after every `npm` command.

## Closing

This benchmark took a long time to get working correctly due to how complex it is but it was quite a fun ride.

For a long time i believed that `ws` was slow but it turns out it was not the culprit. `ws` is more than fast enough, provided you dont use its built-in per-message deflate which thankfully discord does not use.

A possible improvement would be to create a local websocket server instead of using a live discord connection as a dummy but i was too lazy to do that.

As usual try running the tests yourself, im open to peer reviews, suggestions, improvements, contributions, etc...

## Addendum 1

Modifications to the `ws` library in order to capture discord TCP stream data.

```diff
// ws/lib/websocket.js:1237
function socketOnData(chunk) {
+   if (global.gather) { global.array.push([...chunk]); }
    ...
}
```

## Addendum 2

Modifications to the `ws` and `tiny-discord` libraries in order to enable data injection without interference from a live connection.

```diff
// ws/lib/websocket.js:438
send(data, options, cb) {
+   if(global.begin) { return; }
    ...
}
```

```diff
// ws/lib/websocket.js:1137
function receiverOnMessage(data, isBinary) {
+ if(typeof global.begin === "function") {
+   const b = global.begin;
+   global.begin = true;
+   setImmediate(b);
+   return;
+ }
  ...
}
```

```diff
// tiny-discord/src/WebsocketShard.js:256
_write(packet, opcode) {
+   if(global.begin) { return; }
    ...
}
```

```diff
// tiny-discord/src/WebsocketShard.js:339
_processFrame(opcode, message) {
+   if(typeof global.begin === "function") {
+       const b = global.begin;
+       global.begin = true;
+       setImmediate(b);
+       return;
+   }
    ...
}
```

## Addendum 3

Modifications to all libraries to disable any further data processing beyond the raw event.

```diff
// discord.js/src/client/websocket/WebSocketShard.js:278
onMessage({ data }) {
    let raw;
    if (data instanceof ArrayBuffer) data = new Uint8Array(data);
    if (zlib) {
      const l = data.length;
      const flush =
        l >= 4 && data[l - 4] === 0x00 && data[l - 3] === 0x00 && data[l - 2] === 0xff && data[l - 1] === 0xff;

      this.inflate.push(data, flush && zlib.Z_SYNC_FLUSH);
      if (!flush) return;
      raw = this.inflate.result;
    } else {
      raw = data;
    }
    let packet;
    try {
      packet = WebSocket.unpack(raw);
    } catch (err) {
      this.manager.client.emit(Events.SHARD_ERROR, err, this.id);
      return;
    }
    this.manager.client.emit(Events.RAW, packet, this.id);
+   return;
    ...
}
```

```diff
// eris/lib/gateway/Shard.js:375
onPacket(packet) {
    if(this.listeners("rawWS").length > 0 || this.client.listeners("rawWS").length) {
        /**
        * Fired when the shard receives a websocket packet
        * @event Client#rawWS
        * @prop {Object} packet The packet
        * @prop {Number} id The ID of the shard
        */
        this.emit("rawWS", packet, this.id);
    }
+   return;
    ...
}
```

```diff
// detritus-client/lib/gateway/handler.js:47
onPacket(packet) {
    if (packet.op !== constants_1.GatewayOpCodes.DISPATCH) {
        return;
    }
    const { d: data, t: name } = packet;
    if (this.client.hasEventListener(constants_1.ClientEvents.RAW)) {
        this.client.emit(constants_1.ClientEvents.RAW, packet);
    }
+   return;
    ...
}
```
