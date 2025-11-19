export class Wav {
    header;
    sampleRate;
    bitDepth;
    audioData;
    constructor(data) {
        const header = Wav.parseHeader(data);
        if (header.bitDepth !== 16) {
            throw new Error(`Expected 16-bit audio, got ${header.bitDepth}-bit`);
        }
        if (header.sampleRate !== 16000) {
            throw new Error(`Expected 16kHz sample rate, got ${header.sampleRate}Hz`);
        }
        this.header = header;
        this.bitDepth = header.bitDepth;
        this.sampleRate = header.sampleRate;
        const audioBuffer = data.subarray(header.dataOffset, header.dataOffset + header.dataSize);
        this.audioData = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.length / 2);
    }
    static parseHeader(buffer) {
        if (buffer.toString("ascii", 0, 4) !== "RIFF") {
            throw new Error("Invalid WAV file: Missing RIFF header");
        }
        if (buffer.toString("ascii", 8, 12) !== "WAVE") {
            throw new Error("Invalid WAV file: Not a WAVE file");
        }
        let offset = 12;
        while (offset < buffer.length) {
            const chunkId = buffer.toString("ascii", offset, offset + 4);
            const chunkSize = buffer.readUInt32LE(offset + 4);
            if (chunkId === "fmt ") {
                const audioFormat = buffer.readUInt16LE(offset + 8);
                if (audioFormat !== 1) {
                    throw new Error("Only PCM format is supported");
                }
                const channels = buffer.readUInt16LE(offset + 10);
                const sampleRate = buffer.readUInt32LE(offset + 12);
                const bitDepth = buffer.readUInt16LE(offset + 22);
                // Find data chunk
                let dataOffset = offset + 8 + chunkSize;
                while (dataOffset < buffer.length) {
                    const dataChunkId = buffer.toString("ascii", dataOffset, dataOffset + 4);
                    const dataSize = buffer.readUInt32LE(dataOffset + 4);
                    if (dataChunkId === "data") {
                        return {
                            sampleRate,
                            bitDepth,
                            channels,
                            dataOffset: dataOffset + 8,
                            dataSize,
                        };
                    }
                    dataOffset += 8 + dataSize;
                }
                throw new Error("Data chunk not found");
            }
            offset += 8 + chunkSize;
        }
        throw new Error("Format chunk not found");
    }
    *stream(chunkSize) {
        let chunkIndex = 0;
        const samplesPerChunk = chunkSize / (this.bitDepth / 8);
        for (let i = 0; i < this.audioData.length; i += samplesPerChunk) {
            const end = Math.min(i + samplesPerChunk, this.audioData.length);
            const chunk = this.audioData.slice(i, end);
            if (chunk.length === samplesPerChunk) {
                yield chunk;
                chunkIndex++;
            }
            else {
                const paddedChunk = new Int16Array(samplesPerChunk);
                paddedChunk.set(chunk, 0);
                yield paddedChunk;
            }
        }
    }
}
