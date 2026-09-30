import { clamp, emotionForWater, formatTime, isSupervising, shouldCry, shouldHorrorAfterLeave, waterAfterDrink, waterAfterFocus, waterAfterPause } from "./logic.js";

import { createJuiceAnimation } from "./juice.js";

const $ = (selector) => document.querySelector(selector);

const dom = {
  minutes: $("#minutes"), seconds: $("#seconds"), caption: $("#timer-caption"),
  toggle: $("#toggle-button"), toggleLabel: $("#toggle-label"), reset: $("#reset-button"),
  sound: $("#sound-button"), status: $("#tiny-status"), count: $("#session-count"),
  watcher: $("#watcher"), gazeNote: $("#gaze-note"), sensor: $("#sensor-button"),
  sensorMessage: $("#sensor-message"), toast: $("#toast"), task: $("#task-input"),
  taskField: $("#task-field"), drama: $("#drama-toggle"), dramaCopy: $("#drama-copy"),
  hydrate: $("#hydrate-button"),
  completion: $("#completion-card"), completionTask: $("#completion-task"), water: $("#water-scene"),
  peeker: $("#edge-peeker"), returnOverlay: $("#return-overlay"), returnCopy: $("#return-copy"),
  horror: $("#horror-overlay"), horrorCopy: $("#horror-copy"), celebration: $("#celebration"), brand: $("#brand"),
  studio: $("#studio-panel"), studioCollapse: $("#studio-collapse"), studioWater: $("#studio-water"),
  studioWaterOutput: $("#studio-water-output"), modes: [...document.querySelectorAll(".mode")],
  studioActions: [...document.querySelectorAll("[data-studio-action]")],
};

const STORAGE_KEY = "watchful-tomato-v2";
const LEGACY_STORAGE_KEY = "watchful-tomato-v1";
const MAX_TILT = 28;
const isTouch = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const juice = createJuiceAnimation(document.querySelector("#tear-canvas"), document.querySelector("#fountain-canvas"), dom.watcher);

let timerId = null;
let toastId = null;
let blinkId = null;
let horrorId = null;
let returnId = null;
let leaveHorrorId = null;
let celebrationId = null;
let longPressId = null;
let peekerHideId = null;
let leftAt = null;
let lastDrainAt = Date.now();
let lastRippleAt = 0;
let recentPauses = [];
let eyeClicks = [];
let studioEnabled = false;
let affectionId = null;
let petGesture = null;
let recentPokes = [];
let lastPokeTalk = 0;
let pokeLineIndex = 0;
const pokeLines = ["干嘛。", "戳到我啦。", "我又不是按钮。", "叶子都给你戳歪了。", "好啦，给你再戳一下。"];

let state = {
  mode: "focus", duration: 25 * 60, remaining: 25 * 60, running: false, endAt: null,
  sound: true, completed: 0, task: "", drama: true, waterLevel: 0, pauseCount: 0, leaveCount: 0,
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || "null";
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== "object") return;
    const validMode = saved.mode === "focus" || saved.mode === "rest";
    const duration = Number(saved.duration);
    const remaining = Number(saved.remaining);
    if (validMode && Number.isFinite(duration) && duration > 0 && Number.isFinite(remaining)) {
      state = {
        ...state, mode: saved.mode, duration, remaining: clamp(remaining, 0, duration),
        running: Boolean(saved.running && saved.endAt), endAt: Number(saved.endAt) || null,
        sound: saved.sound !== false, completed: Math.max(0, Number(saved.completed) || 0),
        task: typeof saved.task === "string" ? saved.task.slice(0, 40) : "", drama: saved.drama !== false,
        waterLevel: clamp(saved.waterLevel), pauseCount: Math.max(0, Number(saved.pauseCount) || 0),
        leaveCount: Math.max(0, Number(saved.leaveCount) || 0),
      };
      if (state.running) state.remaining = Math.max(0, Math.ceil((state.endAt - Date.now()) / 1000));
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Storage can be unavailable. */ }
}

function render() {
  const [minutes, seconds] = formatTime(state.remaining);
  const complete = state.remaining === 0;
  const water = state.drama ? clamp(state.waterLevel) : 0;
  juice.setState(water, document.body.dataset.celebrating === "true", shouldCry(state) && dom.watcher.dataset.affection !== "pet");
  if (!isSupervising(state)) delete document.body.dataset.edge;

  dom.minutes.textContent = minutes;
  dom.seconds.textContent = seconds;
  dom.count.textContent = String(state.completed);
  document.title = `${minutes}:${seconds} · 盯一下`;
  document.body.dataset.state = complete ? "complete" : state.running ? "running" : "paused";
  document.body.dataset.mode = state.mode;
  document.body.dataset.drama = String(state.drama);
  document.body.dataset.emotion = emotionForWater(water);
  document.documentElement.style.setProperty("--water-level", `${water.toFixed(2)}%`);

  dom.modes.forEach((button) => {
    const active = button.dataset.mode === state.mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  dom.sound.classList.toggle("sound-on", state.sound);
  dom.sound.setAttribute("aria-label", state.sound ? "关闭结束提示音" : "开启结束提示音");
  dom.drama.checked = state.drama;
  dom.dramaCopy.textContent = state.drama ? "会流番茄汁，但不会真的拦你" : "今天只安静陪着你";
  dom.hydrate.hidden = !state.drama || state.mode !== "focus" || water <= 0;
  dom.taskField.hidden = state.mode !== "focus";
  dom.task.readOnly = state.running;
  if (document.activeElement !== dom.task) dom.task.value = state.task;
  dom.completion.hidden = !(complete && state.mode === "focus");
  dom.completionTask.textContent = state.task.trim() || "认真专注一会儿";

  if (studioEnabled) {
    dom.studioWater.value = String(Math.round(water));
    dom.studioWaterOutput.value = `${Math.round(water)}%`;
  }

  if (complete) {
    dom.toggleLabel.textContent = state.mode === "focus" ? "去休息一下" : "再专注一轮";
    dom.caption.textContent = state.mode === "focus" ? "完成啦，番茄汁喷泉开张！" : "休息结束，眼睛已经重新就位。";
    dom.status.innerHTML = '<span class="status-dot"></span>本轮完成';
  } else if (state.running) {
    dom.toggleLabel.textContent = "暂停一下";
    dom.caption.textContent = state.mode === "focus" ? (state.task.trim() ? `正在盯：${state.task.trim()}` : "别乱跑，我正盯着呢。") : "放心休息，这几分钟也算正事。";
    dom.status.innerHTML = '<span class="status-dot"></span>正在注视';
  } else {
    dom.toggleLabel.textContent = state.mode === "focus" ? "开始专注" : "开始休息";
    dom.caption.textContent = state.remaining < state.duration ? (water > 0 ? "我没有难过，只是漏了一点番茄汁。" : "暂停没关系，回来继续就好。") : "准备好了就开始，我会看着你。";
    dom.status.innerHTML = '<span class="status-dot"></span>正在待命';
  }
}

function tick() {
  if (!state.running || !state.endAt) return;
  const now = Date.now();
  const next = Math.max(0, Math.ceil((state.endAt - now) / 1000));
  let changed = next !== state.remaining;
  state.remaining = next;
  const drainUntil = Math.min(now, state.endAt);
  if (state.mode === "focus" && state.drama && state.waterLevel > 0 && (drainUntil - lastDrainAt >= 1000 || next === 0)) {
    state.waterLevel = waterAfterFocus(state.waterLevel, Math.max(0, drainUntil - lastDrainAt) / 1000);
    lastDrainAt = drainUntil;
    changed = true;
  }
  if (changed) { saveState(); render(); }
  if (next <= 0) completeTimer();
}

function startTimer() {
  if (state.remaining <= 0) {
    const nextMode = state.mode === "focus" ? "rest" : "focus";
    selectMode(nextMode, nextMode === "focus" ? 25 : 5);
  }
  state.task = dom.task.value.trim().slice(0, 40);
  state.running = true;
  state.endAt = Date.now() + state.remaining * 1000;
  lastDrainAt = Date.now();
  clearInterval(timerId);
  timerId = setInterval(tick, 250);
  saveState();
  render();
}

function pauseTimer() {
  if (!state.running) return;
  tick();
  if (state.remaining <= 0) return;
  state.running = false;
  state.endAt = null;
  clearInterval(timerId);
  timerId = null;
  if (state.mode === "focus" && state.drama) {
    state.pauseCount += 1;
    state.waterLevel = waterAfterPause(state.waterLevel, state.pauseCount);
    const now = Date.now();
    recentPauses = [...recentPauses.filter((time) => now - time < 12000), now];
    if (recentPauses.length >= 3 || state.waterLevel >= 100) {
      recentPauses = [];
      triggerHorror(state.waterLevel >= 100 ? "flood" : "pause");
    } else {
      const pauseMessages = ["它努力忍住了第一滴番茄汁", "你一停，它就没忍住。", "番茄汁又悄悄漫上来一点。"];
      showToast(pauseMessages[Math.min(state.pauseCount - 1, pauseMessages.length - 1)]);
    }
  }
  saveState();
  render();
  if (state.mode === "focus" && state.drama) animateTearReaction();
}

function resetTimer(showFeedback = true) {
  clearInterval(timerId);
  timerId = null;
  state.running = false;
  state.endAt = null;
  state.remaining = state.duration;
  state.waterLevel = 0;
  state.pauseCount = 0;
  state.leaveCount = 0;
  recentPauses = [];
  clearTransientEffects();
  saveState();
  render();
  if (showFeedback) showToast("这一轮和番茄汁水位都重置了");
}

function selectMode(mode, minutes) {
  clearInterval(timerId);
  timerId = null;
  state.mode = mode;
  state.duration = minutes * 60;
  state.remaining = state.duration;
  state.running = false;
  state.endAt = null;
  state.waterLevel = 0;
  state.pauseCount = 0;
  state.leaveCount = 0;
  clearTransientEffects();
  saveState();
  render();
}

function completeTimer() {
  clearInterval(timerId);
  timerId = null;
  state.running = false;
  state.endAt = null;
  state.remaining = 0;
  if (state.mode === "focus") state.completed += 1;
  saveState();
  render();
  if (navigator.vibrate) navigator.vibrate([120, 80, 160]);
  if (state.sound) playChime();
  if (state.mode === "focus") celebrate();
  showToast(state.mode === "focus" ? "番茄完成！番茄汁喷泉开张啦 🍅" : "休息完成，欢迎回来 👀");
}

function drinkWater() {
  if (!state.drama || state.waterLevel <= 0) {
    showToast("现在还没有番茄汁需要退潮");
    return;
  }
  state.waterLevel = waterAfterDrink(state.waterLevel);
  saveState();
  render();
  showToast(state.waterLevel > 0 ? "咕嘟咕嘟，番茄汁退下去一点了" : "喝水成功，番茄汁退潮啦");
}

function playChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const now = context.currentTime;
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now + index * .13);
      gain.gain.linearRampToValueAtTime(.12, now + index * .13 + .02);
      gain.gain.exponentialRampToValueAtTime(.001, now + index * .13 + .45);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now + index * .13);
      oscillator.stop(now + index * .13 + .48);
    });
    setTimeout(() => context.close(), 1000);
  } catch { /* Audio is optional. */ }
}

function showToast(message) {
  clearTimeout(toastId);
  dom.toast.textContent = message;
  dom.toast.classList.add("show");
  toastId = setTimeout(() => dom.toast.classList.remove("show"), 2600);
}

function animateTearReaction() {
  juice.react();
}

function clearAffection() {
  clearTimeout(affectionId);
  petGesture = null;
  delete dom.watcher.dataset.affection;
  delete dom.watcher.dataset.cheek;
}

function showAffection(kind, side = "left") {
  if (document.body.dataset.horror === "true") return;
  clearTimeout(affectionId);
  dom.watcher.dataset.affection = kind;
  dom.watcher.dataset.cheek = side;
  if (kind === "poke") {
    // Restart a brief squash without moving the hit targets out from under a finger.
    dom.watcher.classList.remove("poke-bounce");
    void dom.watcher.offsetWidth;
    dom.watcher.classList.add("poke-bounce");
    const now = Date.now();
    recentPokes = [...recentPokes.filter(t => now - t < 2400), now];
    if (recentPokes.length >= 3 && now - lastPokeTalk > 6000) {
      showToast(pokeLines[pokeLineIndex]);
      pokeLineIndex = (pokeLineIndex + 1) % pokeLines.length;
      lastPokeTalk = now;
      recentPokes = [];
    }
  }
  render();
  affectionId = setTimeout(() => {
    clearAffection();
    dom.watcher.classList.remove("poke-bounce");
    render();
  }, kind === "pet" ? 1800 : 650);
}

const petHead = $("#pet-head");
petHead.addEventListener("pointerdown", event => {
  if (event.isPrimary === false || (event.button !== undefined && event.button !== 0)) return;
  petGesture = { id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0 };
  petHead.setPointerCapture?.(event.pointerId);
});
petHead.addEventListener("pointermove", event => {
  if (!petGesture || petGesture.id !== event.pointerId) return;
  if (Math.abs(event.clientY - petGesture.y) > 26) { petGesture = null; return; }
  petGesture.distance += Math.abs(event.clientX - petGesture.x);
  petGesture.x = event.clientX;
  if (petGesture.distance >= 14) {
    showAffection("pet");
  }
});
for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
  petHead.addEventListener(eventName, () => { petGesture = null; });
}
// Tapping and keyboard activation work too; vertical swipes remain page scrolling.
petHead.addEventListener("click", () => showAffection("pet"));
document.querySelectorAll("[data-cheek]").forEach(button => {
  button.addEventListener("click", () => showAffection("poke", button.dataset.cheek));
});

function setGaze(x, y) {
  const px = clamp(x, -1, 1);
  const py = clamp(y, -1, 1);
  dom.watcher.style.setProperty("--pupil-x", `${px * MAX_TILT}px`);
  dom.watcher.style.setProperty("--pupil-y", `${py * (MAX_TILT * .72)}px`);
  dom.watcher.style.setProperty("--face-x", `${px * 5}px`);
  dom.watcher.style.setProperty("--face-y", `${py * 4}px`);
  dom.watcher.style.setProperty("--face-rotate", `${px * 1.4 - 1}deg`);
}

function pointerGaze(event) {
  const rect = dom.watcher.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  setGaze((event.clientX - centerX) / (innerWidth * .44), (event.clientY - centerY) / (innerHeight * .44));
  updateEdgePeeker(event.clientX, event.clientY);
  maybeCreateRipple(event.clientX, event.clientY);
}

function updateEdgePeeker(x, y) {
  if (!isSupervising(state) || isTouch) {
    delete document.body.dataset.edge;
    return;
  }
  const margin = 88;
  const distances = {
    left: x,
    right: innerWidth - x,
    top: y,
    bottom: innerHeight - y,
  };
  const edge = Object.entries(distances).sort((a, b) => a[1] - b[1])[0][0];
  if (distances[edge] >= margin) {
    delete document.body.dataset.edge;
    return;
  }

  clearTimeout(peekerHideId);
  const inset = 48;
  let targetX = clamp(x, inset, innerWidth - inset);
  let targetY = clamp(y, inset, innerHeight - inset);
  if (edge === "left") targetX = inset;
  if (edge === "right") targetX = innerWidth - inset;
  if (edge === "top") targetY = inset;
  if (edge === "bottom") targetY = innerHeight - inset;

  dom.peeker.style.setProperty("--peeker-x", `${targetX}px`);
  dom.peeker.style.setProperty("--peeker-y", `${targetY}px`);
  dom.peeker.dataset.copy = targetY > innerHeight - 108 ? "above" : "below";
  document.body.dataset.edge = edge;
}

function maybeCreateRipple(x, y) {
  const water = state.drama ? state.waterLevel : 0;
  if (water < 6 || Date.now() - lastRippleAt < 180) return;
  const surfaceY = innerHeight * (1 - water / 100);
  if (Math.abs(y - surfaceY) > 42) return;
  lastRippleAt = Date.now();
  const ripple = document.createElement("span");
  ripple.className = "cursor-ripple";
  ripple.style.left = `${x}px`;
  ripple.style.top = `${surfaceY}px`;
  dom.water.append(ripple);
  setTimeout(() => ripple.remove(), 850);
}

function orientationGaze(event) {
  const orientation = screen.orientation?.angle ?? window.orientation ?? 0;
  let x = Number(event.gamma) || 0;
  let y = Number(event.beta) || 0;
  if (Math.abs(orientation) === 90) [x, y] = [y * Math.sign(orientation), -x * Math.sign(orientation)];
  setGaze(x / 28, (y - 35) / 36);
  document.documentElement.style.setProperty("--water-tilt", `${clamp(x * .16, -6, 6)}deg`);
}

async function enableOrientation() {
  try {
    if (!("DeviceOrientationEvent" in window)) throw new Error("unsupported");
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== "granted") throw new Error("denied");
    }
    window.addEventListener("deviceorientation", orientationGaze, { passive: true });
    dom.sensor.hidden = true;
    dom.sensorMessage.hidden = false;
    dom.sensorMessage.textContent = "已开启方向感应，眼神和番茄汁水面都会跟着倾斜。";
    dom.gazeNote.textContent = "轻轻倾斜手机，视线和番茄汁水面都会动";
    showToast("视线与番茄汁水面感应已开启");
  } catch (error) {
    dom.sensor.hidden = true;
    dom.sensorMessage.hidden = false;
    dom.sensorMessage.textContent = error.message === "unsupported" ? "这台设备没有方向感应，触摸屏幕也能逗动眼睛。" : "没有获得方向权限，已改用触摸跟随。";
    dom.gazeNote.textContent = "在屏幕上移动手指，视线会跟着动";
  }
}

function scheduleBlink() {
  if (reducedMotion) return;
  clearTimeout(blinkId);
  blinkId = setTimeout(() => {
    dom.watcher.style.setProperty("--blink", ".08");
    setTimeout(() => dom.watcher.style.setProperty("--blink", "1"), 135);
    scheduleBlink();
  }, 2600 + Math.random() * 3600);
}

function triggerHorror(reason = "preview") {
  clearAffection();
  dom.watcher.classList.remove("poke-bounce");
  const messages = {
    leave: "你离开时，我也一直看着。",
    pause: "你暂停了时间。可我没有。",
    eyes: "别再碰我的眼睛。",
    flood: "番茄汁……已经漫上来了。",
    preview: "现在，你知道我一直醒着。",
  };
  clearTimeout(horrorId);
  dom.horrorCopy.textContent = messages[reason] || messages.preview;
  document.body.dataset.horror = "true";
  dom.horror.classList.add("active");
  render();
  horrorId = setTimeout(() => {
    delete document.body.dataset.horror;
    dom.horror.classList.remove("active");
  }, reducedMotion ? 1400 : 2400);
}

function showReturnReaction(awayMs = 0, preview = false) {
  if (!isSupervising(state) && !(preview && state.mode === "focus" && state.drama)) return;
  clearTimeout(returnId);
  clearTimeout(leaveHorrorId);
  state.leaveCount += 1;
  const messages = ["你刚才去哪儿啦？", "又溜出去？我可一直没眨眼。", "……这次被我抓到了。", "回来就坐好，我还在盯。"];
  dom.returnCopy.textContent = messages[Math.min(state.leaveCount - 1, messages.length - 1)];
  dom.returnOverlay.classList.add("active");
  saveState();
  render();
  returnId = setTimeout(() => dom.returnOverlay.classList.remove("active"), 1900);
  if (shouldHorrorAfterLeave(state.leaveCount)) leaveHorrorId = setTimeout(() => triggerHorror("leave"), 1050);
}

function celebrate() {
  clearTimeout(celebrationId);
  dom.celebration.replaceChildren();
  for (let index = 0; index < 18; index += 1) {
    const tomato = document.createElement("span");
    tomato.className = "confetti-tomato";
    tomato.style.setProperty("--x", `${6 + Math.random() * 88}vw`);
    tomato.style.setProperty("--delay", `${Math.random() * .55}s`);
    tomato.style.setProperty("--size", `${12 + Math.random() * 16}px`);
    tomato.style.setProperty("--spin", `${-90 + Math.random() * 180}deg`);
    dom.celebration.append(tomato);
  }
  document.body.dataset.celebrating = "true";
  dom.celebration.classList.add("active");
  state.waterLevel = Math.max(state.waterLevel, 24);
  render();
  celebrationId = setTimeout(() => {
    delete document.body.dataset.celebrating;
    dom.celebration.classList.remove("active");
    if (!studioEnabled) {
      state.waterLevel = 0;
      saveState();
    }
    render();
  }, 3900);
}

function clearTransientEffects() {
  clearAffection();
  dom.watcher.classList.remove("poke-bounce");
  leftAt = null;
  clearTimeout(horrorId);
  clearTimeout(returnId);
  clearTimeout(leaveHorrorId);
  clearTimeout(celebrationId);
  clearTimeout(peekerHideId);
  juice.clear();
  delete document.body.dataset.horror;
  delete document.body.dataset.celebrating;
  delete document.body.dataset.edge;
  dom.horror.classList.remove("active");
  dom.returnOverlay.classList.remove("active");
  dom.celebration.classList.remove("active");
}

function enableStudio() {
  studioEnabled = true;
  dom.studio.hidden = false;
  const url = new URL(location.href);
  url.searchParams.set("studio", "1");
  history.replaceState({}, "", url);
  render();
  showToast("导演模式已开启：可以直接预览所有状态");
}

function runStudioAction(action) {
  if (action === "tear") {
    if (state.mode !== "focus" || !state.drama) return;
    if (state.running) { pauseTimer(); return; }
    state.pauseCount += 1;
    state.waterLevel = waterAfterPause(state.waterLevel, state.pauseCount);
  } else if (action === "return") {
    if (state.mode !== "focus" || !state.drama) {
      showToast("切到专注并开启戏精监工，就能预览啦。");
      return;
    }
    showReturnReaction(8000, true);
    return;
  } else if (action === "drink") {
    drinkWater();
    return;
  } else if (action === "horror") {
    triggerHorror("preview");
    return;
  } else if (action === "celebrate") {
    celebrate();
    return;
  } else if (action === "reset") {
    resetTimer(false);
    return;
  }
  render();
  if (action === "tear") animateTearReaction();
}

dom.toggle.addEventListener("click", () => state.running ? pauseTimer() : startTimer());
dom.reset.addEventListener("click", () => resetTimer());
dom.sound.addEventListener("click", () => {
  state.sound = !state.sound; saveState(); render();
  showToast(state.sound ? "结束提示音已开启" : "结束提示音已关闭");
});
dom.drama.addEventListener("change", () => {
  state.drama = dom.drama.checked;
  if (!state.drama) { state.waterLevel = 0; clearTransientEffects(); }
  saveState(); render();
  showToast(state.drama ? "戏精监工已上线" : "切换为安静陪伴模式");
});
dom.task.addEventListener("input", () => { state.task = dom.task.value.slice(0, 40); saveState(); });
dom.modes.forEach((button) => button.addEventListener("click", () => selectMode(button.dataset.mode, Number(button.dataset.minutes))));
dom.sensor.addEventListener("click", enableOrientation);
dom.hydrate.addEventListener("click", drinkWater);

window.addEventListener("pointermove", pointerGaze, { passive: true });
window.addEventListener("pointerleave", () => {
  if (!isSupervising(state) || isTouch) return;
  peekerHideId = setTimeout(() => delete document.body.dataset.edge, 900);
});
window.addEventListener("touchmove", (event) => { const touch = event.touches[0]; if (touch) pointerGaze(touch); }, { passive: true });

dom.watcher.addEventListener("pointerdown", (event) => {
  if (!event.target.closest(".eye")) return;
  const now = Date.now();
  eyeClicks = [...eyeClicks.filter((time) => now - time < 8000), now];
  if (eyeClicks.length >= 7) { eyeClicks = []; triggerHorror("eyes"); }
});

function rememberDeparture() {
  if (leftAt === null && isSupervising(state)) leftAt = Date.now();
}
function handleReturn() {
  if (document.hidden) return;
  const departedAt = leftAt;
  leftAt = null;
  tick();
  if (departedAt !== null && isSupervising(state) && Date.now() - departedAt > 1200) showReturnReaction(Date.now() - departedAt);
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) rememberDeparture();
  else handleReturn();
});
window.addEventListener("pagehide", rememberDeparture);
window.addEventListener("pageshow", handleReturn);
window.addEventListener("blur", rememberDeparture);
window.addEventListener("focus", handleReturn);

document.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
  if (event.code === "Space") { event.preventDefault(); state.running ? pauseTimer() : startTimer(); }
  else if (event.key.toLowerCase() === "r") resetTimer();
});

dom.brand.addEventListener("pointerdown", () => { longPressId = setTimeout(enableStudio, 900); });
for (const eventName of ["pointerup", "pointercancel", "pointerleave"]) dom.brand.addEventListener(eventName, () => clearTimeout(longPressId));
dom.studioWater.addEventListener("input", () => { state.waterLevel = Number(dom.studioWater.value); render(); });
dom.studioActions.forEach((button) => button.addEventListener("click", () => runStudioAction(button.dataset.studioAction)));
dom.studioCollapse.addEventListener("click", () => {
  const collapsed = dom.studio.classList.toggle("collapsed");
  dom.studioCollapse.textContent = collapsed ? "+" : "−";
  dom.studioCollapse.setAttribute("aria-label", collapsed ? "展开导演模式" : "收起导演模式");
});

loadState();
studioEnabled = new URLSearchParams(location.search).get("studio") === "1";
dom.studio.hidden = !studioEnabled;
render();
if (state.running && state.remaining > 0) timerId = setInterval(tick, 250);
if (state.running && state.remaining <= 0) completeTimer();
if (isTouch) { dom.gazeNote.textContent = "摸摸头顶，戳戳脸"; dom.sensor.hidden = false; }
else dom.sensor.hidden = true;
scheduleBlink();
