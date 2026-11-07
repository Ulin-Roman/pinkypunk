const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
function playVideo(video) {
  if (video.hidden || video.closest('[hidden]')) return;
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

for (const list of document.querySelectorAll('[role="tablist"]')) {
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

for (const variants of document.querySelectorAll('[data-product-variants]')) {
  document.addEventListener('click', (event) => {
    if (!variants.contains(event.target)) variants.open = false;
  });
  variants.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !variants.open) return;
    variants.open = false;
    variants.querySelector('summary').focus();
  });
}

const zoomDialog = document.createElement('dialog');
zoomDialog.className = 'gallery-zoom';
zoomDialog.setAttribute('aria-label', 'Фото товара');
zoomDialog.innerHTML = '<form method="dialog"><button aria-label="Закрыть">×</button></form><img alt="">';
if (document.querySelector('[data-gallery-zoom]')) document.body.append(zoomDialog);
zoomDialog.addEventListener('click', (event) => {
  if (event.target === zoomDialog) zoomDialog.close();
});
zoomDialog.addEventListener('close', () => zoomDialog.querySelector('img').removeAttribute('src'));

for (const gallery of document.querySelectorAll('[data-gallery]')) {
  const slides = Array.from(gallery.children).filter((child) => child.classList.contains('slide'));
  const dots = gallery.querySelectorAll('[data-slide-index]');
  let index = 0;
  function show(next) {
    if (next === index) return;
    slides[index].hidden = true;
    slides[index].querySelector('video')?.pause();
    dots[index]?.removeAttribute('aria-current');
    index = next;
    slides[index].hidden = false;
    dots[index]?.setAttribute('aria-current', 'true');
    const video = slides[index].querySelector('[data-video-source]');
    if (video) playVideo(video);
  }
  const step = (offset) => show((index + offset + slides.length) % slides.length);
  gallery.addEventListener('click', (event) => {
    const button = event.target.closest('[data-slide]');
    if (button) step(Number(button.dataset.slide));
    const dot = event.target.closest('[data-slide-index]');
    if (dot) show(Number(dot.dataset.slideIndex));
    const picture = event.target.closest('[data-gallery-zoom]')?.querySelector('img');
    if (picture?.src) {
      const expanded = zoomDialog.querySelector('img');
      expanded.src = picture.currentSrc || picture.src;
      expanded.alt = picture.alt;
      zoomDialog.showModal();
    }
  });
  gallery.addEventListener('keydown', (event) => {
    if (slides.length < 2 || event.target instanceof HTMLVideoElement) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    step(event.key === 'ArrowLeft' ? -1 : 1);
  });
  let swipeStart;
  gallery.addEventListener('touchstart', ({ touches }) => {
    swipeStart = touches.length === 1 ? touches[0] : undefined;
  }, { passive: true });
  gallery.addEventListener('touchend', ({ changedTouches }) => {
    const touch = changedTouches[0];
    if (!swipeStart || !touch) return;
    const horizontal = touch.clientX - swipeStart.clientX;
    const vertical = touch.clientY - swipeStart.clientY;
    if (Math.abs(horizontal) > 45 && Math.abs(horizontal) > Math.abs(vertical)) step(horizontal < 0 ? 1 : -1);
    swipeStart = undefined;
  }, { passive: true });
  gallery.addEventListener('touchcancel', () => {
    swipeStart = undefined;
  });
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
    const data = new FormData(form);
    const text = [data.get('name'), data.get('contact'), data.get('message')].filter(Boolean).join('\n');
    const telegram = new URL('https://t.me/sexpeditsiya_help');
    telegram.searchParams.set('text', text);
    window.open(telegram.href, '_blank', 'noopener,noreferrer');
  });
}
