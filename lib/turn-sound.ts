// The click a player hears when their action is taken. It is made with Web
// Audio rather than an audio file: nothing to download, and it plays without
// the delay audio files have on iPhones. iPhones mute it with the silent switch.

export type TurnSound = "tap" | "chips";

let context: AudioContext | null = null;
let noise: AudioBuffer | null = null;

/** Plays the click; call it from a tap, or browsers keep audio blocked. */
export function playTurnSound(sound: TurnSound) {
  try {
    const AudioContextClass =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;
    context ??= new AudioContextClass();
    // Phones suspend audio when the page was in the background.
    if (context.state !== "running") void context.resume();
    const start = context.currentTime + 0.005;
    if (sound === "chips") {
      // Two chips landing: a bet, call or all-in.
      click(context, start, 3400, 0.5);
      click(context, start + 0.055, 4300, 0.35);
    } else {
      // A softer, lower knock: a check or fold.
      click(context, start, 1800, 0.45);
    }
  } catch {
    // Sound is a nicety; the action has already been taken.
  }
}

function click(audio: AudioContext, at: number, pitch: number, volume: number) {
  if (!noise || noise.sampleRate !== audio.sampleRate) {
    // 30 ms of noise that dies away quickly, filtered into a click below.
    const length = Math.round(audio.sampleRate * 0.03);
    noise = audio.createBuffer(1, length, audio.sampleRate);
    const samples = noise.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      samples[index] = (Math.random() * 2 - 1) * (1 - index / length) ** 4;
    }
  }
  const source = audio.createBufferSource();
  source.buffer = noise;
  const filter = audio.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = pitch;
  filter.Q.value = 1.4;
  const gain = audio.createGain();
  gain.gain.value = volume;
  source.connect(filter).connect(gain).connect(audio.destination);
  source.start(at);
}
