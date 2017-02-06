const net = require('net');
const os = require('os');

const debug = require('debug')('bctl:native-protocol');

const readUInt32NE = `readUInt32${os.endianness()}`;
const writeUInt32NE = `writeUInt32${os.endianness()}`;

/**
 * "Promisified" net.Socket object + simple implementation of native messaging protocol:
 *  https://developer.chrome.com/extensions/nativeMessaging#native-messaging-host-protocol
 */
module.exports = function(stream) {
    this._stream = stream || new net.Socket();

    /**
     * Connect to Unix socket at path
     * Returns a promise
     */
    this.connect = path => {
        return new Promise((done, reject) => {
            const connectListener = () => {
                this._stream.removeListener('connect', connectListener);
                this._stream.removeListener('error', errorListener);
                debug(`connected to ${path}`);
                done();
            };

            const errorListener = e => {
                this._stream.removeListener('connect', connectListener);
                this._stream.removeListener('error', errorListener);
                debug(`cannot connect to ${path}: ${e}`);
                reject(e);
            };

            this._stream.on('connect', connectListener);
            this._stream.on('error', errorListener);
            this._stream.connect(path);
        });
    };

    /**
     * read exactly size bytes from stream, or null if stream is closed.
     * Returns a promise
     */
    this.read = size => {
        return new Promise((done, reject) => {
            if(!this._stream.readable) {
                debug('reading from closed stream');
                done(null);
            } else {
                const errorListener = e => {
                    this._stream.removeListener('readable', doRead);
                    this._stream.removeListener('error', errorListener);
                    debug(`error reading from stream: ${e}`);
                    reject(e);
                };

                const doRead = () => {
                    let data = this._stream.read(size);
                    if(data != null) {
                        this._stream.removeListener('readable', doRead);
                        this._stream.removeListener('error', errorListener);
                        if(data.length < size) {
                            debug(`got ${data.length} bytes, expected ${size}`);
                            reject(new Error('unexpected EOF'));
                        } else {
                            debug(`got expected ${data.length} bytes`);
                            done(data);
                        }
                        return true;
                    }
                    return false;
                };

                if(!doRead()) {
                    this._stream.on('error', errorListener);
                    this._stream.on('readable', doRead);
                }
            }
        });
    };

    /**
     * Read a message of native messaging protocol, returns a promise
     * that resolve as an object
     */
    this.readMessage = () => {
        return this.read(4).
            then(sizeBuf => this.read(sizeBuf[readUInt32NE]()))
            .then(messageBuf => { debug(`Got message: ${messageBuf.toString()}`); return messageBuf; })
            .then(messageBuf => JSON.parse(messageBuf.toString()));
    };

    this.onMessage = (callback, errback) => {
        const readableListener = () => {
            this._stream.removeListener('readable', readableListener);
            this.readMessage().then(message => {
                callback(message);
                this._stream.on('readable', readableListener);
            })
            .catch(err => {
                errback(err);
                this._stream.on('readable', readableListener);
            });
        };

        this._stream.on('readable', readableListener);
    };

    /**
     * Write buffer or string to the stream ; returns a promise
     */
    this.write = data => {
        return new Promise((done, reject) => {
            const errorListener = e => {
                this._stream.removeListener('error', errorListener);
                reject(e);
            };

            this._stream.write(data, 'utf8', () => {
                this._stream.removeListener('error', errorListener);
                done();
            });
        });
    };

    /**
     * Write a message of native messaging protocol ; returns a promise
     * that resolves once the write is done.
     */
    this.writeMessage = message => {
        let messageBuf = new Buffer(JSON.stringify(message));
        let sizeBuf = new Buffer([0,0,0,0]);
        sizeBuf[writeUInt32NE](messageBuf.length);
        return this.write(sizeBuf).then(() => this.write(messageBuf));
    };

    /**
     * Closes the stream ; returns nothing.
     */
    this.end = () => this._stream.end();
};
