// Narration with Kokoro-82M (Apache-2.0). Each line in vo.json may set its own voice and speed.
// usage: node tts.mjs vo.json vo [defaultVoice] [defaultSpeed]
import {KokoroTTS} from 'kokoro-js';
import fs from 'fs';
const [,, voFile, outDir, voice = 'af_heart', speed = '1'] = process.argv;
const lines = JSON.parse(fs.readFileSync(voFile, 'utf8'));
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {dtype: 'q8', device: 'cpu'});
for (const l of lines) {
  const a = await tts.generate(l.text, {voice: l.voice ?? voice, speed: l.speed ?? +speed});
  await a.save(`${outDir}/${l.id}.wav`);
  console.log(l.id, l.voice ?? voice, (a.audio.length / a.sampling_rate).toFixed(2));
}
