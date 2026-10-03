export type Preferences = { feedback: boolean; countdown: boolean };
export const PREFERENCES_KEY = "sums.preferences.v1";
export const DEFAULT_PREFERENCES: Preferences = {
  feedback: true,
  countdown: true,
};
export function loadPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "null");
    return {
      feedback: typeof value?.feedback === "boolean" ? value.feedback : true,
      countdown: typeof value?.countdown === "boolean" ? value.countdown : true,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}
export function savePreferences(value: Preferences) {
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(value));
}
