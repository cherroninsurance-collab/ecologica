/* ── Shared render gate ────────────────────────────────────────────
   Five canvases animate on this page, three of them raymarched. Running
   them all continuously measured 1 FPS on a phone. This gate does two
   things: it stops any canvas that is not on screen (usually only one
   section is visible at a time), and it lowers the resolution scale on
   touch devices, where raymarching is fill-rate bound.               */
export const TOUCH = matchMedia('(hover: none), (pointer: coarse)').matches;
export const SCALE = TOUCH ? 0.6 : 1;

export function visible(el) {
  const state = { on: true };
  if (!el || !window.IntersectionObserver) return state;
  new IntersectionObserver(
    (entries) => { state.on = entries[0].isIntersecting; },
    { rootMargin: '120px' }
  ).observe(el);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) state.on = false;
  });
  return state;
}

/* A frame limiter for touch devices. Raymarching costs the same whether it
   runs at 60 or 24 fps, but at 24 it leaves two thirds of the GPU budget
   for scrolling and text. Slow, floating artwork does not read as choppy
   at 24; a janky scroll always does. */
export function limiter(fps) {
  if (!TOUCH) return () => true;
  const gap = 1000 / fps;
  let last = 0;
  return () => {
    const now = performance.now();
    if (now - last < gap) return false;
    last = now;
    return true;
  };
}
