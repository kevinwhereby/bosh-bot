// Async generator that takes any bursty input stream and creates a consistent chunk size output stream
export default async function* (streamSource, chunkSize) {
    let remainingChunk = Buffer.alloc(0);
    let payloadChunk;
    for await (payloadChunk of streamSource) {
        const currentChunk = Buffer.concat([remainingChunk, payloadChunk]);
        let i = 0;
        while (i < currentChunk.length) {
            const nextChunk = currentChunk.subarray(i, (i += chunkSize));
            if (nextChunk.length < chunkSize) {
                remainingChunk = nextChunk;
                break;
            }
            remainingChunk = Buffer.alloc(0);
            yield nextChunk;
        }
    }
}
