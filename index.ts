import "@whereby.com/assistant-sdk/polyfills";
import { Assistant, AudioSink, AudioSource } from "@whereby.com/assistant-sdk";
import type { RTCAudioData } from "@roamhq/wrtc/types/nonstandard.js";
import { Readable } from "stream";
import audioStreamer from "./streamer.js";
// @ts-expect-error
import VAD from "node-vad";
import { Wav } from "./Wav.js";

const STREAM_INPUT_SAMPLE_RATE_IN_HZ = 16000;
const STREAM_CHUNK_DURATION_IN_MS = 100;

const assistantKey = "{key}";

async function main() {
  const assistant = new Assistant({
    assistantKey,
    startCombinedAudioStream: true,
    startLocalMedia: true,
  });

  await assistant.joinRoom("{room}");
  assistant.startLocalMedia();

  const roomConnection = assistant.getRoomConnection();
  roomConnection.subscribeToConnectionStatus((status) => {
    if (status === "kicked") {
      console.log("Kicked from room");
      process.exit();
    }
  });

  const stream = assistant.getCombinedAudioStream();

  const audioTrack = stream?.getAudioTracks()[0];

  if (!audioTrack) {
    throw new Error("No track! :()");
  }

  const sendAudioSource = assistant.getLocalAudioSource();
  if (!sendAudioSource) {
    throw new Error("No send audio source");
  }

  const wav = new Wav("/opt/bosh.wav");

  const sink = new AudioSink(audioTrack);
  sink.subscribe(({ samples }: RTCAudioData) => {
    audioSource.push(samples);
  });
  const audioSource = new AudioSource();
  const chunkSize =
    (2 * STREAM_INPUT_SAMPLE_RATE_IN_HZ * STREAM_CHUNK_DURATION_IN_MS) / 1000;
  const smoothedInputSource = Readable.from(
    audioStreamer(audioSource, chunkSize),
    { objectMode: false },
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
      if (shouldBosh && speech.end && sendAudioSource && timeSinceBosh > 5000) {
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

main();
