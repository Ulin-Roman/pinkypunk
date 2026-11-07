const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
function playVideo(video) {
  if (video.closest('[hidden], [inert]')) return;
  if (video.dataset.videoSource && !video.src) video.src = video.dataset.videoSource;
  if (video.hasAttribute('data-autoplay') && !motion.matches) video.play().catch(() => {});
}

const videos = document.querySelectorAll('video[data-video-source]');
const videoObserver = new IntersectionObserver((entries) => {
  for (const { target, isIntersecting } of entries) {
    if (isIntersecting) playVideo(target);
    else if (target.hasAttribute('data-autoplay')) target.pause();
  }
}, { rootMargin: '150px' });
videos.forEach((video) => videoObserver.observe(video));

for (const list of document.querySelectorAll('.art-group-body[role="tablist"]')) {
  const tabs = Array.from(list.querySelectorAll('[role="tab"]'));

  function select(active) {
    for (const tab of tabs) {
      const selected = tab === active;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
    }
  }

  list.addEventListener('click', (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (tab) select(tab);
  });
  list.addEventListener('keydown', (event) => {
    const index = tabs.indexOf(event.target);
    if (index < 0) return;
    const destinations = {
      ArrowRight: (index + 1) % tabs.length,
      ArrowLeft: (index - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    };
    const next = tabs[destinations[event.key]];
    if (!next) return;
    event.preventDefault();
    select(next);
    next.focus();
  });
}

const variantMenus = document.querySelectorAll('[data-product-variants]');
if (variantMenus.length) {
  document.addEventListener('click', (event) => {
    for (const menu of variantMenus) {
      if (menu.open && !menu.contains(event.target)) menu.open = false;
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    for (const menu of variantMenus) {
      if (!menu.open) continue;
      const restoreFocus = menu.contains(document.activeElement);
      menu.open = false;
      if (restoreFocus) menu.querySelector('summary').focus();
    }
  });
}

function onSwipe(element, move) {
  let start;
  element.addEventListener('touchstart', ({ touches }) => {
    start = touches.length === 1 ? touches[0] : undefined;
  }, { passive: true });
  element.addEventListener('touchend', ({ changedTouches }) => {
    const touch = changedTouches[0];
    if (start && touch) {
      const horizontal = touch.clientX - start.clientX;
      const vertical = touch.clientY - start.clientY;
      if (Math.abs(horizontal) > 45 && Math.abs(horizontal) > Math.abs(vertical)) move(horizontal < 0 ? 1 : -1);
    }
    start = undefined;
  }, { passive: true });
  element.addEventListener('touchcancel', () => {
    start = undefined;
  });
}

const zoomDialog = document.createElement('dialog');
zoomDialog.className = 'gallery-zoom';
zoomDialog.setAttribute('aria-label', 'Фото товара');
zoomDialog.innerHTML = `
  <div class="gallery-zoom-view"><img alt=""></div>
  <button type="button" data-zoom-step="-1" aria-label="Предыдущее фото">‹</button>
  <button type="button" data-zoom-step="1" aria-label="Следующее фото">›</button>
  <form class="gallery-zoom-tools" method="dialog">
    <button type="button" data-zoom-scale aria-label="Масштаб фото" aria-pressed="false" hidden>+</button>
    <button type="submit" aria-label="Закрыть" autofocus>×</button>
  </form>`;
if (document.querySelector('[data-gallery-zoom]')) document.body.append(zoomDialog);
const zoomView = zoomDialog.querySelector('.gallery-zoom-view');
const zoomImage = zoomView.querySelector('img');
const zoomScale = zoomDialog.querySelector('[data-zoom-scale]');
const zoomSteps = zoomDialog.querySelectorAll('[data-zoom-step]');
let zoomPhotos = [];
let zoomIndex = 0;

function setZoomScale(scaled) {
  zoomDialog.classList.toggle('is-scaled', scaled);
  zoomScale.setAttribute('aria-pressed', String(scaled));
  zoomScale.textContent = scaled ? '−' : '+';
  if (!scaled) zoomView.scrollTo(0, 0);
}

function updateScaleControl() {
  const box = zoomImage.getBoundingClientRect();
  zoomScale.hidden = zoomImage.naturalWidth <= box.width && zoomImage.naturalHeight <= box.height;
}

function showZoomPhoto(index) {
  const picture = zoomPhotos[index];
  zoomIndex = index;
  setZoomScale(false);
  zoomScale.hidden = true;
  zoomImage.src = picture.currentSrc || picture.src;
  zoomImage.alt = picture.alt;
  if (zoomImage.complete) updateScaleControl();
}

function stepZoom(offset) {
  if (zoomPhotos.length < 2) return;
  showZoomPhoto((zoomIndex + offset + zoomPhotos.length) % zoomPhotos.length);
}

zoomImage.addEventListener('load', updateScaleControl);
zoomScale.addEventListener('click', () => setZoomScale(!zoomDialog.classList.contains('is-scaled')));
for (const button of zoomSteps) button.addEventListener('click', () => stepZoom(Number(button.dataset.zoomStep)));
zoomDialog.addEventListener('click', (event) => {
  if (event.target === zoomView) zoomDialog.close();
});
zoomDialog.addEventListener('close', () => {
  zoomPhotos = [];
  zoomImage.removeAttribute('src');
});
zoomDialog.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  stepZoom(event.key === 'ArrowLeft' ? -1 : 1);
});
onSwipe(zoomView, (offset) => {
  if (!zoomDialog.classList.contains('is-scaled')) stepZoom(offset);
});

for (const gallery of document.querySelectorAll('[data-gallery]')) {
  const track = gallery.querySelector(':scope > .gallery-track') || gallery;
  const slides = Array.from(track.children).filter((child) => child.classList.contains('slide'));
  const dots = gallery.querySelectorAll('[data-slide-index]');
  let index = 0;
  let stopSlideMotion;
  function show(next, direction = Math.sign(next - index)) {
    if (next === index || !slides[next]) return;
    stopSlideMotion?.();
    const previous = slides[index];
    const moveFocus = previous.contains(document.activeElement);
    const animate = gallery.hasAttribute('data-slide-motion') && !motion.matches && typeof previous.animate === 'function';
    if (!animate) previous.hidden = true;
    previous.querySelector('video')?.pause();
    dots[index]?.removeAttribute('aria-current');
    index = next;
    slides[index].hidden = false;
    dots[index]?.setAttribute('aria-current', 'true');
    const video = slides[index].querySelector('[data-video-source]');
    if (video) playVideo(video);
    if (moveFocus) {
      const control = slides[index].querySelector('button, a[href], video:not([hidden])') || dots[index];
      control?.focus({ preventScroll: true });
    }
    if (animate) {
      previous.inert = true;
      const timing = { duration: 300, easing: 'ease-in-out' };
      const leave = previous.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-direction * 100}%)` }], timing);
      const enter = slides[index].animate([{ transform: `translateX(${direction * 100}%)` }, { transform: 'translateX(0)' }], timing);
      stopSlideMotion = () => {
        previous.hidden = true;
        previous.inert = false;
        leave.cancel();
        enter.cancel();
        stopSlideMotion = undefined;
      };
      leave.onfinish = stopSlideMotion;
    }
  }
  const step = (offset) => show((index + offset + slides.length) % slides.length, offset);
  gallery.addEventListener('click', (event) => {
    const button = event.target.closest('[data-slide]');
    if (button) step(Number(button.dataset.slide));
    const dot = event.target.closest('[data-slide-index]');
    if (dot) show(Number(dot.dataset.slideIndex));
    const picture = event.target.closest('[data-gallery-zoom]')?.querySelector('img');
    if (picture?.getAttribute('src')) {
      zoomPhotos = Array.from(gallery.querySelectorAll('[data-gallery-zoom] img[src]'));
      for (const control of zoomSteps) control.hidden = zoomPhotos.length < 2;
      zoomDialog.showModal();
      showZoomPhoto(zoomPhotos.indexOf(picture));
    }
  });
  gallery.addEventListener('keydown', (event) => {
    if (slides.length < 2 || event.target instanceof HTMLVideoElement) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    step(event.key === 'ArrowLeft' ? -1 : 1);
  });
  onSwipe(gallery, step);
}

const popups = new Map(Array.from(document.querySelectorAll('[data-popup]'), (dialog) => [dialog.dataset.popup, dialog]));
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="#"]');
  const dialog = link && popups.get(link.getAttribute('href').slice(1));
  if (dialog) {
    event.preventDefault();
    dialog.showModal();
  }
  event.target.closest('[data-close-popup]')?.closest('dialog')?.close();
});

for (const form of document.querySelectorAll('[data-contact-form]')) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (document.body.hasAttribute('data-pp-demo')) {
      form.querySelector('output').textContent = 'Тестовая версия. Данные не отправлены.';
      return;
    }
    const data = new FormData(form);
    const text = Array.from(data.values()).filter((value) => typeof value === 'string' && value.trim()).join('\n');
    const telegram = new URL('https://t.me/sexpeditsiya_help');
    telegram.searchParams.set('text', text);
    window.open(telegram.href, '_blank', 'noopener,noreferrer');
  });
}

for (const quiz of document.querySelectorAll('.editorial-quiz')) {
  const steps = [...quiz.querySelectorAll('[data-quiz-step]')];
  const previous = quiz.querySelector('[data-quiz-prev]');
  const next = quiz.querySelector('[data-quiz-next]');
  const finish = quiz.querySelector('[data-quiz-finish]');
  const progress = quiz.querySelector('progress');
  let current = 0;

  function show(index) {
    steps[current].hidden = true;
    current = index;
    steps[current].hidden = false;
    steps[current].parentElement.scrollTop = 0;
    progress.value = index + 1;
    previous.hidden = index === 0;
    next.hidden = index === steps.length - 1;
    finish.hidden = !next.hidden;
    steps[current].querySelector('input, textarea')?.focus({ preventScroll: true });
  }

  previous.addEventListener('click', () => show(current - 1));
  next.addEventListener('click', () => {
    const invalid = [...steps[current].querySelectorAll('input[required]')].find((input) => !input.validity.valid);
    if (invalid) invalid.reportValidity();
    else show(current + 1);
  });
  quiz.addEventListener('input', (event) => {
    if (event.target.matches('input[type="range"]')) event.target.nextElementSibling.value = event.target.value;
  });
}
