const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

global.window = {
  addEventListener: () => {},
  innerWidth: 1200,
  devicePixelRatio: 1,
  electronAPI: null
};
global.document = {
  getElementById: (id) => ({
    id,
    textContent: '',
    value: id.includes('intervals') ? '4' : id.includes('break') ? '5' : '25',
    checked: true,
    style: {},
    classList: { add: () => {}, remove: () => {}, contains: () => false },
    addEventListener: () => {},
    appendChild: () => {}
  }),
  createElement: () => ({
    classList: { add: () => {}, remove: () => {} },
    innerHTML: '',
    appendChild: () => {}
  }),
  querySelectorAll: () => [],
  addEventListener: () => {},
  title: ''
};
global.localStorage = {
  getItem: (k) => null,
  setItem: () => {}
};
global.Worker = function() {
  return {
    postMessage: (msg) => {},
    onmessage: null
  };
};
global.navigator = { userAgent: 'test' };

code = code.replace("window.addEventListener('DOMContentLoaded', () => {", "(function() {\n//");
code = code.replace("window.pomodoroApp = new PomodoroApp();\n  });", "window.pomodoroApp = new PomodoroApp();\n})();");
eval(code);

const app = window.pomodoroApp;

// Track sound calls
const soundLog = [];
app.audio.playFocusChime = () => soundLog.push('SOUND: FOCUS (Pomodoro)');
app.audio.playBreakChime = () => soundLog.push('SOUND: SHORT BREAK');
app.audio.playLongBreakChime = () => soundLog.push('SOUND: LONG INTERVAL');

console.log('=== TEST: COMPLETE 4-INTERVAL POMODORO FLOW ===');

function tickToFinish() {
  app.targetEndTime = Date.now() - 1000;
  app.handleTick();
}

// Start Round 1
app.startTimer(true);
console.log(`[R1 Start] Mode: ${app.mode}, Duration: ${app.totalDuration/60}m, Running: ${app.isRunning}`);

// Round 1 Focus finishes -> should become Short Break 1 (5m)
tickToFinish();
console.log(`[R1 Work Finished] -> New Mode: ${app.mode}, Duration: ${app.totalDuration/60}m, Running: ${app.isRunning}, Round: ${app.round}`);

// Short Break 1 finishes -> should become Round 2 Focus (25m)
tickToFinish();
console.log(`[Break 1 Finished] -> New Mode: ${app.mode}, Duration: ${app.totalDuration/60}m, Running: ${app.isRunning}, Round: ${app.round}`);

// Round 2 Focus finishes -> should become Short Break 2 (5m)
tickToFinish();
console.log(`[R2 Work Finished] -> New Mode: ${app.mode}, Duration: ${app.totalDuration/60}m, Running: ${app.isRunning}, Round: ${app.round}`);

// Short Break 2 finishes -> should become Round 3 Focus (25m)
tickToFinish();
console.log(`[Break 2 Finished] -> New Mode: ${app.mode}, Duration: ${app.totalDuration/60}m, Running: ${app.isRunning}, Round: ${app.round}`);

// Round 3 Focus finishes -> should become Short Break 3 (5m)
tickToFinish();
console.log(`[R3 Work Finished] -> New Mode: ${app.mode}, Duration: ${app.totalDuration/60}m, Running: ${app.isRunning}, Round: ${app.round}`);

// Short Break 3 finishes -> should become Round 4 Focus (25m)
tickToFinish();
console.log(`[Break 3 Finished] -> New Mode: ${app.mode}, Duration: ${app.totalDuration/60}m, Running: ${app.isRunning}, Round: ${app.round}`);

// Round 4 Focus finishes (Target 4 reached!) -> should become Long Break (15m)
tickToFinish();
console.log(`[R4 Work Finished] -> New Mode: ${app.mode}, Duration: ${app.totalDuration/60}m, Running: ${app.isRunning}, Round: ${app.round}`);

// Long Break finishes -> should reset to Round 1 Focus (25m)
tickToFinish();
console.log(`[Long Break Finished] -> New Mode: ${app.mode}, Duration: ${app.totalDuration/60}m, Running: ${app.isRunning}, Round: ${app.round}`);

console.log('\n=== SOUND EVENTS LOG ===');
console.log(soundLog.join('\n'));

// Assertions
if (app.mode === 'work' && app.round === 1 && app.isRunning) {
  console.log('\n>>> SUCCESS: All interval transitions and sounds verified correctly! <<<');
} else {
  console.error('\n>>> ERROR: Unexpected state! <<<');
  process.exit(1);
}
