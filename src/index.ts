import uuid from "uuid/v4";

function encode<T>(data: T): Uint16Array {
    const str = JSON.stringify(data);
    const buf = new ArrayBuffer(str.length * 2);
    const bufView = new Uint16Array(buf);
    bufView.set(str.split("").map((_, i) => str.charCodeAt(i)));
    return bufView;
}

function decode<T = unknown>(buf: ArrayBufferLike): T {
    return JSON.parse(
        String.fromCharCode.apply(
            null,
            (new Uint16Array(buf) as unknown) as number[]
        )
    );
}


export class WorkerEmitter {
    worker: Worker;
    private messageMap: Map<
        string,
        { callback: Function; type: string | number }
        > = new Map();
    constructor(handler: Function) {
        const _fn = `const _fn = ${handler.toString()};`;
        const _encode = `const _encode = ${encode.toString()}`;
        const _decode = `const _decode = ${decode.toString()}`;
        const _handle = ` onmessage =  async (e: MessageEvent) => {
            const { data } = e;
            if (!data) return;
    
            const { type, id, message } = _decode(data);
    
            const result = (await _fn(message)) || "done";
            const data = _encode({ id, type, message: result });
            postMessage(data.buffer, [data.buffer]);
        }`;

        const blob = new Blob([_fn + _encode + _decode + _handle], { type: 'text/javascript' });
        this.worker = new Worker(URL.createObjectURL(blob));
        this.worker.onmessage = e => {
            const { data } = e;
            if (!data) return;

            const { id, message } = decode(data);
            const ret = this.messageMap.get(id);
            if (!ret) return;

            const { type, callback } = ret;

            callback({ type, message });
            this.messageMap.delete(id);
        };
    }

    emit<T, U>(type: string | number, message: T): Promise<U> {
        return new Promise(resolve => {
            const id = uuid();
            const data = encode({
                id,
                type,
                message
            });
            this.messageMap.set(id, {
                type,
                callback: (x: U) => {
                    resolve(x);
                }
            });
            this.worker.postMessage(data.buffer, [data.buffer]);
        });
    }

    terminate() {
        this.worker.terminate();
    }
}