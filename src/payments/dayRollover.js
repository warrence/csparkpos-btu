// Refresh date-derived presentation at Kuching midnight; this is not a cache TTL.
export function watchKuchingDay(refresh) {
  let timer, stopped = false;
  const schedule = () => {
    const now = Date.now(), day = 86400000, offset = 28800000;
    const next = (Math.floor((now + offset) / day) + 1) * day - offset;
    timer = setTimeout(() => { if (!stopped) { refresh(); schedule(); } }, Math.max(1, next - now));
    if (timer && typeof timer.unref === 'function') timer.unref();
  };
  schedule();
  return () => { stopped = true; clearTimeout(timer); };
}
