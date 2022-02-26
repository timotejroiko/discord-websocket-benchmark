# Discord Websocket Benchmarks

This test attempts to benchmark and compare low level websocket performance in various Discord libraries for nodejs.

The goal is to measure the time taken for packets to go from a raw TCP stream to being emitted by each library's `raw` event, which includes websocket decoding, json/etf parsing and zlib inflating.

## Methodology

Correctly benchmarking this is not an easy task, measurements are often biased and inconsistent due to network delays, packet size differences, TCP chunking and other factors.

To circumvent these issues and achieve fair measurement, this test is essentially a local replay attack. We first capture naturally occuring TCP packets during a regular connection, then we create a blank connection and inject the captured packets into the stream all at once, which removes inconsistencies and provides a fair and natural measurement.

### Gathering

The first step is to record raw TCP packets from a normal websocket connection to Discord.

This was done by modifying the `ws` library as per [Addendum 1](#addendum-1) and then running the script `gather-data.js`, which creates a json file containing all the raw TCP packets received during the duration of the script.

### Injection

The second step is to inject the captured TCP packets into the stream to simulate receiving them naturally but without the usual inconsistencies and delays.

This was done by modifying the `ws` and `tiny-discord` library as per [Addendum 2](#addendum-2) and then running the script `discord-socket-test.js` to inject and benchmark the previously recorded data packets.

## Results

The following results were obtained from injecting 2450 captured GUILD_CREATE events and 5000 captured MESSAGE_CREATE events, both captured separately for each different encoding and compression configurations, running on node.js v17.2.0 on an Intel(R) Core(TM) i5-7300HQ CPU @ 2.50GHz.

The following results show the average number of packets per second that each library can process on a given configuration.

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

Results for extended mode, which tested 24k guilds and 50k messages by repeating previous packets 10 times, which enables futher v8 optimizations to kick in. zlib cannot be tested like this beause of its sequential nature but any performance differences should translate to it the same way.

|test/lib|discord.js|eris|detritus|tiny-discord|
|-|-|-|-|-|
|guilds ext json|1338|1581|683|3431|
|guilds ext etf|716|822|501|2299|
|messages ext json|58887|55622|12069|83925|
|messages ext etf|24066|24025|10116|50590|

Bonus: tech used by each library's internals:

|tech/lib|discord.js|eris|detritus|tiny-discord|
|-|-|-|-|-|
|websocket|ws|ws|ws|custom (node:https)|
|etf|erlpack|erlpack|erlpack|custom (pure js)|
|zlib|zlib-sync|zlib-sync|node:zlib (async)|node:zlib (sync)|

Bonus: total data size of 2450 GUILD_CREATE events and 5000 MESSAGE_CREATE events for each configuration as sent by discord.

|config|guilds|messages|
|-|-|-|
|json|218 MB|22 MB|
|etf|203 MB|21 MB|
|json+zlib|35 MB|6 MB|
|etf+zlib|33 MB|5 MB|

## Findings

This benchmark was made initially to test my library `tiny-discord` against the other major players in the field, but it also demonstrates how much overhead can exist in standarized libraries that are used everywhere today such as `ws`.

Native packages such as `discord/erlpack` are not always faster than pure js alternatives. During isolated testing, `tiny-discord`'s pure js unpacker consistently outperformed discord's native erlpack library.

`detritus` was surprisingly underwhelming in this test. Part of it can be attributed to its usage of asynchronous zlib, however the primary reasons remain to be investigated.

Both optional `ws` extensions are installed in this test. removing `bufferutil` made virtually no difference, removing `utf-8-validate` reduced performance by 2-3%.

## Closing

This benchmark took a long time to get working correctly due to how complex it is but it was quite a fun ride.

A possible improvement would be to create a local websocket server instead of using a live discord connection as a dummy but i was too lazy to do that.

As usual try running the tests yourself, im open to peer reviews, suggestions, improvements, contributions, etc...

## Addendum 1

Modifications to the `ws` library in order to capture discord TCP stream data.

```diff
// ws/lib/websocket.js:1237
function socketOnData(chunk) {
+ if (global.gather) { global.array.push([...chunk]); }
  ...
}
```

## Addendum 2

Modifications to the `ws` and `tiny-discord` libraries in order to enable data injection without interference from a live connection.

```diff
// ws/lib/websocket.js:438
send(data, options, cb) {
+ if(global.begin) { return; }
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
