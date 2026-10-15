/**
 * The game's two sounds, made with the Web Audio API so there are no files
 * to load: the pop of a racquet meeting a dead ball, and the 1600h siren.
 * Sound can be switched off; the choice is remembered on this browser.
 */

export type SoundName = 'pop' | 'siren';

const KEY = 'eschaton-sound';
let context: AudioContext | undefined;
let on = readSetting();
const listeners = new Set<(on: boolean) => void>();

function readSetting(): boolean {
  try {
    return globalThis.localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function soundOn(): boolean {
  return on;
}

export function setSound(value: boolean): void {
  on = value;
  try {
    globalThis.localStorage.setItem(KEY, value ? 'on' : 'off');
  } catch {
    // Private windows may refuse; the setting just lasts for this visit.
  }
  for (const fn of listeners) fn(on);
}

export function onSoundChange(fn: (on: boolean) => void): void {
  listeners.add(fn);
}

function audio(): AudioContext | undefined {
  if (typeof AudioContext === 'undefined') return undefined;
  context ??= new AudioContext();
  if (context.state === 'suspended') void context.resume();
  return context;
}

/** A short, dry knock: noise through a band-pass filter, gone in a tenth of a second. */
function pop(ctx: AudioContext): void {
  const length = Math.floor(ctx.sampleRate * 0.09);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 4;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1400;
  band.Q.value = 1.2;
  const gain = ctx.createGain();
  gain.gain.value = 0.9;
  src.connect(band).connect(gain).connect(ctx.destination);
  src.start();
}

/** A school siren: a tone that winds up and down twice over four seconds. */
function siren(ctx: AudioContext): void {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(320, t);
  for (let k = 0; k < 2; k++) {
    osc.frequency.linearRampToValueAtTime(820, t + 1 + k * 2);
    osc.frequency.linearRampToValueAtTime(320, t + 2 + k * 2);
  }
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 1800;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.25, t + 0.3);
  gain.gain.setValueAtTime(0.25, t + 3.6);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 4.2);
  osc.connect(tone).connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 4.3);
}

/** Play a sound if sound is on. The page records the last one asked for, for tests. */
export function play(name: SoundName): void {
  document.body.dataset['lastSound'] = name;
  if (!on) return;
  const ctx = audio();
  if (!ctx) return;
  if (name === 'pop') pop(ctx);
  else siren(ctx);
}
