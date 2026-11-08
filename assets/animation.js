const breakpoints = [320, 480, 640, 960, 1200];
const optionsAttribute = 'data-animate-sbs-opts';
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const homePage = document.body.dataset.ppMediaPath === '/';
const stationTextLead = 96;
const stationTextDistance = 120;

function number(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function stepsFor(element, breakpoint) {
  // A missing mobile override inherits the next wider definition.
  for (const width of breakpoints) {
    if (width < breakpoint) continue;
    const attribute = width === 1200 ? optionsAttribute : `${optionsAttribute}-res-${width}`;
    const value = element.getAttribute(attribute);
    if (!value) continue;
    try {
      const steps = JSON.parse(value);
      if (Array.isArray(steps) && steps.length > 1 && steps.every((step) => step && typeof step === 'object')) {
        return steps;
      }
    } catch {
      // A malformed override can still use the next valid definition.
    }
  }
  return null;
}

function timeline(steps, scroll, target) {
  const base = getComputedStyle(target);
  const transform = base.transform === 'none' ? '' : ` ${base.transform}`;
  const opacity = number(base.opacity, 1);
  const frames = [];
  let elapsed = 0;

  for (const step of steps) {
    const lastFrame = frames.at(-1);
    const delay = Math.max(0, number(scroll ? step.dd : step.dt));
    const length = Math.max(0, number(scroll ? step.di : step.ti));
    if (lastFrame && delay) {
      elapsed += delay;
      frames.push({ ...lastFrame, elapsed, easing: 'linear' });
    }
    const easing = typeof step.ea === 'string' && CSS.supports('animation-timing-function', step.ea)
      ? step.ea : 'linear';
    if (frames.length) frames.at(-1).easing = easing;
    elapsed += length;
    const alpha = Math.min(1, Math.max(0, number(step.op, 1)));
    frames.push({
      elapsed,
      transform: `translate(${number(step.mx)}px, ${number(step.my)}px) scale(${number(step.sx, 1)}, ${number(step.sy, 1)}) rotate(${number(step.ro)}deg)${transform}`,
      opacity: alpha * opacity,
      easing: 'linear',
    });
  }

  const duration = Math.max(elapsed, 1);
  const keyframes = frames.map(({ elapsed: position, ...frame }) => ({ ...frame, offset: position / duration }));
  return { duration, keyframes };
}

const tracks = [];
for (const element of document.querySelectorAll('.art-item[data-animate-sbs-event], .art-group[data-animate-sbs-event]')) {
  const event = element.getAttribute('data-animate-sbs-event');
  const target = element.querySelector(':scope > .atom, :scope > .art-group-body');
  if (!target?.animate || (event !== 'scroll' && event !== 'intoview')) continue;
  const stationText = homePage && event === 'scroll' && element.dataset.kind === 'text';
  tracks.push({
    element,
    target,
    scroll: event === 'scroll',
    stationText,
    mobile: element.getAttribute('data-animate-mobile') === 'y',
    trigger: number(element.getAttribute('data-animate-sbs-trg'), 1),
    offset: number(element.getAttribute('data-animate-sbs-trgofst')) + (stationText ? stationTextLead : 0),
  });
}

let frameId = 0;
let active = [];

function update() {
  frameId = 0;
  const viewport = window.innerHeight;
  const scrollTop = window.scrollY;
  // Read each anchor before seeking animations on the inner elements.
  const positions = active.map(({ element, trigger, offset, scroll, started }) => {
    if (started || (!scroll && !element.getClientRects().length)) return -Infinity;
    const top = element.getBoundingClientRect().top;
    if (trigger !== .5 && trigger !== 1) return offset - top;
    const position = viewport * trigger + offset - top;
    // An element already above its trigger starts at page scroll zero.
    return offset <= 0 ? Math.min(position, scrollTop) : position;
  });
  for (const [index, track] of active.entries()) {
    const position = positions[index];
    if (track.scroll) {
      const time = Math.max(0, Math.min(track.duration, position));
      if (track.animation.currentTime !== time) track.animation.currentTime = time;
    } else if (position >= 0) {
      track.started = true;
      track.animation.play();
    }
  }
}

function scheduleUpdate() {
  if (!frameId && active.length) frameId = requestAnimationFrame(update);
}

let breakpoint;
let reducedMotion;

function configure() {
  const width = window.innerWidth;
  const nextBreakpoint = breakpoints.findLast((size) => width >= size) ?? 320;
  const nextReducedMotion = motionPreference.matches;
  if (breakpoint === nextBreakpoint && reducedMotion === nextReducedMotion) {
    scheduleUpdate();
    return;
  }
  breakpoint = nextBreakpoint;
  reducedMotion = nextReducedMotion;

  for (const track of active) track.animation.cancel();
  active = [];
  if (reducedMotion) return;

  for (const track of tracks) {
    if (breakpoint < 1200 && !track.mobile) continue;
    const steps = stepsFor(track.element, breakpoint);
    if (!steps) continue;
    const { duration: authoredDuration, keyframes } = timeline(steps, track.scroll, track.target);
    // Keep the station artwork's motion, with readable text as it enters the viewport.
    const duration = track.stationText ? Math.min(authoredDuration, stationTextDistance) : authoredDuration;
    const animation = track.target.animate(keyframes, { duration, fill: 'both' });
    animation.pause();
    animation.currentTime = 0;
    active.push({ ...track, animation, duration, started: false });
  }
  scheduleUpdate();
}

if (tracks.length) {
  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', configure, { passive: true });
  window.addEventListener('load', scheduleUpdate, { once: true });
  motionPreference.addEventListener('change', configure);
  configure();
}
