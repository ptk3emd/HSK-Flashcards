/**
 * Audio speech synthesis helper for Chinese Mandarin (zh-CN)
 * Supports browser native voices, gender preference (female / male / auto),
 * pitch modulation, and variable playback rate.
 */

import { VoiceGenderPreference } from '../types/card';

export interface SpeechOptions {
  rate?: number;
  gender?: VoiceGenderPreference;
  voiceURI?: string;
  pitch?: number;
}

const FEMALE_KEYWORDS = [
  'female',
  'woman',
  'fem',
  'tingting',
  'ting-ting',
  'yaoyao',
  'huihui',
  'xiaoxiao',
  'xiaoyi',
  'meijia',
  'mei-jia',
  'sinji',
  'sin-ji',
  'yushu',
  'yu-shu',
  'tiantian',
  'tian-tian',
  'hanhan',
  'yating',
  'hiugaai',
  'hiu-gaai',
  '女',
];

const MALE_KEYWORDS = [
  'male',
  'man',
  'masc',
  'yunxi',
  'yunjian',
  'yunyang',
  'zhiwei',
  'kangkang',
  'limu',
  'li-mu',
  'wanlung',
  'wan-lung',
  'danny',
  '男',
];

/**
 * Detect estimated gender of a SpeechSynthesisVoice by name and properties
 */
export function detectVoiceGender(voice: SpeechSynthesisVoice): 'female' | 'male' | 'unknown' {
  const name = voice.name.toLowerCase();

  // Explicit keyword search (exclude female false positive on "male")
  const isExplicitFemale = FEMALE_KEYWORDS.some((kw) => name.includes(kw));
  const isExplicitMale = MALE_KEYWORDS.some((kw) => {
    if (kw === 'male' && name.includes('female')) return false;
    return name.includes(kw);
  });

  if (isExplicitFemale && !isExplicitMale) return 'female';
  if (isExplicitMale && !isExplicitFemale) return 'male';

  // Fallback defaults for common voice families:
  // Google's default Chinese voices are typically female personas
  if (name.includes('google') && (name.includes('普通话') || name.includes('國語') || name.includes('粵語'))) {
    return 'female';
  }

  return 'unknown';
}

/**
 * Filter all available browser voices to Chinese (Mandarin, Cantonese, etc.)
 */
export function getBrowserChineseVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return [];
  }

  const allVoices = window.speechSynthesis.getVoices();
  const seen = new Set<string>();
  const chineseVoices: SpeechSynthesisVoice[] = [];

  for (const v of allVoices) {
    const lang = (v.lang || '').toLowerCase();
    const name = (v.name || '').toLowerCase();
    const isChinese =
      lang.startsWith('zh') ||
      lang.startsWith('cmn') ||
      lang.startsWith('yue') ||
      name.includes('chinese') ||
      name.includes('mandarin') ||
      name.includes('putonghua') ||
      name.includes('普通话') ||
      name.includes('中文') ||
      name.includes('chinês') ||
      name.includes('chines') ||
      name.includes('chino');

    if (!isChinese) continue;

    // Deduplicate identical voices returned by some browsers (e.g. Chrome on Android or localized OS)
    const voiceId = v.voiceURI || v.name;
    const dedupeKey = `${voiceId}__${lang}`;
    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      chineseVoices.push(v);
    }
  }

  return chineseVoices;
}

/**
 * Helper to get user-friendly label for a speech voice
 */
export function getVoiceDisplayLabel(voice: SpeechSynthesisVoice): {
  title: string;
  genderBadge: string;
  genderType: 'female' | 'male' | 'unknown';
  langTag: string;
} {
  const gender = detectVoiceGender(voice);
  const cleanName = voice.name
    .replace(/^Microsoft\s+/i, 'MS ')
    .replace(/^Google\s+/i, 'Google ')
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .trim();

  let genderBadge = 'Padrão / Auto';
  if (gender === 'female') genderBadge = 'Feminino';
  if (gender === 'male') genderBadge = 'Masculino';

  return {
    title: cleanName || voice.name,
    genderBadge,
    genderType: gender,
    langTag: voice.lang || 'zh-CN',
  };
}

/**
 * Reads fallback audio preferences directly from localStorage if not explicitly supplied
 */
function getStoredAudioPreferences(): {
  rate: number;
  gender: VoiceGenderPreference;
  voiceURI: string;
} {
  try {
    const raw = localStorage.getItem('hanzi_anki_settings_v2');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        rate: typeof parsed.speechSpeed === 'number' ? parsed.speechSpeed : 0.85,
        gender: parsed.speechVoiceGender || 'auto',
        voiceURI: parsed.speechVoiceURI || '',
      };
    }
  } catch (e) {
    // ignore
  }
  return { rate: 0.85, gender: 'auto', voiceURI: '' };
}

/**
 * Speaks Chinese text using Web Speech API with gender, rate and voice customization
 */
export function speakChinese(
  text: string,
  rateOrOptions?: number | SpeechOptions,
  legacyGender?: VoiceGenderPreference,
  legacyVoiceURI?: string
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }

  // Cancel any active speech to avoid queue buildup
  window.speechSynthesis.cancel();

  // Strip HTML / markup
  const clean = text.replace(/<[^>]*>/g, '').trim();
  if (!clean) return;

  const stored = getStoredAudioPreferences();

  let rate = stored.rate;
  let gender: VoiceGenderPreference = stored.gender;
  let voiceURI = stored.voiceURI;
  let pitch = 1.0;

  if (typeof rateOrOptions === 'number') {
    rate = rateOrOptions;
    if (legacyGender) gender = legacyGender;
    if (legacyVoiceURI) voiceURI = legacyVoiceURI;
  } else if (typeof rateOrOptions === 'object' && rateOrOptions !== null) {
    if (typeof rateOrOptions.rate === 'number') rate = rateOrOptions.rate;
    if (rateOrOptions.gender) gender = rateOrOptions.gender;
    if (rateOrOptions.voiceURI !== undefined) voiceURI = rateOrOptions.voiceURI;
    if (typeof rateOrOptions.pitch === 'number') pitch = rateOrOptions.pitch;
  }

  // Clamp rate between 0.5 and 1.6
  const finalRate = Math.min(Math.max(rate, 0.5), 1.6);

  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = 'zh-CN';
  utterance.rate = finalRate;

  const availableVoices = window.speechSynthesis.getVoices();
  const chineseVoices = getBrowserChineseVoices();

  let selectedVoice: SpeechSynthesisVoice | undefined;

  // 1. If explicit voiceURI selected and valid, use it
  if (voiceURI) {
    selectedVoice = availableVoices.find((v) => v.voiceURI === voiceURI || v.name === voiceURI);
  }

  // 2. If no explicit voice or voice not found, pick according to gender preference
  if (!selectedVoice && chineseVoices.length > 0) {
    if (gender === 'female') {
      selectedVoice = chineseVoices.find((v) => detectVoiceGender(v) === 'female');
    } else if (gender === 'male') {
      selectedVoice = chineseVoices.find((v) => detectVoiceGender(v) === 'male');
    }

    // Fallback to first available Chinese voice
    if (!selectedVoice) {
      selectedVoice = chineseVoices[0];
    }
  }

  // 3. Fallback to any voice with Chinese language tag in the entire list
  if (!selectedVoice) {
    selectedVoice = availableVoices.find(
      (v) => v.lang.startsWith('zh') || v.lang.includes('cmn') || v.lang.includes('Chinese')
    );
  }

  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  // 4. Adjust pitch modulation for gender perception
  // If user requested male voice:
  // - If the selected voice is explicitly male, standard pitch (0.95 - 1.0)
  // - If the voice is female/generic, lower pitch to 0.82 to create a natural masculine timbre
  // If user requested female voice:
  // - If generic, slightly brighten pitch to 1.06
  if (gender === 'male') {
    const detected = selectedVoice ? detectVoiceGender(selectedVoice) : 'unknown';
    if (detected === 'male') {
      utterance.pitch = pitch * 0.96;
    } else {
      utterance.pitch = pitch * 0.82; // Formant pitch lowering
    }
  } else if (gender === 'female') {
    utterance.pitch = pitch * 1.05;
  } else {
    utterance.pitch = pitch;
  }

  window.speechSynthesis.speak(utterance);
}
