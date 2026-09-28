/* =================================================================
   FOCUS QUEST – Application Logic
   ================================================================= */

'use strict';

// ─────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────
const XP_TABLE = {
  15: 25,
  25: 50,
  45: 90,
  60: 120,
};
const COIN_TABLE = {
  15: 10,
  25: 20,
  45: 35,
  60: 50,
};
const XP_PER_LEVEL = (lvl) => 200 + (lvl - 1) * 150;
const LEVEL_UP_BONUS_COINS = 100;

const CATEGORIES = {
  general:    { label: 'General Study', icon: '📚', color: '#7c6af7' },
  japanese:   { label: 'Japanese',      icon: '🇯🇵', color: '#f472b6' },
  vocab:      { label: 'Vocabulary',    icon: '🧠', color: '#38bdf8' },
  reading:    { label: 'Reading',       icon: '📖', color: '#4ade80' },
  grammar:    { label: 'Grammar',       icon: '✍️', color: '#fb923c' },
  coding:     { label: 'Coding',        icon: '💻', color: '#a855f7' },
  assignment: { label: 'Assignment',    icon: '📝', color: '#fbbf24' },
  other:      { label: 'Other',         icon: '🎯', color: '#6b7280' },
};

const PETS = [
  { id: 'cat',    emoji: '🐱', name: 'Luna',    unlockLevel: 1 },
  { id: 'dog',    emoji: '🐶', name: 'Mochi',   unlockLevel: 3 },
  { id: 'rabbit', emoji: '🐰', name: 'Maple',   unlockLevel: 6 },
  { id: 'fox',    emoji: '🦊', name: 'Kitsune', unlockLevel: 10 },
  { id: 'panda',  emoji: '🐼', name: 'Bao',     unlockLevel: 15 },
  { id: 'frog',   emoji: '🐸', name: 'Kero',    unlockLevel: 20 },
];

const GARDEN_PLANTS = ['🌱', '🌿', '🌸', '🌷', '🌳', '🌻', '🍀', '🪷'];

const QUEST_TEMPLATES = [
  { id: 'focus_25',   label: 'Focus for 25 minutes',    xp: 50,  type: 'duration',  target: 25 },
  { id: 'sessions_2', label: 'Complete 2 focus sessions',xp: 75,  type: 'sessions',  target: 2  },
  { id: 'focus_60',   label: 'Study for 60 minutes',    xp: 100, type: 'duration',  target: 60 },
  { id: 'sessions_1', label: 'Complete a focus session', xp: 30,  type: 'sessions',  target: 1  },
  { id: 'focus_45',   label: 'Focus for 45 minutes',    xp: 70,  type: 'duration',  target: 45 },
  { id: 'categories', label: 'Study 2 different subjects',xp: 80, type: 'categories',target: 2  },
];

const PET_SPEECHES = {
  idle:     "Hey! Ready to study today? 🌟",
  ready:    "Let's do this! You've got it! 💪",
  focus:    "Stay focused! You're doing great!",
  almost:   "Almost there! Keep going! 🔥",
  done:     "Amazing work! You're so cool! 🎉",
  paused:   "Take a breath… you're doing well ✨",
};

const STORAGE_KEY = 'focusquest_v1';

// ─────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────
let state = {
  // User progress
  xp: 0,
  level: 1,
  coins: 0,
  streak: 0,
  longestStreak: 0,
  lastStudyDate: null,

  // Active pet
  activePet: 'cat',

  // Settings
  theme: 'dark',
  soundComplete: false,
  soundAmbient: false,

  // Session history  [{id,date,time,category,goal,duration,xp,coins}]
  history: [],

  // Quests [{...template, progress, completed}]
  quests: [],
  questDate: null,

  // Garden  [{plant, date}]
  garden: [],

  // Today stats
  todayDate: null,
  todayTime: 0,     // minutes
  todayXp: 0,
  todaySessions: 0,

  // Weekly data – keyed by ISO date  {YYYY-MM-DD: minutes}
  weeklyData: {},
};

// Timer runtime (not persisted)
let timer = {
  running: false,
  paused: false,
  startTs: null,
  pausedMs: 0,
  totalMs: 0,
  rafId: null,
  duration: 25,      // minutes
  goal: '',
  category: 'general',
};

let ambientAudio = null;

// ─────────────────────────────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────────────────────────────
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch(e) { /* quota exceeded – silently ignore */ }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      state = { ...state, ...saved };
    }
  } catch(e) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

// ─────────────────────────────────────────────────────────────────
// DATE HELPERS
// ─────────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getWeekDays() {
  const today = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function formatTime(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatClock(totalSeconds) {
  totalSeconds = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function timeLabel(dateStr) {
  const t = new Date(dateStr);
  return t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─────────────────────────────────────────────────────────────────
// STREAK & DAILY RESET
// ─────────────────────────────────────────────────────────────────
function checkDailyReset() {
  const today = todayStr();

  // Reset today's stats if it's a new day
  if (state.todayDate !== today) {
    state.todayDate = today;
    state.todayTime = 0;
    state.todayXp = 0;
    state.todaySessions = 0;
  }

  // Reset quests if new day
  if (state.questDate !== today) {
    state.questDate = today;
    state.quests = generateDailyQuests();
  }
}

function updateStreak() {
  const today = todayStr();
  if (state.lastStudyDate === today) return false; // already studied today

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().slice(0, 10);

  if (state.lastStudyDate === yStr) {
    state.streak += 1;
  } else {
    state.streak = 1;
  }

  if (state.streak > state.longestStreak) {
    state.longestStreak = state.streak;
  }

  state.lastStudyDate = today;
  return true;
}

// ─────────────────────────────────────────────────────────────────
// QUESTS
// ─────────────────────────────────────────────────────────────────
function generateDailyQuests() {
  // Pick 3 random quests
  const shuffled = [...QUEST_TEMPLATES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3).map(q => ({
    ...q,
    progress: 0,
    completed: false,
  }));
}

function updateQuestsAfterSession(durationMin, category) {
  const today = todayStr();
  const completedNow = [];

  state.quests.forEach(q => {
    if (q.completed) return;

    if (q.type === 'duration') {
      q.progress = Math.min(q.target, q.progress + durationMin);
    } else if (q.type === 'sessions') {
      q.progress = Math.min(q.target, q.progress + 1);
    } else if (q.type === 'categories') {
      // Track unique categories studied today in weeklyData
      const key = `cats_${today}`;
      if (!state.weeklyData[key]) state.weeklyData[key] = [];
      if (!state.weeklyData[key].includes(category)) {
        state.weeklyData[key].push(category);
      }
      q.progress = Math.min(q.target, state.weeklyData[key].length);
    }

    if (q.progress >= q.target && !q.completed) {
      q.completed = true;
      completedNow.push(q);
    }
  });

  return completedNow;
}

// ─────────────────────────────────────────────────────────────────
// XP & LEVELLING
// ─────────────────────────────────────────────────────────────────
function addXP(amount) {
  state.xp += amount;
  state.todayXp += amount;

  const levelsGained = [];
  let needed = XP_PER_LEVEL(state.level);
  while (state.xp >= needed) {
    state.xp -= needed;
    state.level += 1;
    state.coins += LEVEL_UP_BONUS_COINS;
    levelsGained.push(state.level);
    needed = XP_PER_LEVEL(state.level);
  }
  return levelsGained;
}

function xpProgress() {
  const needed = XP_PER_LEVEL(state.level);
  return { current: state.xp, needed, pct: Math.min(100, (state.xp / needed) * 100) };
}

// ─────────────────────────────────────────────────────────────────
// GARDEN
// ─────────────────────────────────────────────────────────────────
function addGardenPlant() {
  const plant = GARDEN_PLANTS[Math.floor(Math.random() * GARDEN_PLANTS.length)];
  state.garden.push({ plant, date: new Date().toISOString() });
}

// ─────────────────────────────────────────────────────────────────
// ACTIVE PET INFO
// ─────────────────────────────────────────────────────────────────
function getActivePet() {
  return PETS.find(p => p.id === state.activePet) || PETS[0];
}

function getXPForDuration(min) {
  const rounded = [15, 25, 45, 60].reduce((prev, curr) =>
    Math.abs(curr - min) < Math.abs(prev - min) ? curr : prev
  );
  return XP_TABLE[rounded] || Math.round(min * 2);
}

function getCoinsForDuration(min) {
  const rounded = [15, 25, 45, 60].reduce((prev, curr) =>
    Math.abs(curr - min) < Math.abs(prev - min) ? curr : prev
  );
  return COIN_TABLE[rounded] || Math.round(min * 0.5);
}

// ─────────────────────────────────────────────────────────────────
// TIMER ENGINE
// ─────────────────────────────────────────────────────────────────
function timerRemainingMs() {
  if (!timer.running) return timer.totalMs;
  // When paused, startTs is null – return totalMs minus accumulated elapsed
  if (timer.paused || timer.startTs === null) {
    return Math.max(0, timer.totalMs - timer.pausedMs);
  }
  const elapsed = Date.now() - timer.startTs + timer.pausedMs;
  return Math.max(0, timer.totalMs - elapsed);
}

function timerElapsedMs() {
  return timer.totalMs - timerRemainingMs();
}

function startTimer(durationMin, goal, category) {
  // Prevent double-start
  if (timer.running) return;

  const dur = parseFloat(durationMin);
  if (!dur || dur <= 0 || dur > 240) {
    showToast('⚠️ Invalid duration. Please choose 1–240 minutes.', 'error');
    return;
  }

  timer = {
    running: true,
    paused: false,
    startTs: Date.now(),
    pausedMs: 0,
    totalMs: dur * 60 * 1000,
    rafId: null,
    duration: dur,
    goal: goal.trim() || 'Focus session',
    category: category || 'general',
  };

  if (state.soundAmbient) {
    ambientAudio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-crickets-and-insects-in-the-wild-ambience-39.mp3');
    ambientAudio.loop = true;
    ambientAudio.volume = 0.5;
    ambientAudio.play().catch(()=>{});
  }

  showFocusOverlay();
  timerTick();
}

function pauseTimer() {
  if (!timer.running || timer.paused) return;
  timer.paused = true;
  timer.pausedMs += Date.now() - timer.startTs;
  timer.startTs = null;
  cancelAnimationFrame(timer.rafId);
  updateFocusUI();
  setPetState('paused');
  
  if (ambientAudio) ambientAudio.pause();
}

function resumeTimer() {
  if (!timer.running || !timer.paused) return;
  timer.paused = false;
  timer.startTs = Date.now();
  timerTick();
  updateFocusUI();
  setPetState('focus');
  
  if (ambientAudio) ambientAudio.play().catch(()=>{});
}

function resetTimer() {
  cancelAnimationFrame(timer.rafId);
  timer = { ...timer, running: false, paused: false, startTs: null, pausedMs: 0, rafId: null };
  hideFocusOverlay();
  setPetState('idle');
  
  if (ambientAudio) {
    ambientAudio.pause();
    ambientAudio = null;
  }
}

function completeSession() {
  const durationMin = timer.duration;
  cancelAnimationFrame(timer.rafId);

  if (ambientAudio) {
    ambientAudio.pause();
    ambientAudio = null;
  }
  if (state.soundComplete) {
    new Audio('https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-2015.mp3').play().catch(()=>{});
  }

  const xpEarned = getXPForDuration(durationMin);
  const coinsEarned = getCoinsForDuration(durationMin);
  const cat = timer.category;
  const goal = timer.goal;

  // Add XP and coins
  state.coins += coinsEarned;
  const levelsGained = addXP(xpEarned);

  // Stats
  state.todayTime += durationMin;
  state.todaySessions += 1;
  const dateKey = todayStr();
  state.weeklyData[dateKey] = (state.weeklyData[dateKey] || 0) + durationMin;

  // Streak
  const streakUpdated = updateStreak();

  // Quests
  const completedQuests = updateQuestsAfterSession(durationMin, cat);

  // Garden
  addGardenPlant();

  // History
  const entry = {
    id: Date.now(),
    date: todayStr(),
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    category: cat,
    goal,
    duration: durationMin,
    xp: xpEarned,
    coins: coinsEarned,
  };
  state.history.unshift(entry);

  saveState();

  // Reset timer state
  timer.running = false;
  timer.paused = false;
  timer.startTs = null;
  timer.pausedMs = 0;

  // Show completion
  hideFocusOverlay();
  showCompletionScreen({ xpEarned, coinsEarned, durationMin, streakUpdated, completedQuests, levelsGained });
}

function timerTick() {
  if (!timer.running || timer.paused) return;

  const remaining = timerRemainingMs();
  updateFocusUI();

  if (remaining <= 0) {
    completeSession();
    return;
  }

  // Update pet state based on progress
  const pct = timerElapsedMs() / timer.totalMs;
  if (pct < 0.85) {
    setPetState('focus');
  } else {
    setPetState('almost');
  }

  timer.rafId = requestAnimationFrame(timerTick);
}

// ─────────────────────────────────────────────────────────────────
// FOCUS UI
// ─────────────────────────────────────────────────────────────────
function showFocusOverlay() {
  const overlay = document.getElementById('focus-overlay');
  overlay.classList.remove('hidden');

  // Populate
  const cat = CATEGORIES[timer.category] || CATEGORIES.general;
  document.getElementById('focus-category-label').textContent = `${cat.icon} ${cat.label}`;
  document.getElementById('focus-goal-label').textContent = timer.goal ? `🎯 ${timer.goal}` : '';
  document.getElementById('focus-pet-emoji').textContent = getActivePet().emoji;

  updateFocusUI();
  overlay.focus?.();
}

function hideFocusOverlay() {
  document.getElementById('focus-overlay').classList.add('hidden');
}

function updateFocusUI() {
  const remaining = timerRemainingMs();
  const pct = timer.totalMs > 0 ? (timerElapsedMs() / timer.totalMs) * 100 : 0;

  const display = document.getElementById('focus-timer-display');
  display.textContent = formatClock(remaining / 1000);

  const fill = document.getElementById('focus-progress-fill');
  fill.style.width = `${pct}%`;

  const progressBar = document.getElementById('focus-progress-bar-wrap');
  progressBar.setAttribute('aria-valuenow', Math.round(pct));

  const pauseLabel = document.getElementById('focus-pause-label');
  if (timer.paused) {
    pauseLabel.textContent = '▶ Resume';
    document.getElementById('focus-pet-state').textContent = 'PAUSED';
  } else {
    pauseLabel.textContent = '⏸ Pause';
    const pctDone = timerElapsedMs() / timer.totalMs;
    document.getElementById('focus-pet-state').textContent =
      pctDone >= 0.85 ? 'ALMOST THERE!' : 'STAY FOCUSED';
  }
}

// ─────────────────────────────────────────────────────────────────
// COMPLETION SCREEN
// ─────────────────────────────────────────────────────────────────
function showCompletionScreen({ xpEarned, coinsEarned, durationMin, streakUpdated, completedQuests, levelsGained }) {
  const overlay = document.getElementById('completion-overlay');
  overlay.classList.remove('hidden');

  document.getElementById('completion-pet').textContent = getActivePet().emoji;
  document.getElementById('completion-msg').textContent = 'Great job! 🎊';
  document.getElementById('completion-detail').textContent = `${durationMin} minute${durationMin !== 1 ? 's' : ''} focused`;
  document.getElementById('completion-xp').textContent = `+${xpEarned} XP`;
  document.getElementById('completion-coins').textContent = `+${coinsEarned} 🪙`;

  const streakEl = document.getElementById('completion-streak');
  if (streakUpdated) {
    streakEl.classList.remove('hidden');
    streakEl.textContent = `🔥 ${state.streak} Day Streak!`;
  } else {
    streakEl.classList.add('hidden');
  }

  const questsEl = document.getElementById('completion-quests');
  questsEl.innerHTML = '';
  completedQuests.forEach(q => {
    const el = document.createElement('div');
    el.className = 'completion-quest-item';
    el.textContent = `✓ Quest Complete: ${q.label} (+${q.xp} XP)`;
    questsEl.appendChild(el);
  });

  // Award quest XP
  let totalQuestXp = completedQuests.reduce((a, q) => a + q.xp, 0);
  if (totalQuestXp > 0) {
    addXP(totalQuestXp);
    saveState();
  }

  setPetState('done');

  // Show level-up after completion if needed
  if (levelsGained.length > 0) {
    setTimeout(() => {
      hideCompletionScreen();
      showLevelUp(levelsGained[levelsGained.length - 1]);
    }, 2800);
  }
}

function hideCompletionScreen() {
  document.getElementById('completion-overlay').classList.add('hidden');
  updateAllUI();
}

// ─────────────────────────────────────────────────────────────────
// LEVEL UP
// ─────────────────────────────────────────────────────────────────
function showLevelUp(level) {
  const overlay = document.getElementById('levelup-overlay');
  overlay.classList.remove('hidden');
  document.getElementById('levelup-num').textContent = level;
  updateAllUI();
}

function hideLevelUp() {
  document.getElementById('levelup-overlay').classList.add('hidden');
  updateAllUI();
}

// ─────────────────────────────────────────────────────────────────
// PET STATE
// ─────────────────────────────────────────────────────────────────
function setPetState(stateKey) {
  const emoji = getActivePet().emoji;

  // Dashboard pet
  const petEmoji = document.getElementById('pet-emoji');
  if (petEmoji) petEmoji.textContent = emoji;

  const speech = document.getElementById('pet-speech-text');
  if (speech) speech.textContent = PET_SPEECHES[stateKey] || PET_SPEECHES.idle;

  // Focus pet
  const focusPet = document.getElementById('focus-pet-emoji');
  if (focusPet) focusPet.textContent = emoji;

  // Celebration
  if (stateKey === 'done' && petEmoji) {
    petEmoji.style.animation = 'none';
    requestAnimationFrame(() => {
      petEmoji.style.animation = 'petBounce 0.8s ease-in-out 3';
    });
  }
}

// ─────────────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────────────
function showToast(message, type = 'info', durationMs = 3000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, durationMs);
}

// ─────────────────────────────────────────────────────────────────
// RENDER HELPERS
// ─────────────────────────────────────────────────────────────────
function updateHeaderUI() {
  const { current, needed, pct } = xpProgress();
  document.getElementById('header-level').textContent = `LV ${state.level}`;
  document.getElementById('header-xp-fill').style.width = `${pct}%`;
  document.getElementById('header-xp-label').textContent = `${current.toLocaleString()} / ${needed.toLocaleString()}`;
  document.getElementById('header-coins').textContent = state.coins.toLocaleString();
  document.getElementById('header-streak-count').textContent = state.streak;
}

function updatePetUI() {
  const pet = getActivePet();
  document.getElementById('pet-emoji').textContent = pet.emoji;
  document.getElementById('pet-name').textContent = pet.name;

  // Pet level based on user level
  const petLvl = Math.ceil(state.level / 5);
  document.getElementById('pet-level').textContent = `Pet Lv.${petLvl}`;
  document.getElementById('pet-speech-text').textContent = PET_SPEECHES.idle;
}

function updateQuestUI() {
  const list = document.getElementById('quest-list');
  list.innerHTML = '';

  const completed = state.quests.filter(q => q.completed).length;
  const total = state.quests.length;
  document.getElementById('quest-progress-label').textContent = `${completed} / ${total}`;
  document.getElementById('quest-progress-fill').style.width = total > 0 ? `${(completed/total)*100}%` : '0%';

  state.quests.forEach(q => {
    const li = document.createElement('li');
    li.className = `quest-item${q.completed ? ' completed' : ''}`;

    const pct = q.target > 0 ? Math.min(100, (q.progress / q.target) * 100) : 0;

    li.innerHTML = `
      <div class="quest-check">${q.completed ? '✓' : ''}</div>
      <div class="quest-info">
        <div class="quest-label">${q.label}</div>
        <div class="quest-xp">+${q.xp} XP</div>
        ${!q.completed && q.progress > 0 ? `
          <div class="quest-sub-progress">
            <div class="quest-sub-fill" style="width:${pct}%"></div>
          </div>
        ` : ''}
      </div>
    `;
    list.appendChild(li);
  });
}

function updateStreakUI() {
  document.getElementById('streak-number').textContent = state.streak;

  const weekDays = getWeekDays();
  const todayKey = todayStr();
  const labels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const grid = document.getElementById('week-grid');
  grid.innerHTML = '';

  weekDays.forEach((dateStr, i) => {
    const d = new Date(dateStr);
    const dayIdx = (d.getDay() + 6) % 7; // Mon = 0
    const hasSessions = (state.weeklyData[dateStr] || 0) > 0 || dateStr === state.lastStudyDate;
    const isToday = dateStr === todayKey;

    const div = document.createElement('div');
    div.className = 'week-day';
    div.innerHTML = `
      <span class="week-day-label">${labels[dayIdx]}</span>
      <div class="week-day-dot${hasSessions ? ' done' : ''}${isToday ? ' today' : ''}" title="${dateStr}">
        ${hasSessions ? '🔥' : ''}
      </div>
    `;
    grid.appendChild(div);
  });
}

function updateTodayStatsUI() {
  document.getElementById('today-time').textContent = formatTime(state.todayTime);
  document.getElementById('today-sessions').textContent = state.todaySessions;
  document.getElementById('today-xp').textContent = state.todayXp;
}

function updateGardenPreview() {
  const grid = document.getElementById('garden-grid-preview');
  const empty = document.getElementById('garden-empty');

  if (!state.garden.length) {
    grid.innerHTML = '';
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  // Show last 20 plants
  const recent = state.garden.slice(-20);
  grid.innerHTML = recent.map(g => `<span class="garden-plant">${g.plant}</span>`).join('');
}

function updateXPPreview() {
  const dur = getSelectedDuration();
  const xp = getXPForDuration(dur);
  const coins = getCoinsForDuration(dur);
  document.getElementById('xp-gain-preview').textContent = `+${xp} XP`;
  document.getElementById('coin-gain-preview').textContent = `+${coins} 🪙`;
}

function getSelectedDuration() {
  const activeDur = document.querySelector('.dur-btn.active');
  if (!activeDur) return 25;
  const val = activeDur.dataset.min;
  if (val === 'custom') {
    const cv = parseInt(document.getElementById('custom-dur-input').value, 10);
    return isNaN(cv) ? 25 : cv;
  }
  return parseInt(val, 10);
}

// ─────────────────────────────────────────────────────────────────
// STATISTICS VIEW
// ─────────────────────────────────────────────────────────────────
function renderStats() {
  const totalMinutes = state.history.reduce((a, h) => a + h.duration, 0);
  const totalSessions = state.history.length;
  const avgSession = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0;
  const totalXp = state.history.reduce((a, h) => a + h.xp, 0);

  document.getElementById('stat-total-time').textContent = formatTime(totalMinutes);
  document.getElementById('stat-total-sessions').textContent = totalSessions;
  document.getElementById('stat-avg-session').textContent = `${avgSession}m`;
  document.getElementById('stat-total-xp').textContent = totalXp.toLocaleString();
  document.getElementById('stat-streak').textContent = state.streak;
  document.getElementById('stat-longest-streak').textContent = state.longestStreak;

  // Weekly bar chart
  renderWeeklyChart();
  renderCategoryChart();
}

function renderWeeklyChart() {
  const weekDays = getWeekDays();
  const maxMin = Math.max(1, ...weekDays.map(d => state.weeklyData[d] || 0));
  const labels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const chart = document.getElementById('weekly-chart');
  chart.innerHTML = '';

  weekDays.forEach((dateStr) => {
    const d = new Date(dateStr);
    const dayIdx = (d.getDay() + 6) % 7;
    const minutes = state.weeklyData[dateStr] || 0;
    const pct = (minutes / maxMin) * 100;

    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <span class="bar-label">${labels[dayIdx]}</span>
      <div class="bar-track">
        <div class="bar-fill" style="width:${pct}%" aria-label="${minutes} minutes">
          ${minutes > 0 ? formatTime(minutes) : ''}
        </div>
      </div>
    `;
    chart.appendChild(row);
  });
}

function renderCategoryChart() {
  const chart = document.getElementById('category-chart');
  chart.innerHTML = '';

  const totals = {};
  state.history.forEach(h => {
    totals[h.category] = (totals[h.category] || 0) + h.duration;
  });

  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((a, [,v]) => a + v, 0);
  if (!total) {
    chart.textContent = 'No data yet.';
    return;
  }

  const barColors = ['#7c6af7','#f472b6','#4ade80','#fb923c','#38bdf8','#fbbf24','#a855f7','#6b7280'];

  sorted.forEach(([cat, mins], i) => {
    const info = CATEGORIES[cat] || CATEGORIES.general;
    const pct = Math.round((mins / total) * 100);
    const row = document.createElement('div');
    row.className = 'cat-row';
    row.innerHTML = `
      <span class="cat-row-label">${info.icon} ${info.label}</span>
      <div class="cat-row-bar">
        <div class="cat-row-fill" style="width:${pct}%;background:${barColors[i % barColors.length]}"></div>
      </div>
      <span class="cat-row-pct">${pct}%</span>
    `;
    chart.appendChild(row);
  });
}

// ─────────────────────────────────────────────────────────────────
// HISTORY VIEW
// ─────────────────────────────────────────────────────────────────
function renderHistory() {
  const list = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  list.innerHTML = '';

  if (!state.history.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  // Group by date
  const groups = {};
  state.history.forEach(h => {
    if (!groups[h.date]) groups[h.date] = [];
    groups[h.date].push(h);
  });

  Object.entries(groups).sort((a,b) => b[0].localeCompare(a[0])).forEach(([date, items]) => {
    const today = todayStr();
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
    const yStr = yesterday.toISOString().slice(0,10);

    let label = date;
    if (date === today) label = 'Today';
    else if (date === yStr) label = 'Yesterday';
    else {
      const d = new Date(date);
      label = d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
    }

    const group = document.createElement('div');
    group.className = 'history-date-group';

    const dateLabel = document.createElement('div');
    dateLabel.className = 'history-date-label';
    dateLabel.textContent = label;
    group.appendChild(dateLabel);

    items.forEach(h => {
      const cat = CATEGORIES[h.category] || CATEGORIES.general;
      const item = document.createElement('div');
      item.className = 'history-item';
      item.innerHTML = `
        <span class="history-time">${h.time}</span>
        <span class="history-icon">${cat.icon}</span>
        <div class="history-info">
          <div class="history-cat">${cat.label}</div>
          <div class="history-goal">${h.goal}</div>
        </div>
        <div class="history-meta">
          <span class="history-dur">${h.duration}m</span>
          <span class="history-xp">+${h.xp} XP</span>
        </div>
      `;
      group.appendChild(item);
    });

    list.appendChild(group);
  });
}

// ─────────────────────────────────────────────────────────────────
// COLLECTION VIEW
// ─────────────────────────────────────────────────────────────────
function renderCollection() {
  // Garden full
  const gardenFull = document.getElementById('garden-full');
  const gardenEmpty = document.getElementById('garden-full-empty');
  gardenFull.innerHTML = '';

  if (!state.garden.length) {
    gardenEmpty.classList.remove('hidden');
  } else {
    gardenEmpty.classList.add('hidden');
    state.garden.forEach(g => {
      const span = document.createElement('span');
      span.className = 'garden-plant';
      span.textContent = g.plant;
      gardenFull.appendChild(span);
    });
  }

  // Pet roster
  renderPetRoster('pet-roster');
}

function renderPetRoster(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  PETS.forEach(pet => {
    const unlocked = state.level >= pet.unlockLevel;
    const isActive = state.activePet === pet.id;
    const item = document.createElement('div');
    item.className = `pet-roster-item${isActive ? ' active' : ''}${!unlocked ? ' locked' : ''}`;
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', unlocked ? '0' : '-1');
    item.setAttribute('aria-label', `${pet.name} – ${unlocked ? (isActive ? 'Active' : 'Select') : `Unlocks at level ${pet.unlockLevel}`}`);

    item.innerHTML = `
      ${isActive ? '<span class="pet-active-badge">Active</span>' : ''}
      <span class="pet-roster-emoji">${pet.emoji}</span>
      <div class="pet-roster-name">${pet.name}</div>
      <div class="pet-roster-req">${unlocked ? '' : `Lv.${pet.unlockLevel}`}</div>
    `;

    if (unlocked) {
      const activate = () => {
        state.activePet = pet.id;
        saveState();
        renderPetRoster(containerId);
        updatePetUI();
        showToast(`${pet.emoji} ${pet.name} is now your study buddy!`, 'success');
      };
      item.addEventListener('click', activate);
      item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') activate(); });
    }

    container.appendChild(item);
  });
}

// ─────────────────────────────────────────────────────────────────
// SETTINGS VIEW
// ─────────────────────────────────────────────────────────────────
function renderSettings() {
  renderPetRoster('pet-select-grid');
  updateThemeButtons();
  updateSoundButtons();
}

function updateSoundButtons() {
  const completeBtn = document.getElementById('sound-complete-btn');
  const ambientBtn = document.getElementById('sound-ambient-btn');
  
  if (state.soundComplete) {
    completeBtn.classList.add('on');
    completeBtn.textContent = 'ON';
  } else {
    completeBtn.classList.remove('on');
    completeBtn.textContent = 'OFF';
  }

  if (state.soundAmbient) {
    ambientBtn.classList.add('on');
    ambientBtn.textContent = 'ON';
  } else {
    ambientBtn.classList.remove('on');
    ambientBtn.textContent = 'OFF';
  }
}

function updateThemeButtons() {
  document.querySelectorAll('.theme-btn').forEach(btn => {
    const active = btn.dataset.theme === state.theme;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active);
  });
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  saveState();
  updateThemeButtons();
}

// ─────────────────────────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────────────────────────
let currentView = 'dashboard';

function navigateTo(viewId) {
  if (currentView === viewId) return;
  currentView = viewId;

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${viewId}`)?.classList.add('active');

  document.querySelectorAll('.nav-btn').forEach(btn => {
    const active = btn.dataset.view === viewId;
    btn.classList.toggle('active', active);
  });

  // Render dynamic views
  if (viewId === 'stats') renderStats();
  if (viewId === 'history') renderHistory();
  if (viewId === 'collection') renderCollection();
  if (viewId === 'settings') renderSettings();
}

// ─────────────────────────────────────────────────────────────────
// FULL UI UPDATE
// ─────────────────────────────────────────────────────────────────
function updateAllUI() {
  updateHeaderUI();
  updatePetUI();
  updateQuestUI();
  updateStreakUI();
  updateTodayStatsUI();
  updateGardenPreview();
  updateXPPreview();
}

// ─────────────────────────────────────────────────────────────────
// EVENT LISTENERS
// ─────────────────────────────────────────────────────────────────
function bindEvents() {
  // Global satisfying click sound
  document.addEventListener('click', (e) => {
    const isInteractive = e.target.closest('button, a, .card, [role="button"], .toggle-btn, .nav-btn, .dur-btn, .cat-btn');
    if (isInteractive) {
      const clickSound = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-modern-technology-select-3124.mp3');
      clickSound.volume = 0.2;
      clickSound.play().catch(()=>{});
    }
  });

  // Navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.view));
  });

  // Settings gear button in header → jump to settings
  document.getElementById('settings-btn').addEventListener('click', () => navigateTo('settings'));

  // Category selection
  document.getElementById('category-grid').addEventListener('click', e => {
    const btn = e.target.closest('.cat-btn');
    if (!btn) return;
    document.querySelectorAll('.cat-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
  });

  // Duration selection
  document.getElementById('duration-grid').addEventListener('click', e => {
    const btn = e.target.closest('.dur-btn');
    if (!btn) return;

    document.querySelectorAll('.dur-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');

    const customWrap = document.getElementById('custom-dur-wrap');
    if (btn.dataset.min === 'custom') {
      customWrap.classList.remove('collapsed');
      setTimeout(() => document.getElementById('custom-dur-input').focus(), 50);
    } else {
      customWrap.classList.add('collapsed');
    }

    updateXPPreview();
  });

  // Custom duration input & stepper
  const customDurInput = document.getElementById('custom-dur-input');
  document.getElementById('custom-dur-minus').addEventListener('click', () => {
    let val = parseInt(customDurInput.value) || 30;
    val = Math.max(1, val - 5);
    customDurInput.value = val;
    updateXPPreview();
  });
  document.getElementById('custom-dur-plus').addEventListener('click', () => {
    let val = parseInt(customDurInput.value) || 30;
    val = Math.min(240, val + 5);
    customDurInput.value = val;
    updateXPPreview();
  });
  customDurInput.addEventListener('input', updateXPPreview);

  // Start button
  document.getElementById('start-btn').addEventListener('click', () => {
    const cat = document.querySelector('.cat-btn.active')?.dataset.cat || 'general';
    const goal = document.getElementById('goal-input').value.trim();
    const activeDur = document.querySelector('.dur-btn.active');
    let durationMin;

    if (!activeDur) {
      showToast('⚠️ Please select a duration.', 'error');
      return;
    }

    if (activeDur.dataset.min === 'custom') {
      durationMin = parseInt(document.getElementById('custom-dur-input').value, 10);
      if (isNaN(durationMin) || durationMin < 1 || durationMin > 240) {
        document.getElementById('dur-validation').classList.remove('hidden');
        document.getElementById('custom-dur-input').focus();
        return;
      }
      document.getElementById('dur-validation').classList.add('hidden');
    } else {
      durationMin = parseInt(activeDur.dataset.min, 10);
    }

    setPetState('ready');
    startTimer(durationMin, goal, cat);
  });

  // Focus overlay: pause/resume
  document.getElementById('focus-pause-btn').addEventListener('click', () => {
    if (timer.paused) {
      resumeTimer();
    } else {
      pauseTimer();
    }
  });

  // Focus overlay: give up
  document.getElementById('focus-giveup-btn').addEventListener('click', () => {
    document.getElementById('giveup-overlay').classList.remove('hidden');
    // Pause timer in background while considering
    if (timerState.status === 'running') {
      pauseTimer();
      updateFocusUI();
    }
  });

  // Give up modal: confirm
  document.getElementById('giveup-confirm-btn').addEventListener('click', () => {
    document.getElementById('giveup-overlay').classList.add('hidden');
    resetTimer();
    setPetState('idle');
    updateAllUI();
  });

  // Give up modal: cancel
  document.getElementById('giveup-cancel-btn').addEventListener('click', () => {
    document.getElementById('giveup-overlay').classList.add('hidden');
    // Resume timer if it was running
    if (timerState.status === 'paused') {
      resumeTimer();
      updateFocusUI();
    }
  });

  // Completion continue
  document.getElementById('completion-continue-btn').addEventListener('click', () => {
    hideCompletionScreen();
    navigateTo('dashboard');
  });

  // Level up continue
  document.getElementById('levelup-continue-btn').addEventListener('click', () => {
    hideLevelUp();
  });

  // Sound settings
  document.getElementById('sound-complete-btn').addEventListener('click', () => {
    state.soundComplete = !state.soundComplete;
    saveState();
    updateSoundButtons();
    if (state.soundComplete) new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3').play().catch(()=>{});
  });

  document.getElementById('sound-ambient-btn').addEventListener('click', () => {
    state.soundAmbient = !state.soundAmbient;
    saveState();
    updateSoundButtons();
  });

  // Theme buttons
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
  });

  // Reset data
  document.getElementById('reset-btn').addEventListener('click', () => {
    document.getElementById('reset-overlay').classList.remove('hidden');
  });

  document.getElementById('reset-cancel-btn').addEventListener('click', () => {
    document.getElementById('reset-overlay').classList.add('hidden');
  });

  document.getElementById('reset-confirm-btn').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });

  // Keyboard shortcuts (global)
  document.addEventListener('keydown', e => {
    const activeEl = document.activeElement;
    const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

    if (isTyping) return;

    const focusVisible = !document.getElementById('focus-overlay').classList.contains('hidden');

    if (e.code === 'Space' && focusVisible) {
      e.preventDefault();
      if (timer.paused) resumeTimer(); else pauseTimer();
    }

    if (e.code === 'Escape' && focusVisible) {
      e.preventDefault();
      if (timer.paused) {
        if (confirm('Exit focus mode? Session won\'t be saved.')) {
          resetTimer();
          setPetState('idle');
          updateAllUI();
        }
      } else {
        pauseTimer();
      }
    }

    if (e.code === 'KeyR' && focusVisible) {
      e.preventDefault();
      if (confirm('Reset timer?')) {
        resetTimer();
        setPetState('idle');
        updateAllUI();
      }
    }
  });

  // Visibility change – handle tab switch (pause timer to avoid drift)
  document.addEventListener('visibilitychange', () => {
    if (!timer.running) return;
    // Timer uses timestamps so it naturally handles tab switches
    // Just trigger a UI refresh when returning
    if (!document.hidden) {
      updateFocusUI();
    }
  });
}

// ─────────────────────────────────────────────────────────────────
// DEMO DATA (first run)
// ─────────────────────────────────────────────────────────────────
function seedDemoData() {
  if (state.history.length > 0) return; // already has data

  // Seed 5 days of sample history
  const today = new Date();
  const sampleGoals = [
    { cat: 'japanese', goal: 'Learn 20 N3 vocabulary words', dur: 25 },
    { cat: 'coding', goal: 'Build the Focus Quest app', dur: 45 },
    { cat: 'reading', goal: 'Read Chapter 3 of textbook', dur: 25 },
    { cat: 'vocab', goal: 'Review 30 JLPT N4 kanji', dur: 15 },
    { cat: 'grammar', goal: 'Practice て-form conjugations', dur: 25 },
    { cat: 'assignment', goal: 'Write essay introduction', dur: 60 },
  ];

  for (let i = 4; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);

    const numSessions = Math.floor(Math.random() * 3) + 1;
    for (let s = 0; s < numSessions; s++) {
      const sample = sampleGoals[Math.floor(Math.random() * sampleGoals.length)];
      const h = Math.floor(Math.random() * 10) + 8;
      const m = Math.floor(Math.random() * 60);
      const timeStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;

      state.history.unshift({
        id: Date.now() + Math.random(),
        date: dateStr,
        time: timeStr,
        category: sample.cat,
        goal: sample.goal,
        duration: sample.dur,
        xp: getXPForDuration(sample.dur),
        coins: getCoinsForDuration(sample.dur),
      });

      state.weeklyData[dateStr] = (state.weeklyData[dateStr] || 0) + sample.dur;
    }

    // Add garden plants
    for (let g = 0; g < numSessions; g++) addGardenPlant();
  }

  // Seed some XP and progress
  const totalXp = state.history.reduce((a,h) => a + h.xp, 0);
  state.xp = totalXp;
  state.coins = state.history.reduce((a,h) => a + h.coins, 0);

  // Resolve levels
  while (state.xp >= XP_PER_LEVEL(state.level)) {
    state.xp -= XP_PER_LEVEL(state.level);
    state.level += 1;
    state.coins += LEVEL_UP_BONUS_COINS;
  }

  // Streak
  state.streak = 5;
  state.longestStreak = 7;
  state.lastStudyDate = todayStr();
}

// ─────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────
function init() {
  loadState();
  checkDailyReset();
  seedDemoData();

  // Apply saved theme
  document.documentElement.setAttribute('data-theme', state.theme || 'dark');

  saveState();
  bindEvents();
  updateAllUI();

  // Start on dashboard
  navigateTo('dashboard');

  // Default duration selection UI sync
  const default25 = document.querySelector('.dur-btn[data-min="25"]');
  if (default25) {
    default25.classList.add('active');
    default25.setAttribute('aria-pressed', 'true');
  }
}

// Boot
document.addEventListener('DOMContentLoaded', init);
