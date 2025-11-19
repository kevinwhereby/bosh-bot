import "@whereby.com/assistant-sdk/polyfills";
import { Assistant } from "@whereby.com/assistant-sdk";
import { PassThrough, Readable } from "stream";
import audioStreamer from "./streamer.js";
// @ts-expect-error
import VAD from "node-vad";
import { Wav } from "./Wav.js";
import wavData from "./wavData.js";

const STREAM_INPUT_SAMPLE_RATE_IN_HZ = 16000;
const STREAM_CHUNK_DURATION_IN_MS = 100;
class AudioSource extends PassThrough {
  constructor() {
    super({
      allowHalfOpen: true,
      highWaterMark: 1 * 1024,
    });
  }
}
// const assistantKey =
// "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhc3Npc3RhbnRJZCI6IjZlNjAyMWUxLTA2YjUtNDQxMy05ODlkLWY2OWNiNDA1ZWNmNSIsImlzcyI6Imh0dHBzOi8vYWNjb3VudHMuc3J2LndoZXJlYnkuY29tIiwiaWF0IjoxNzU4ODA5ODE2LCJhc3Npc3RhbnRLZXlUeXBlIjoid2hlcmVieUFzc2lzdGFudCJ9.F3hxKQmfAQL6q6wwF6pwPWmLS6BCgKWibN_7xt3kOLY";
// const roomUrl =     "https://funtimes.whereby.com/verbatim-transcription-z3hg9z"

export class BoshBot {
  constructor() {}
  async start({
    roomUrl,
    assistantKey,
  }: {
    roomUrl: string;
    assistantKey: string;
  }) {
    const assistant = new Assistant({
      assistantKey,
    });

    await assistant.joinRoom(roomUrl);

    const roomConnection = assistant.getRoomConnection();
    roomConnection.subscribeToConnectionStatus((status) => {
      if (status === "kicked") {
        console.log("Kicked from room");
        process.exit();
      }
    });

    const { audioSource: sendAudioSource } = await assistant.startLocalMedia({
      audio: true,
      video: false,
    });
    if (!sendAudioSource) {
      throw new Error("No send audio source");
    }

    const sink = assistant.getCombinedAudioSink();
    if (!sink) {
      throw new Error("No combined audio sink");
    }

    const receiveAudioSource = new AudioSource();
    sink.subscribe(({ samples }) => receiveAudioSource.push(samples));

    const data = Buffer.from(wavData, "base64");
    const wav = new Wav(data);

    const chunkSize =
      (2 * STREAM_INPUT_SAMPLE_RATE_IN_HZ * STREAM_CHUNK_DURATION_IN_MS) / 1000;
    const smoothedInputSource = Readable.from(
      audioStreamer(receiveAudioSource, chunkSize),
      {
        objectMode: false,
      },
    );

    const vadStream = VAD.createStream({
      mode: VAD.Mode.Normal,
      audioFrequency: 16000,
      debounceTime: 500,
    });

    let shouldBosh = false;
    let lastBosh = Date.now() - 2000; // give it a couple of seconds or it boshes immediately

    smoothedInputSource.pipe(vadStream).on(
      "data",
      ({
        speech,
      }: {
        time: number;
        audioData: Buffer;
        speech: {
          state: boolean;
          start: boolean;
          end: boolean;
          startTime: 0;
          duration: 0;
        };
      }) => {
        if (speech.start) {
          shouldBosh = true;
        }
        const timeSinceBosh = Date.now() - lastBosh;
        if (
          shouldBosh &&
          speech.end &&
          sendAudioSource &&
          timeSinceBosh > 5000
        ) {
          console.log("BOSH!");

          lastBosh = Date.now();
          shouldBosh = false;

          for (let chunk of wav.stream(320)) {
            sendAudioSource.onData({
              samples: chunk,
              sampleRate: wav.sampleRate,
              bitsPerSample: wav.bitDepth,
              channelCount: 1,
            });
          }
        }
      },
    );
  }
}
