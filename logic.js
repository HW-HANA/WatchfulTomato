export function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

export function formatTime(total) {
  const safe = Math.max(0, Math.ceil(Number(total) || 0));
  return [String(Math.floor(safe / 60)).padStart(2, "0"), String(safe % 60).padStart(2, "0")];
}

export function waterAfterPause(current, pauseCount) {
  const gain = 8 + Math.min(Math.max(0, pauseCount - 1) * 3, 8);
  return clamp(current + gain);
}

export function waterAfterFocus(current, focusedSeconds) {
  return clamp(current - Math.max(0, focusedSeconds) / 60);
}

export function isSupervising(state) {
  return state.mode === "focus" && state.drama && state.running && state.remaining > 0;
}

export function shouldCry(state) {
  return state.mode === "focus" && state.drama && !state.running && state.remaining > 0 && state.pauseCount > 0;
}

export function waterAfterDrink(current) {
  return clamp(current - 18);
}

export function shouldHorrorAfterLeave(leaveCount) {
  return Number(leaveCount) === 3;
}

export function emotionForWater(level) {
  if (level >= 82) return "flooded";
  if (level >= 42) return "crying";
  if (level > 0) return "teary";
  return "calm";
}
