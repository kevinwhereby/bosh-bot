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
    if (status === "kicked") process.exit();
  });

  const stream = assistant.getCombinedAudioStream();
  const audioTrack = stream?.getAudioTracks()[0];
  if (!audioTrack) throw new Error("No track! :()");

  const sendAudioSource = assistant.getLocalAudioSource();
  if (!sendAudioSource) throw new Error("No send audio source");

  const wav = new Wav("/opt/bosh.wav");

  const sink = new AudioSink(audioTrack);
  const audioSource = new AudioSource();
  sink.subscribe(({ samples }: RTCAudioData) => audioSource.push(samples));

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

  let autoBosh = false;
  let lastBosh = Date.now() - 2000;

  const playBosh = () => {
    lastBosh = Date.now();
    for (const chunk of wav.stream(320)) {
      sendAudioSource.onData({
        samples: chunk,
        sampleRate: wav.sampleRate,
        bitsPerSample: wav.bitDepth,
        channelCount: 1,
      });
    }
  };

  // queue to handle multiple boshes
  let isPlayingQueue = false;
  let queuedBoshes = 0;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const enqueueBoshes = async (count: number) => {
    queuedBoshes += count;
    if (isPlayingQueue) return;
    isPlayingQueue = true;

    while (queuedBoshes > 0) {
      queuedBoshes--;
      playBosh();
      await sleep(200); // small pause between each bosh
    }

    isPlayingQueue = false;
  };

  void roomConnection.subscribeToChatMessages((messages) => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (!last) return;

    const text = (last.text ?? "").trim().toLowerCase();

    // "!bosh" or "!bosh 3"
    if (text.startsWith("!bosh")) {
      const parts = text.split(" ");
      const count = parseInt(parts[1] ?? "1", 10);
      const n = Number.isFinite(count) && count > 0 ? count : 1;

      enqueueBoshes(n);
      assistant.sendChatMessage(n === 1 ? "bosh" : `bosh x${n}`);
      return;
    }

    if (text === "!autobosh") {
      autoBosh = true;
      assistant.sendChatMessage("auto bosh enabled");
      return;
    }

    if (text === "!stopbosh" || text === "!nobosh") {
      autoBosh = false;
      assistant.sendChatMessage("auto bosh disabled");
      return;
    }
  });

  smoothedInputSource.pipe(vadStream).on(
    "data",
    ({ speech }: { speech: { end: boolean } }) => {
      const timeSinceBosh = Date.now() - lastBosh;
      if (autoBosh && speech.end && timeSinceBosh > 5000) {
        playBosh();
      }
    },
  );
}

main();
