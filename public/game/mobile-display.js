// Native browser gestures stay separate from the game's pointer controls.
export function installMobileDisplay({ canvas, onResize, onCancel }) {
  const portrait = matchMedia('(orientation: portrait)');
  const controller = new AbortController();
  const { signal } = controller;
  let frame = 0;
  const prevent = (e) => {
    if (e.cancelable) e.preventDefault();
  };
  for (const name of [
    'touchstart',
    'touchmove',
    'touchend',
    'gesturestart',
    'gesturechange',
    'gestureend',
    'dblclick',
    'contextmenu',
  ]) {
    canvas.addEventListener(name, prevent, { passive: false, signal });
  }
  for (const name of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) {
    document.addEventListener(name, prevent, { passive: false, signal });
  }
  // Keep single-finger panel scrolling and button clicks intact.
  for (const name of ['touchstart', 'touchmove']) {
    document.addEventListener(
      name,
      (e) => {
        if (e.touches.length > 1) prevent(e);
      },
      { passive: false, signal },
    );
  }
  // Capture also blocks keyboard input and an already-captured pointer in portrait.
  for (const name of ['pointerdown', 'pointermove', 'pointerup', 'click', 'keydown']) {
    document.addEventListener(
      name,
      (e) => {
        if (portrait.matches) {
          prevent(e);
          e.stopImmediatePropagation();
        }
      },
      { capture: true, passive: false, signal },
    );
  }
  function refresh() {
    frame = 0;
    onResize();
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(refresh);
  }
  function cancel() {
    onCancel();
    schedule();
  }
  portrait.addEventListener('change', cancel, { signal });
  window.addEventListener('resize', schedule, { signal });
  window.addEventListener('orientationchange', cancel, { signal });
  window.addEventListener('pageshow', schedule, { signal });
  window.addEventListener('blur', cancel, { signal });
  document.addEventListener('visibilitychange', cancel, { signal });
  document.addEventListener('fullscreenchange', cancel, { signal });
  window.visualViewport?.addEventListener('resize', schedule, { signal });
  const observer = new ResizeObserver(schedule);
  observer.observe(canvas);
  refresh();
  return () => {
    controller.abort();
    observer.disconnect();
    cancelAnimationFrame(frame);
  };
}
