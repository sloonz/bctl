const nativeHost = require('./lib/native-host');
const client = require('./lib/client');

if(nativeHost.isNativeHost()) {
    // If we are a native host (= launched by the browser using connectNative()),
    // process browser commands
    nativeHost.run();
} else {
    nativeHost.register();
    client.main();
}
