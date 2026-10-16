/**
 * Which language this device is studying. Read once at startup: every storage key, deck and
 * colour depends on it, so switching course saves the choice and reloads the app.
 * No imports here, so storage, the decks and the theme can all depend on it without a cycle.
 */
export type CourseId = 'zh' | 'fr';

/** Device setting, kept out of STORAGE_KEYS so it never travels in a backup. */
export const COURSE_KEY = 'app_course_v1';

function readCourse(): CourseId {
  try {
    return localStorage.getItem(COURSE_KEY) === 'fr' ? 'fr' : 'zh';
  } catch {
    return 'zh';
  }
}

export const ACTIVE_COURSE: CourseId = readCourse();

/** Saves the course and reloads, so the whole app starts again in the other language. */
export function switchCourse(next: CourseId): void {
  if (next === ACTIVE_COURSE) return;
  try {
    localStorage.setItem(COURSE_KEY, next);
  } catch (e) {
    console.error('Failed to save the course', e);
    return;
  }
  window.location.reload();
}
