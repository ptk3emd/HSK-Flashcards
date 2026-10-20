/**
 * Neural voices (Piper, MIT, ONNX in the browser). Each model is downloaded once on demand,
 * kept in the browser's private file system and played offline afterwards. When a voice
 * is not installed or fails, speech.ts falls back to the system voices.
 * The piper-tts-web module is imported lazily so it stays out of the main bundle.
 */

import { COURSE } from './course';

export const NEURAL_PREFIX = 'piper:';

export interface NeuralVoice {
  id: string;
  label: string;
  gender: 'female' | 'male';
  sizeMB: number;
}

const NEURAL_VOICES: Record<string, NeuralVoice[]> = {
  zh: [{ id: 'zh_CN-huayan-medium', label: 'Huayan', gender: 'female', sizeMB: 63 }],
  fr: [
    { id: 'fr_FR-siwis-medium', label: 'Siwis', gender: 'female', sizeMB: 63 },
    { id: 'fr_FR-tom-medium', label: 'Tom', gender: 'male', sizeMB: 63 },
  ],
  it: [
    { id: 'it_IT-paola-medium', label: 'Paola', gender: 'female', sizeMB: 63 },
    { id: 'it_IT-riccardo-x_low', label: 'Riccardo', gender: 'male', sizeMB: 28 },
  ],
};

export function getNeuralVoices(): NeuralVoice[] {
  return NEURAL_VOICES[COURSE.id] ?? [];
}

export const isNeuralURI = (uri: string | undefined): uri is string => !!uri && uri.startsWith(NEURAL_PREFIX);
export const neuralId = (uri: string): string => uri.slice(NEURAL_PREFIX.length);

type PiperModule = typeof import('@mintplex-labs/piper-tts-web');
let piper: Promise<PiperModule> | null = null;
const loadPiper = (): Promise<PiperModule> => (piper ??= import('@mintplex-labs/piper-tts-web'));

let installed: Set<string> | null = null;

export async function getInstalledNeuralVoices(): Promise<Set<string>> {
  if (installed) return installed;
  try {
    installed = new Set(await (await loadPiper()).stored());
  } catch {
    installed = new Set();
  }
  return installed;
}

export async function installNeuralVoice(id: string, onProgress?: (fraction: number) => void): Promise<void> {
  const mod = await loadPiper();
  await mod.download(id, (p) => {
    if (onProgress && p.total) onProgress(Math.min(1, p.loaded / p.total));
  });
  (await getInstalledNeuralVoices()).add(id);
}

export async function removeNeuralVoice(id: string): Promise<void> {
  await (await loadPiper()).remove(id);
  (await getInstalledNeuralVoices()).delete(id);
}

let current: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
let token = 0;

export function stopNeuralSpeech(): void {
  token++;
  if (current) {
    current.pause();
    current = null;
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

/** Resolves true when the neural voice played, false when the caller should use a system voice. */
export async function speakNeural(text: string, uri: string, rate: number): Promise<boolean> {
  const id = neuralId(uri);
  if (typeof window === 'undefined' || !(await getInstalledNeuralVoices()).has(id)) return false;
  stopNeuralSpeech();
  const mine = token;
  try {
    const wav = await (await loadPiper()).predict({ text, voiceId: id });
    if (mine !== token) return true; // superseded by a newer request
    const url = URL.createObjectURL(wav);
    const audio = new Audio(url);
    audio.playbackRate = rate;
    audio.onended = () => {
      if (currentUrl === url) stopNeuralSpeech();
    };
    current = audio;
    currentUrl = url;
    await audio.play();
    return true;
  } catch {
    return mine !== token;
  }
}
