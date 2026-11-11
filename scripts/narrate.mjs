import create from "@echogarden/espeak-ng-emscripten";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const scenes = JSON.parse(await readFile(process.argv[2], "utf8"));
const m = await create();
const worker = new m.eSpeakNGWorker();
worker.set_voice("en-us", 0);
worker.set_rate(200);
worker.set_pitch(46);
await mkdir("artifacts/audio", { recursive: true });
for (const [index, scene] of scenes.entries()) {
  const chunks = [];
  worker.synthesize(scene.narration, (audio) => {
    chunks.push(Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength));
    return false;
  });
  const pcm = Buffer.concat(chunks);
  const sampleRate = worker.get_samplerate();
  const header = Buffer.alloc(44);
  header.write("RIFF");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  await writeFile(`artifacts/audio/${index}.wav`, Buffer.concat([header, pcm]));
  scene.audioSeconds = pcm.length / sampleRate / 2;
  scene.duration = scene.audioSeconds + 2.5;
}
await writeFile(process.argv[2], JSON.stringify(scenes, null, 2));
console.log("Synthesized " + scenes.length + " English narration segments.");
