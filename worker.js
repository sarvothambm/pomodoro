// High-precision Web Worker background timer ticker
let timerId = null;

self.onmessage = function (e) {
  const { command, intervalMs } = e.data;
  if (command === 'start') {
    if (timerId) clearInterval(timerId);
    timerId = setInterval(() => {
      self.postMessage({ type: 'tick', timestamp: Date.now() });
    }, intervalMs || 250);
  } else if (command === 'stop') {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }
};
