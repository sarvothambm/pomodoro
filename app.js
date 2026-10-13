// Pulse Pomodoro - Universal Mobile & Desktop Core Engine
(function () {
  'use strict';

  // --- AUDIO SYNTHESIZER (Crisp Acoustic Chime with Dynamic Volume & Mobile Keep-Alive) ---
  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.isUnlocked = false;
      this.silentNode = null;
      const saved = localStorage.getItem('pulse_pomodoro_volume_v1');
      this.volume = saved !== null ? Math.max(0, Math.min(1, parseFloat(saved))) : 0.8;
      this.setupGlobalUnlock();
    }

    // Touch/click listener to unlock audio immediately on mobile Safari and Chrome
    setupGlobalUnlock() {
      const unlock = () => {
        this.init();
        ['touchstart', 'touchend', 'click', 'keydown'].forEach((evt) => {
          window.removeEventListener(evt, unlock);
        });
      };
      ['touchstart', 'touchend', 'click', 'keydown'].forEach((evt) => {
        window.addEventListener(evt, unlock, { passive: true });
      });
    }

    init() {
      if (!this.ctx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          this.ctx = new AudioContextClass();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      this.isUnlocked = true;
    }

    setVolume(val) {
      this.volume = Math.max(0, Math.min(1, parseFloat(val)));
      localStorage.setItem('pulse_pomodoro_volume_v1', this.volume.toString());
    }

    getVolume() {
      return this.volume;
    }

    // Mobile background keep-alive: keeps the audio thread awake when device is locked/backgrounded
    startKeepAlive() {
      this.init();
      if (!this.ctx || this.silentNode) return;
      try {
        const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const gain = this.ctx.createGain();
        gain.gain.value = 0.00001; // inaudible keep-alive signal
        source.connect(gain);
        gain.connect(this.ctx.destination);
        source.start();
        this.silentNode = { source, gain };
      } catch (e) {
        // Fallback silently if not allowed
      }
    }

    stopKeepAlive() {
      if (this.silentNode) {
        try {
          this.silentNode.source.stop();
          this.silentNode.source.disconnect();
        } catch (e) {}
        this.silentNode = null;
      }
    }

    // Play crisp acoustic chime / alert scaled by current volume
    // count: 1 (single chime) or 2 (double chime)
    playBeep(count = 1) {
      this.init();
      if (!this.ctx) return;

      const vol = this.volume;
      if (vol <= 0.001) return; // Muted

      const playChimeNote = (startTime, primaryFreq = 1046.5, secondaryFreq = 2093.0, duration = 0.55) => {
        // Fundamental oscillator (triangle wave has warmer audible harmonics than sine)
        const osc1 = this.ctx.createOscillator();
        const gain1 = this.ctx.createGain();

        // Overtone harmonic oscillator for clarity on laptop/phone speakers
        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();

        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(primaryFreq, startTime); // C6 bell tone

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(secondaryFreq, startTime); // High crystal sparkle

        // Punchy, clear attack and smooth resonant decay scaled by volume
        const peak1 = 0.75 * vol;
        const peak2 = 0.35 * vol;

        gain1.gain.setValueAtTime(0.0001, startTime);
        gain1.gain.linearRampToValueAtTime(peak1, startTime + 0.012);
        gain1.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

        gain2.gain.setValueAtTime(0.0001, startTime);
        gain2.gain.linearRampToValueAtTime(peak2, startTime + 0.01);
        gain2.gain.exponentialRampToValueAtTime(0.0001, startTime + (duration * 0.7));

        osc1.connect(gain1);
        gain1.connect(this.ctx.destination);

        osc2.connect(gain2);
        gain2.connect(this.ctx.destination);

        osc1.start(startTime);
        osc1.stop(startTime + duration + 0.05);

        osc2.start(startTime);
        osc2.stop(startTime + duration + 0.05);
      };

      const now = this.ctx.currentTime + 0.02;
      if (count === 1) {
        // High, distinct single chime (C6 = 1046.5Hz)
        playChimeNote(now, 1046.5, 2093.0, 0.55);
      } else if (count === 2) {
        // Double ascending chime (C6 -> E6 = 1318.5Hz) for long break
        playChimeNote(now, 1046.5, 2093.0, 0.45);
        playChimeNote(now + 0.28, 1318.5, 2637.0, 0.65);
      }
    }
  }

  // --- PERSISTENT STORAGE & STATS ENGINE ---
  class StatsEngine {
    constructor() {
      this.storageKey = 'pulse_pomodoro_stats_v1';
      this.load();
    }

    getTodayStr() {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    load() {
      try {
        const raw = localStorage.getItem(this.storageKey);
        this.data = raw ? JSON.parse(raw) : {};
      } catch (e) {
        this.data = {};
      }
      this.ensureToday();
    }

    save() {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(this.data));
      } catch (e) {
        console.error('Failed to save stats', e);
      }
    }

    ensureToday() {
      const today = this.getTodayStr();
      if (!this.data[today]) {
        this.data[today] = {
          focusMinutes: 0,
          completedWorkSessions: 0,
          completedShortBreaks: 0,
          completedLongBreaks: 0,
          history: [] // { id, time, type, durationMinutes }
        };
      }
    }

    recordSession(type, durationMinutes) {
      this.ensureToday();
      const today = this.getTodayStr();
      const record = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type, // 'work' | 'shortBreak' | 'longBreak'
        durationMinutes: Math.round(durationMinutes)
      };

      this.data[today].history.unshift(record);

      if (type === 'work') {
        this.data[today].focusMinutes += durationMinutes;
        this.data[today].completedWorkSessions += 1;
      } else if (type === 'shortBreak') {
        this.data[today].completedShortBreaks += 1;
      } else if (type === 'longBreak') {
        this.data[today].completedLongBreaks += 1;
      }

      this.save();
    }

    getTodaySummary() {
      this.ensureToday();
      const today = this.getTodayStr();
      return this.data[today];
    }

    getStreakDays() {
      let streak = 0;
      const today = new Date();
      for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const dayData = this.data[dateStr];
        if (dayData && dayData.completedWorkSessions > 0) {
          streak++;
        } else {
          // If today has 0, streak can still be counted if yesterday was active
          if (i === 0) continue;
          break;
        }
      }
      return streak;
    }

    getLast7DaysData() {
      const result = [];
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const today = new Date();

      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const dayName = days[d.getDay()];
        const dayData = this.data[dateStr] || { focusMinutes: 0, completedWorkSessions: 0 };
        result.push({
          dateStr,
          dayName,
          isToday: i === 0,
          minutes: dayData.focusMinutes,
          sessions: dayData.completedWorkSessions
        });
      }
      return result;
    }

    clearTodayHistory() {
      const today = this.getTodayStr();
      if (this.data[today]) {
        this.data[today] = {
          focusMinutes: 0,
          completedWorkSessions: 0,
          completedShortBreaks: 0,
          completedLongBreaks: 0,
          history: []
        };
        this.save();
      }
    }
  }

  // --- BACKGROUND & PERMISSIONS MANAGER ---
  class LaptopSystemManager {
    constructor(audioEngine) {
      this.audioEngine = audioEngine;
      this.wakeLock = null;
      this.isElectron = !!(window.electronAPI && window.electronAPI.isElectron);
      this.initServiceWorker();
    }

    initServiceWorker() {
      if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
        navigator.serviceWorker.register('sw.js').catch((err) => {
          console.warn('Service worker registration note:', err);
        });
      }
    }

    vibrate(pattern = [250, 100, 250]) {
      if ('vibrate' in navigator) {
        try {
          navigator.vibrate(pattern);
        } catch (e) {}
      }
    }

    async requestNotificationPermission() {
      if (this.isElectron) {
        return true;
      }
      if ('Notification' in window) {
        try {
          const res = await Notification.requestPermission();
          return res === 'granted';
        } catch (e) {
          return false;
        }
      }
      return false;
    }

    hasNotificationPermission() {
      if (this.isElectron) return true;
      return 'Notification' in window && Notification.permission === 'granted';
    }

    async requestWakeLock() {
      if ('wakeLock' in navigator) {
        try {
          this.wakeLock = await navigator.wakeLock.request('screen');
          this.wakeLock.addEventListener('release', () => {
            this.wakeLock = null;
          });
          return true;
        } catch (err) {
          console.warn('Wake Lock request note:', err);
          return false;
        }
      }
      return false;
    }

    releaseWakeLock() {
      if (this.wakeLock) {
        this.wakeLock.release().catch(() => {});
        this.wakeLock = null;
      }
    }

    notify(title, body) {
      this.vibrate([280, 120, 280]);
      if (this.isElectron && window.electronAPI.sendNotification) {
        window.electronAPI.sendNotification({ title, body, silent: false });
      } else if (this.hasNotificationPermission()) {
        try {
          const n = new Notification(title, {
            body,
            icon: 'icon.png',
            badge: 'icon.png',
            vibrate: [280, 120, 280]
          });
          n.onclick = () => {
            window.focus();
            if (this.isElectron && window.electronAPI.showWindow) {
              window.electronAPI.showWindow();
            }
          };
        } catch (e) {
          console.warn('HTML5 notification error', e);
        }
      }
    }

    setPowerBlocker(enable) {
      if (this.isElectron && window.electronAPI.setPowerSaveBlocker) {
        window.electronAPI.setPowerSaveBlocker(enable);
      }
      if (enable) {
        this.requestWakeLock();
      } else {
        this.releaseWakeLock();
      }
    }

    updateTray(status, timeRemaining, isRunning) {
      if (this.isElectron && window.electronAPI.updateTray) {
        window.electronAPI.updateTray({ status, timeRemaining, isRunning });
      }
    }

    minimizeToTray() {
      if (this.isElectron && window.electronAPI.minimizeToTray) {
        window.electronAPI.minimizeToTray();
      }
    }
  }

  // --- CORE POMODORO APPLICATION CONTROLLER ---
  class PomodoroApp {
    constructor() {
      this.audio = new AudioEngine();
      this.stats = new StatsEngine();
      this.system = new LaptopSystemManager(this.audio);

      // Default durations in seconds (fully editable)
      this.config = {
        workDuration: 25 * 60, // 25 min default
        shortBreakDuration: 5 * 60, // 5 min default
        longBreakDuration: 15 * 60, // 15 min default
        targetIntervals: 4, // 4 work sessions, 3 short breaks, then 15m long break
        autoStartBreaks: true, // Seamless uninterrupted flow: automatically starts breaks!
        autoStartFocus: true  // Automatically starts next focus session after break!
      };

      this.loadSettings();

      // State
      this.mode = 'work'; // 'work' | 'shortBreak' | 'longBreak'
      this.round = 1; // 1 to 4
      this.timeRemaining = this.config.workDuration;
      this.totalDuration = this.config.workDuration;
      this.isRunning = false;
      this.targetEndTime = null;

      // Web Worker background timer
      this.worker = null;
      this.initWorker();

      // DOM Elements cache
      this.initDOMElements();
      this.bindEvents();
      this.updateUI();
      this.renderDashboard();
      this.checkPermissionsStatus();

      // Hook Electron Tray Events
      if (this.system.isElectron && window.electronAPI.onTrayAction) {
        window.electronAPI.onTrayAction((action) => this.handleTrayAction(action));
      }
    }

    loadSettings() {
      try {
        const savedV2 = localStorage.getItem('pulse_pomodoro_config_v2');
        if (savedV2) {
          const parsed = JSON.parse(savedV2);
          this.config = { ...this.config, ...parsed };
        } else {
          const savedV1 = localStorage.getItem('pulse_pomodoro_config_v1');
          if (savedV1) {
            const parsedV1 = JSON.parse(savedV1);
            this.config = { ...this.config, ...parsedV1, autoStartBreaks: true, autoStartFocus: true };
          }
        }
        if (this.config.autoStartBreaks === undefined) this.config.autoStartBreaks = true;
        if (this.config.autoStartFocus === undefined) this.config.autoStartFocus = true;
      } catch (e) {
        console.warn('Could not parse settings', e);
      }
    }

    saveSettings() {
      try {
        localStorage.setItem('pulse_pomodoro_config_v2', JSON.stringify(this.config));
        localStorage.setItem('pulse_pomodoro_config_v1', JSON.stringify(this.config));
      } catch (e) {
        console.error('Failed to save settings', e);
      }
    }

    initWorker() {
      try {
        this.worker = new Worker('worker.js');
        this.worker.onmessage = (e) => {
          if (e.data.type === 'tick') {
            this.handleTick();
          }
        };
      } catch (e) {
        console.warn('Web Worker initialization failed, using fallback interval', e);
        setInterval(() => this.handleTick(), 250);
      }
    }

    initDOMElements() {
      // Permission UI
      this.permissionCard = document.getElementById('permission-card');
      this.permissionStatusBadge = document.getElementById('permission-status-badge');
      this.btnGrantAll = document.getElementById('btn-grant-all');
      this.btnEnableAudio = document.getElementById('btn-enable-audio');
      this.btnEnableNotif = document.getElementById('btn-enable-notif');
      this.btnEnableWake = document.getElementById('btn-enable-wake');

      // Timer Display
      this.timeDisplay = document.getElementById('time-display');
      this.sessionTypeBadge = document.getElementById('session-type-badge');
      this.sessionRoundIndicator = document.getElementById('session-round-indicator');
      this.progressRing = document.getElementById('progress-ring-circle');
      this.intervalPills = document.querySelectorAll('.interval-pill');

      // Primary Controls
      this.btnToggle = document.getElementById('btn-toggle');
      this.btnToggleIcon = document.getElementById('btn-toggle-icon');
      this.btnToggleText = document.getElementById('btn-toggle-text');
      this.btnSkip = document.getElementById('btn-skip');
      this.btnReset = document.getElementById('btn-reset');
      this.btnTestBeep = document.getElementById('btn-test-beep');
      this.btnMinimizeTray = document.getElementById('btn-minimize-tray');

      // Presets & Quick Customizer
      this.preset25 = document.getElementById('preset-25');
      this.preset30 = document.getElementById('preset-30');
      this.presetBreak5 = document.getElementById('preset-break-5');
      this.presetBreak15 = document.getElementById('preset-break-15');

      this.quickWorkMin = document.getElementById('quick-work-min');
      this.quickShortMin = document.getElementById('quick-short-min');
      this.quickLongMin = document.getElementById('quick-long-min');
      this.quickIntervals = document.getElementById('quick-intervals');
      this.btnApplyCustom = document.getElementById('btn-apply-custom');
      this.timerStatusCaption = document.getElementById('timer-status-caption');

      // Sync customizer inputs with initial config
      if (this.quickWorkMin) this.quickWorkMin.value = Math.round(this.config.workDuration / 60);
      if (this.quickShortMin) this.quickShortMin.value = Math.round(this.config.shortBreakDuration / 60);
      if (this.quickLongMin) this.quickLongMin.value = Math.round(this.config.longBreakDuration / 60);
      if (this.quickIntervals) this.quickIntervals.value = this.config.targetIntervals;

      // Navigation & Views
      this.navTimer = document.getElementById('nav-timer');
      this.navDashboard = document.getElementById('nav-dashboard');
      this.navSettings = document.getElementById('nav-settings');
      this.viewTimer = document.getElementById('view-timer');
      this.viewDashboard = document.getElementById('view-dashboard');
      this.modalSettings = document.getElementById('modal-settings');
      this.btnCloseSettings = document.getElementById('btn-close-settings');

      // Settings Inputs
      this.inputWorkMin = document.getElementById('input-work-min');
      this.inputShortBreakMin = document.getElementById('input-short-break-min');
      this.inputLongBreakMin = document.getElementById('input-long-break-min');
      this.inputTargetIntervals = document.getElementById('input-target-intervals');
      this.toggleAutoBreak = document.getElementById('toggle-auto-break');
      this.toggleAutoWork = document.getElementById('toggle-auto-work');

      // Dashboard Elements
      this.statTodayMinutes = document.getElementById('stat-today-minutes');
      this.statTodaySessions = document.getElementById('stat-today-sessions');
      this.statStreak = document.getElementById('stat-streak');
      this.statCompletionPercent = document.getElementById('stat-completion-percent');
      this.statProgressBar = document.getElementById('stat-progress-bar');
      this.chartContainer = document.getElementById('weekly-chart-bars');
      this.historyList = document.getElementById('history-list');
      this.btnClearHistory = document.getElementById('btn-clear-history');

      // Volume & Sound Check Controls
      this.volumeSlider = document.getElementById('volume-slider');
      this.volumeVal = document.getElementById('volume-val');
      this.volumeIcon = document.getElementById('volume-icon');
      this.btnVolDown = document.getElementById('btn-vol-down');
      this.btnVolUp = document.getElementById('btn-vol-up');
      this.btnCheckSound = document.getElementById('btn-check-sound');
      this.btnCheckSoundText = document.getElementById('btn-check-sound-text');
      this.settingsVolumeSlider = document.getElementById('settings-volume-slider');
      this.settingsVolumeVal = document.getElementById('settings-volume-val');
      this.btnSettingsCheckSound = document.getElementById('btn-settings-check-sound');
      this.deviceBgIndicator = document.getElementById('device-bg-indicator');
      this.bgDeviceIcon = document.getElementById('bg-device-icon');
      this.bgDeviceText = document.getElementById('bg-device-text');

      // Initialize volume displays
      const currentVol = Math.round(this.audio.getVolume() * 100);
      this.updateVolumeUI(currentVol);

      // Desktop Banner Indicator & Mobile detection
      this.desktopStatusBadge = document.getElementById('desktop-tray-status');
      this.updateDeviceStatus();
    }

    bindEvents() {
      // Permission buttons
      this.btnEnableAudio?.addEventListener('click', () => {
        this.audio.init();
        this.audio.playBeep(1);
        this.checkPermissionsStatus();
      });

      this.btnEnableNotif?.addEventListener('click', async () => {
        await this.system.requestNotificationPermission();
        this.system.notify('Pulse Pomodoro', 'Laptop notifications successfully activated!');
        this.checkPermissionsStatus();
      });

      this.btnEnableWake?.addEventListener('click', async () => {
        await this.system.requestWakeLock();
        this.checkPermissionsStatus();
      });

      this.btnGrantAll?.addEventListener('click', async () => {
        this.audio.init();
        this.audio.playBeep(1);
        await this.system.requestNotificationPermission();
        await this.system.requestWakeLock();
        this.system.notify('Pulse Pomodoro', 'All system permissions granted! Ready to focus.');
        this.checkPermissionsStatus();
      });

      // Timer Controls
      this.btnToggle.addEventListener('click', () => this.toggleTimer());
      this.btnSkip.addEventListener('click', () => this.skipSession());
      this.btnReset.addEventListener('click', () => this.resetTimer());
      this.btnTestBeep?.addEventListener('click', () => {
        this.audio.playBeep(1);
      });

      // Alert Volume Slider & Step Buttons
      this.volumeSlider?.addEventListener('input', (e) => {
        this.setVolumePercent(parseInt(e.target.value, 10));
      });
      this.settingsVolumeSlider?.addEventListener('input', (e) => {
        this.setVolumePercent(parseInt(e.target.value, 10));
      });

      this.btnVolDown?.addEventListener('click', () => {
        const cur = Math.round(this.audio.getVolume() * 100);
        this.setVolumePercent(Math.max(0, cur - 10));
      });

      this.btnVolUp?.addEventListener('click', () => {
        const cur = Math.round(this.audio.getVolume() * 100);
        this.setVolumePercent(Math.min(100, cur + 10));
      });

      // Sound Check Action Buttons (Immediate Audio & Haptic check)
      this.btnCheckSound?.addEventListener('click', () => this.checkSound());
      this.btnSettingsCheckSound?.addEventListener('click', () => this.checkSound());

      // Mobile & Web Background Lifecycle Handlers (Drift-proof recovery)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.isRunning) {
          this.handleTick();
          this.system.setPowerBlocker(true);
        }
      });
      window.addEventListener('focus', () => {
        if (this.isRunning) this.handleTick();
      });

      if (this.btnMinimizeTray) {
        this.btnMinimizeTray.addEventListener('click', () => {
          this.system.minimizeToTray();
        });
      }

      // Presets
      this.preset25?.addEventListener('click', () => this.applyPreset('work', 25));
      this.preset30?.addEventListener('click', () => this.applyPreset('work', 30));
      this.presetBreak5?.addEventListener('click', () => this.applyPreset('shortBreak', 5));
      this.presetBreak15?.addEventListener('click', () => this.applyPreset('longBreak', 15));

      // Apply button in dedicated customizer section
      this.btnApplyCustom?.addEventListener('click', () => {
        this.applyCustomizerInputs();
      });

      // Also auto-apply on input change
      [this.quickWorkMin, this.quickShortMin, this.quickLongMin, this.quickIntervals].forEach((input) => {
        input?.addEventListener('change', () => this.applyCustomizerInputs());
      });

      // Quick edit on click countdown
      this.timeDisplay.addEventListener('click', () => {
        if (!this.isRunning) {
          const currentMins = Math.round(this.timeRemaining / 60);
          const entered = prompt(`Set duration in minutes for current ${this.getModeTitle()} session:`, currentMins);
          if (entered !== null) {
            const val = parseInt(entered, 10);
            if (!isNaN(val) && val > 0 && val <= 180) {
              this.setDurationMinutes(val);
            }
          }
        }
      });

      // Navigation
      this.navTimer.addEventListener('click', () => this.switchView('timer'));
      this.navDashboard.addEventListener('click', () => this.switchView('dashboard'));
      this.navSettings.addEventListener('click', () => this.openSettings());
      this.btnCloseSettings.addEventListener('click', () => this.closeSettings());

      // Settings modal outside click
      this.modalSettings.addEventListener('click', (e) => {
        if (e.target === this.modalSettings) this.closeSettings();
      });

      // Clear history
      this.btnClearHistory?.addEventListener('click', () => {
        if (confirm('Clear today\'s session history log?')) {
          this.stats.clearTodayHistory();
          this.renderDashboard();
        }
      });

      // Keyboard shortcuts
      window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        if (e.code === 'Space') {
          e.preventDefault();
          this.toggleTimer();
        } else if (e.key === 's' || e.key === 'S') {
          this.skipSession();
        } else if (e.key === 'r' || e.key === 'R') {
          this.resetTimer();
        } else if (e.key === 'm' || e.key === 'M') {
          this.audio.playBeep(1);
        } else if (e.key === 'd' || e.key === 'D') {
          this.switchView(this.viewDashboard.classList.contains('active') ? 'timer' : 'dashboard');
        } else if (e.key === 'Escape') {
          this.closeSettings();
        }
      });
    }

    checkPermissionsStatus() {
      const audioOk = this.audio.isUnlocked;
      const notifOk = this.system.hasNotificationPermission();

      if (audioOk && notifOk) {
        if (this.permissionCard) this.permissionCard.style.display = 'none';
        if (this.permissionStatusBadge) {
          this.permissionStatusBadge.innerHTML = '<span class="status-dot green"></span> Permissions: Active & Ready';
          this.permissionStatusBadge.classList.add('badge-granted');
        }
      } else {
        if (this.permissionCard) this.permissionCard.style.display = 'block';
        if (this.permissionStatusBadge) {
          this.permissionStatusBadge.innerHTML = '<span class="status-dot amber"></span> Permissions: Action Needed';
          this.permissionStatusBadge.classList.remove('badge-granted');
        }
      }

      if (this.btnEnableAudio) {
        this.btnEnableAudio.textContent = audioOk ? '✓ Audio Sound Ready' : '🔊 Enable Audio & Sound';
        this.btnEnableAudio.disabled = audioOk;
      }
      if (this.btnEnableNotif) {
        this.btnEnableNotif.textContent = notifOk ? '✓ Notifications Active' : '🔔 Enable Background Notifications';
        this.btnEnableNotif.disabled = notifOk;
      }
    }

    handleTrayAction(action) {
      if (action === 'toggle') {
        this.toggleTimer();
      } else if (action === 'skip') {
        this.skipSession();
      } else if (action === 'reset') {
        this.resetTimer();
      } else if (action === 'set-25') {
        this.applyPreset('work', 25);
      } else if (action === 'set-30') {
        this.applyPreset('work', 30);
      } else if (action === 'set-5') {
        this.applyPreset('shortBreak', 5);
      } else if (action === 'set-15') {
        this.applyPreset('longBreak', 15);
      } else if (action === 'open-dashboard') {
        this.switchView('dashboard');
      }
    }

    applyPreset(type, minutes) {
      this.mode = type;
      if (type === 'work') {
        this.config.workDuration = minutes * 60;
        if (this.quickWorkMin) this.quickWorkMin.value = minutes;
      } else if (type === 'shortBreak') {
        this.config.shortBreakDuration = minutes * 60;
        if (this.quickShortMin) this.quickShortMin.value = minutes;
      } else if (type === 'longBreak') {
        this.config.longBreakDuration = minutes * 60;
        if (this.quickLongMin) this.quickLongMin.value = minutes;
      }

      // Update preset chips active state
      [this.preset25, this.preset30, this.presetBreak5, this.presetBreak15].forEach(btn => btn?.classList.remove('active'));
      if (type === 'work' && minutes === 25) this.preset25?.classList.add('active');
      if (type === 'work' && minutes === 30) this.preset30?.classList.add('active');
      if (type === 'shortBreak' && minutes === 5) this.presetBreak5?.classList.add('active');
      if (type === 'longBreak' && minutes === 15) this.presetBreak15?.classList.add('active');

      this.totalDuration = minutes * 60;
      this.timeRemaining = this.totalDuration;
      if (this.isRunning) {
        this.stopTimer();
      }
      this.saveSettings();
      this.updateUI();
    }

    applyCustomizerInputs() {
      const workM = parseInt(this.quickWorkMin?.value, 10);
      const shortM = parseInt(this.quickShortMin?.value, 10);
      const longM = parseInt(this.quickLongMin?.value, 10);
      const intervals = parseInt(this.quickIntervals?.value, 10);

      if (!isNaN(workM) && workM > 0 && workM <= 180) {
        this.config.workDuration = workM * 60;
      }
      if (!isNaN(shortM) && shortM > 0 && shortM <= 60) {
        this.config.shortBreakDuration = shortM * 60;
      }
      if (!isNaN(longM) && longM > 0 && longM <= 120) {
        this.config.longBreakDuration = longM * 60;
      }
      if (!isNaN(intervals) && intervals >= 2 && intervals <= 12) {
        this.config.targetIntervals = intervals;
      }

      // If timer is not currently ticking, immediately update active session duration
      if (!this.isRunning) {
        if (this.mode === 'work') {
          this.totalDuration = this.config.workDuration;
          this.timeRemaining = this.config.workDuration;
        } else if (this.mode === 'shortBreak') {
          this.totalDuration = this.config.shortBreakDuration;
          this.timeRemaining = this.config.shortBreakDuration;
        } else if (this.mode === 'longBreak') {
          this.totalDuration = this.config.longBreakDuration;
          this.timeRemaining = this.config.longBreakDuration;
        }
      }

      this.saveSettings();
      this.updateUI();

      // Visual feedback
      if (this.btnApplyCustom) {
        const originalText = this.btnApplyCustom.textContent;
        this.btnApplyCustom.textContent = '✓ Saved & Applied!';
        setTimeout(() => {
          this.btnApplyCustom.textContent = originalText;
        }, 1200);
      }
    }

    setDurationMinutes(minutes) {
      const secs = minutes * 60;
      if (this.mode === 'work') {
        this.config.workDuration = secs;
        if (this.quickWorkMin) this.quickWorkMin.value = minutes;
      } else if (this.mode === 'shortBreak') {
        this.config.shortBreakDuration = secs;
        if (this.quickShortMin) this.quickShortMin.value = minutes;
      } else if (this.mode === 'longBreak') {
        this.config.longBreakDuration = secs;
        if (this.quickLongMin) this.quickLongMin.value = minutes;
      }
      this.totalDuration = secs;
      this.timeRemaining = secs;
      this.saveSettings();
      this.updateUI();
    }

    toggleTimer() {
      // First click unlocks audio context if not already done
      this.audio.init();

      if (this.isRunning) {
        this.stopTimer();
      } else {
        this.startTimer();
      }
    }

    async startTimer() {
      this.isRunning = true;
      this.targetEndTime = Date.now() + this.timeRemaining * 1000;

      // Ask for notification permission on start if default
      if (!this.system.isElectron && 'Notification' in window && Notification.permission === 'default') {
        this.system.requestNotificationPermission().then(() => this.checkPermissionsStatus());
      }

      this.audio.startKeepAlive();
      this.system.setPowerBlocker(true);

      if (this.worker) {
        this.worker.postMessage({ command: 'start', intervalMs: 250 });
      }

      this.updateUI();
    }

    stopTimer() {
      this.isRunning = false;
      this.targetEndTime = null;
      this.audio.stopKeepAlive();
      this.system.setPowerBlocker(false);

      if (this.worker) {
        this.worker.postMessage({ command: 'stop' });
      }

      this.updateUI();
    }

    resetTimer() {
      this.stopTimer();
      if (this.mode === 'work') {
        this.timeRemaining = this.config.workDuration;
        this.totalDuration = this.config.workDuration;
      } else if (this.mode === 'shortBreak') {
        this.timeRemaining = this.config.shortBreakDuration;
        this.totalDuration = this.config.shortBreakDuration;
      } else if (this.mode === 'longBreak') {
        this.timeRemaining = this.config.longBreakDuration;
        this.totalDuration = this.config.longBreakDuration;
      }
      this.updateUI();
    }

    skipSession() {
      const wasRunning = this.isRunning;
      this.stopTimer();
      this.completeSession(true, wasRunning); // mark completed / transition
    }

    handleTick() {
      if (!this.isRunning || !this.targetEndTime) return;

      const now = Date.now();
      const diffMs = this.targetEndTime - now;
      const remainingSecs = Math.max(0, Math.ceil(diffMs / 1000));

      this.timeRemaining = remainingSecs;
      this.updateUI();

      if (remainingSecs <= 0) {
        this.stopTimer();
        this.completeSession(false);
      }
    }

    // THE CRITICAL WORKFLOW SPECIFIED BY THE USER:
    // 1. Work Session ends -> 1 BEEP -> Automatically start 5 min break.
    // 2. 5 min break ends -> 1 BEEP -> Automatically start Work Session.
    // 3. Repeats for 3 intervals (round 1 work/break, round 2 work/break, round 3 work/break).
    // 4. On completing the 4th interval (work session 4, after 3 short breaks) -> TWICE BEEP -> Automatically start 15 min long break!
    // 5. After 15 min long break -> 1 BEEP -> Automatically restarts interval 1.
    completeSession(isSkipped = false, wasRunning = false) {
      this.system.vibrate([280, 120, 280]);
      const finishedMode = this.mode;
      const finishedMinutes = this.totalDuration / 60;

      // Log statistics if finished naturally or user focused
      if (!isSkipped || finishedMode === 'work') {
        this.stats.recordSession(finishedMode, finishedMinutes);
        this.renderDashboard();
      }

      // Automatically chain into next session without requiring manual Start click
      const shouldAutoRun = !isSkipped || wasRunning;

      if (finishedMode === 'work') {
        // Did we just finish interval 4 (or config.targetIntervals)?
        if (this.round >= this.config.targetIntervals) {
          // USER SPECIFICATION: 4th interval finished -> TWICE BEEP -> 15 min long break
          this.audio.playBeep(2); // TWICE BEEP!
          this.system.notify(
            '🌟 4 Intervals Completed! Long Break Time',
            'Spectacular focus! Entering 15 min long break. (Twice beep played)'
          );

          // Transition to Long Break
          this.mode = 'longBreak';
          this.totalDuration = this.config.longBreakDuration;
          this.timeRemaining = this.config.longBreakDuration;

          // Seamlessly auto-start long break
          if (shouldAutoRun || this.config.autoStartBreaks !== false) {
            this.startTimer();
          }
        } else {
          // Standard interval finished (1, 2, or 3) -> 1 single clean beep -> 5 min short break
          this.audio.playBeep(1); // 1 single clean beep
          this.system.notify(
            `🔔 Focus Interval ${this.round} Complete`,
            `Time for a 5-minute restorative short break! (Single beep played)`
          );

          // Transition to Short Break
          this.mode = 'shortBreak';
          this.totalDuration = this.config.shortBreakDuration;
          this.timeRemaining = this.config.shortBreakDuration;

          // Seamlessly auto-start short break
          if (shouldAutoRun || this.config.autoStartBreaks !== false) {
            this.startTimer();
          }
        }
      } else if (finishedMode === 'shortBreak') {
        // Short break ended -> Single beep -> advance round -> Work session
        this.audio.playBeep(1); // 1 single clean beep
        this.round += 1;

        this.system.notify(
          `⚡ Short Break Over (Interval ${this.round} of ${this.config.targetIntervals})`,
          `Ready to dive back into deep focus! (Single beep played)`
        );

        this.mode = 'work';
        this.totalDuration = this.config.workDuration;
        this.timeRemaining = this.config.workDuration;

        // Seamlessly auto-start next focus session
        if (shouldAutoRun || this.config.autoStartFocus !== false) {
          this.startTimer();
        }
      } else if (finishedMode === 'longBreak') {
        // Long break finished -> Single beep -> Reset cycle to round 1
        this.audio.playBeep(1); // 1 single clean beep
        this.round = 1;

        this.system.notify(
          '🎯 Cycle Complete & Refreshed!',
          'Long break finished. Starting a fresh 4-interval cycle. (Single beep played)'
        );

        this.mode = 'work';
        this.totalDuration = this.config.workDuration;
        this.timeRemaining = this.config.workDuration;

        // Seamlessly auto-start fresh focus session
        if (shouldAutoRun || this.config.autoStartFocus !== false) {
          this.startTimer();
        }
      }

      this.updateUI();
    }

    formatTime(seconds) {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    getModeTitle() {
      if (this.mode === 'work') return 'Focus Session';
      if (this.mode === 'shortBreak') return 'Short Break';
      return 'Long Break';
    }

    updateUI() {
      const timeStr = this.formatTime(this.timeRemaining);
      this.timeDisplay.textContent = timeStr;

      // Update Title & Favicon
      const modeShort = this.mode === 'work' ? 'Focus' : this.mode === 'shortBreak' ? 'Break' : 'Long Break';
      document.title = `${timeStr} • ${modeShort} (${this.round}/${this.config.targetIntervals}) - Pulse Pomodoro`;

      // Update Session Type Badge
      this.sessionTypeBadge.className = `session-badge mode-${this.mode}`;
      if (this.mode === 'work') {
        this.sessionTypeBadge.innerHTML = `<span class="badge-pulse"></span> FOCUS SESSION`;
      } else if (this.mode === 'shortBreak') {
        this.sessionTypeBadge.innerHTML = `<span class="badge-pulse"></span> SHORT BREAK (5m)`;
      } else {
        this.sessionTypeBadge.innerHTML = `<span class="badge-pulse"></span> LONG BREAK (15m)`;
      }

      // Round indicator caption
      if (this.mode === 'work') {
        const nextBreakType = this.round >= this.config.targetIntervals ? '15m Long Break (Twice Beep)' : '5m Short Break (Beep)';
        this.sessionRoundIndicator.textContent = `Interval ${this.round} of ${this.config.targetIntervals} • Next up: ${nextBreakType}`;
      } else if (this.mode === 'shortBreak') {
        this.sessionRoundIndicator.textContent = `Short Break ${this.round} of 3 • Next: Focus Interval ${this.round + 1}`;
      } else {
        this.sessionRoundIndicator.textContent = `Long Break (After 3 Short Breaks) • Cycle Completed`;
      }

      // Interval step pills
      this.intervalPills.forEach((pill, idx) => {
        const pillRound = idx + 1;
        pill.classList.remove('active', 'completed', 'long-break-target');

        if (pillRound === 4) {
          pill.classList.add('long-break-target');
        }

        if (pillRound < this.round) {
          pill.classList.add('completed');
        } else if (pillRound === this.round) {
          pill.classList.add('active');
        }
      });

      // SVG Progress Ring
      if (this.progressRing) {
        const circumference = 2 * Math.PI * 130; // r=130
        const progress = this.totalDuration > 0 ? (this.totalDuration - this.timeRemaining) / this.totalDuration : 0;
        const offset = circumference * (1 - progress);
        this.progressRing.style.strokeDashoffset = offset;

        // Color theme and glow dynamically tuned to the shader background
        if (this.mode === 'work') {
          this.progressRing.style.stroke = 'url(#gradient-work)';
          this.progressRing.style.filter = 'drop-shadow(0 0 10px rgba(255, 84, 48, 0.45))';
          this.timeDisplay.style.textShadow = '0 2px 24px rgba(255, 84, 48, 0.28)';
        } else if (this.mode === 'shortBreak') {
          this.progressRing.style.stroke = 'url(#gradient-break)';
          this.progressRing.style.filter = 'drop-shadow(0 0 10px rgba(219, 186, 16, 0.45))';
          this.timeDisplay.style.textShadow = '0 2px 24px rgba(219, 186, 16, 0.28)';
        } else {
          this.progressRing.style.stroke = 'url(#gradient-long)';
          this.progressRing.style.filter = 'drop-shadow(0 0 10px rgba(200, 178, 228, 0.45))';
          this.timeDisplay.style.textShadow = '0 2px 24px rgba(200, 178, 228, 0.28)';
        }
      }

      // Toggle Button State
      if (this.isRunning) {
        this.btnToggle.classList.add('running');
        this.btnToggleIcon.textContent = '⏸';
        this.btnToggleText.textContent = 'Pause';
      } else {
        this.btnToggle.classList.remove('running');
        this.btnToggleIcon.textContent = '▶';
        this.btnToggleText.textContent = this.timeRemaining < this.totalDuration ? 'Resume' : 'Start Focus';
      }

      // Status Caption Update
      if (this.timerStatusCaption) {
        if (this.isRunning) {
          this.timerStatusCaption.textContent = this.mode === 'work' ? 'DEEP FOCUSING' : 'REST & RECHARGE';
        } else if (this.timeRemaining < this.totalDuration) {
          this.timerStatusCaption.textContent = 'PAUSED';
        } else {
          this.timerStatusCaption.textContent = 'READY TO FOCUS';
        }
      }

      // System Tray sync
      this.system.updateTray(modeShort, timeStr, this.isRunning);
    }

    switchView(viewName) {
      if (viewName === 'timer') {
        this.navTimer.classList.add('active');
        this.navDashboard.classList.remove('active');
        this.viewTimer.classList.add('active');
        this.viewDashboard.classList.remove('active');
      } else if (viewName === 'dashboard') {
        this.navDashboard.classList.add('active');
        this.navTimer.classList.remove('active');
        this.viewDashboard.classList.add('active');
        this.viewTimer.classList.remove('active');
        this.renderDashboard();
      }
    }

    renderDashboard() {
      const summary = this.stats.getTodaySummary();
      const streak = this.stats.getStreakDays();

      // Today focus hours and minutes
      const totalMinutes = summary.focusMinutes || 0;
      const hours = Math.floor(totalMinutes / 60);
      const mins = Math.round(totalMinutes % 60);
      this.statTodayMinutes.textContent = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

      // Sessions completed
      const sessions = summary.completedWorkSessions || 0;
      this.statTodaySessions.textContent = `${sessions}`;

      // Streak
      this.statStreak.textContent = `${streak} ${streak === 1 ? 'Day' : 'Days'}`;

      // Target progress (Target: 8 sessions or customizable)
      const targetDailySessions = 8;
      const percent = Math.min(100, Math.round((sessions / targetDailySessions) * 100));
      this.statCompletionPercent.textContent = `${sessions} / ${targetDailySessions} (${percent}%)`;
      this.statProgressBar.style.width = `${percent}%`;

      // 7-day Bar chart
      const weekData = this.stats.getLast7DaysData();
      const maxMins = Math.max(60, ...weekData.map((d) => d.minutes));

      this.chartContainer.innerHTML = '';
      weekData.forEach((day) => {
        const barHeightPercent = Math.max(8, Math.round((day.minutes / maxMins) * 100));
        const barCol = document.createElement('div');
        barCol.className = `chart-col ${day.isToday ? 'is-today' : ''}`;
        barCol.innerHTML = `
          <div class="bar-value">${day.minutes > 0 ? `${Math.round(day.minutes)}m` : '0'}</div>
          <div class="bar-track">
            <div class="bar-fill" style="height: ${barHeightPercent}%;"></div>
          </div>
          <div class="bar-label">${day.dayName}</div>
        `;
        this.chartContainer.appendChild(barCol);
      });

      // History Log List
      const history = summary.history || [];
      if (history.length === 0) {
        this.historyList.innerHTML = `
          <div class="history-empty">
            <div class="empty-icon">☕</div>
            <div>No intervals completed yet today. Ready when you are!</div>
          </div>
        `;
      } else {
        this.historyList.innerHTML = '';
        history.slice(0, 15).forEach((item) => {
          const itemEl = document.createElement('div');
          itemEl.className = 'history-item';

          let typeLabel = 'Focus Session';
          let badgeClass = 'history-work';
          if (item.type === 'shortBreak') {
            typeLabel = 'Short Break';
            badgeClass = 'history-short';
          } else if (item.type === 'longBreak') {
            typeLabel = 'Long Break';
            badgeClass = 'history-long';
          }

          itemEl.innerHTML = `
            <div class="history-left">
              <span class="history-badge ${badgeClass}">${typeLabel}</span>
              <span class="history-duration">${item.durationMinutes} min completed</span>
            </div>
            <div class="history-right">
              <span class="history-time">${item.time}</span>
              <span class="history-check">✓</span>
            </div>
          `;
          this.historyList.appendChild(itemEl);
        });
      }
    }

    openSettings() {
      this.inputWorkMin.value = Math.round(this.config.workDuration / 60);
      this.inputShortBreakMin.value = Math.round(this.config.shortBreakDuration / 60);
      this.inputLongBreakMin.value = Math.round(this.config.longBreakDuration / 60);
      this.inputTargetIntervals.value = this.config.targetIntervals;
      this.toggleAutoBreak.checked = this.config.autoStartBreaks;
      this.toggleAutoWork.checked = this.config.autoStartFocus;

      const currentVol = Math.round(this.audio.getVolume() * 100);
      if (this.settingsVolumeSlider) this.settingsVolumeSlider.value = currentVol;
      if (this.settingsVolumeVal) this.settingsVolumeVal.textContent = `${currentVol}%`;

      this.modalSettings.classList.add('open');
    }

    setVolumePercent(percent) {
      const clamped = Math.max(0, Math.min(100, percent));
      this.audio.setVolume(clamped / 100);
      this.updateVolumeUI(clamped);
    }

    updateVolumeUI(percent) {
      if (this.volumeSlider) this.volumeSlider.value = percent;
      if (this.settingsVolumeSlider) this.settingsVolumeSlider.value = percent;
      if (this.volumeVal) this.volumeVal.textContent = `${percent}%`;
      if (this.settingsVolumeVal) this.settingsVolumeVal.textContent = `${percent}%`;

      if (this.volumeIcon) {
        if (percent === 0) {
          this.volumeIcon.textContent = '🔇';
        } else if (percent < 50) {
          this.volumeIcon.textContent = '🔉';
        } else {
          this.volumeIcon.textContent = '🔊';
        }
      }
    }

    checkSound() {
      this.audio.init();
      this.audio.playBeep(1);
      this.system.vibrate([160]);

      if (this.btnCheckSound) {
        this.btnCheckSound.classList.add('playing');
        if (this.btnCheckSoundText) {
          const original = this.btnCheckSoundText.textContent;
          this.btnCheckSoundText.textContent = '✓ Sound Playing';
          setTimeout(() => {
            this.btnCheckSound.classList.remove('playing');
            this.btnCheckSoundText.textContent = original;
          }, 800);
        }
      }

      if (this.btnSettingsCheckSound) {
        this.btnSettingsCheckSound.classList.add('playing');
        setTimeout(() => this.btnSettingsCheckSound.classList.remove('playing'), 800);
      }
    }

    updateDeviceStatus() {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 680);
      if (this.desktopStatusBadge) {
        if (this.system.isElectron) {
          this.desktopStatusBadge.innerHTML = '<span class="dot-online"></span> System Tray Active (Win/macOS)';
          if (this.btnMinimizeTray) this.btnMinimizeTray.style.display = 'inline-flex';
        } else if (isMobile) {
          this.desktopStatusBadge.innerHTML = '<span class="dot-online"></span> Mobile Background Ready';
        } else {
          this.desktopStatusBadge.innerHTML = '<span class="dot-online"></span> Background Ready';
        }
      }
      if (this.bgDeviceText) {
        this.bgDeviceText.textContent = isMobile ? 'Mobile Background Active' : 'Background Active';
      }
      if (this.bgDeviceIcon) {
        this.bgDeviceIcon.textContent = isMobile ? '📱' : '⚡';
      }
    }

    closeSettings() {
      // Save changes from inputs
      const workM = parseInt(this.inputWorkMin.value, 10);
      const shortM = parseInt(this.inputShortBreakMin.value, 10);
      const longM = parseInt(this.inputLongBreakMin.value, 10);
      const targetI = parseInt(this.inputTargetIntervals.value, 10);

      if (workM > 0) this.config.workDuration = workM * 60;
      if (shortM > 0) this.config.shortBreakDuration = shortM * 60;
      if (longM > 0) this.config.longBreakDuration = longM * 60;
      if (targetI >= 2 && targetI <= 12) this.config.targetIntervals = targetI;

      this.config.autoStartBreaks = this.toggleAutoBreak.checked;
      this.config.autoStartFocus = this.toggleAutoWork.checked;

      this.saveSettings();

      // If timer is not running, adjust current durations
      if (!this.isRunning) {
        if (this.mode === 'work') {
          this.timeRemaining = this.config.workDuration;
          this.totalDuration = this.config.workDuration;
        } else if (this.mode === 'shortBreak') {
          this.timeRemaining = this.config.shortBreakDuration;
          this.totalDuration = this.config.shortBreakDuration;
        } else if (this.mode === 'longBreak') {
          this.timeRemaining = this.config.longBreakDuration;
          this.totalDuration = this.config.longBreakDuration;
        }
      }

      this.modalSettings.classList.remove('open');
      this.updateUI();
    }
  }

  // Initialize on DOM load
  window.addEventListener('DOMContentLoaded', () => {
    window.pomodoroApp = new PomodoroApp();
  });
})();
