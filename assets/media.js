const API = 'https://sexpedition.ru/bluriki-production-20261011/api.php';
const BOT = 'https://t.me/sexpeditsiya_bot';
const TICKET_VERSION = 'bluriki-production-v1';
const PASS_KEY = 'pinkypunk.media-pass';
const MODE_KEY = 'pinkypunk.media-open';
const VIDEO_HOSTS = new Set([
  'sexpedition.ru',
  'static.tildacdn.com',
  '0f64554a-db8e-4da6-927a-6abd86e155dd.selstorage.ru',
]);

function stored(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key, value) {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    // A pass supplied in the URL still works for this page.
  }
}

function consumePass() {
  const url = new URL(location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (!fragment.has('bluriki_u') && !url.searchParams.has('u')) return null;
  const pass = fragment.get('bluriki_u') || url.searchParams.get('u');
  if (fragment.has('bluriki_u')) {
    fragment.delete('bluriki_u');
    url.hash = fragment.toString();
  }
  url.searchParams.delete('u');
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  store(PASS_KEY, pass);
  return pass;
}

async function request(parameters, options = {}) {
  const url = new URL(API);
  url.search = new URLSearchParams(parameters);
  const { signal, ...init } = options;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 20_000);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

function protectedResources() {
  const resources = new Map();
  document.querySelectorAll('img[data-protected-image], video[data-protected-video]').forEach((node) => {
    const video = node instanceof HTMLVideoElement;
    const id = video ? node.dataset.protectedVideo : node.dataset.protectedImage;
    if (!id) return;
    const key = `${video ? 'video' : 'image'}:${id}`;
    if (!resources.has(key)) resources.set(key, { id, video, nodes: [], buttons: [] });
    resources.get(key).nodes.push({ node, source: node.getAttribute('src'), controls: node.controls });
  });
  document.querySelectorAll('[data-protected-play]').forEach((button) => {
    resources.get(`video:${button.dataset.protectedPlay}`)?.buttons.push(button);
  });
  return [...resources.values()];
}

function makePanel() {
  const panel = document.createElement('aside');
  panel.className = 'pp-protected-panel';
  panel.setAttribute('aria-label', 'Фото и видео 18+');
  const status = document.createElement('strong');
  status.setAttribute('aria-live', 'polite');
  const button = document.createElement('button');
  button.type = 'button';
  const fallback = document.createElement('a');
  fallback.textContent = 'Открыть на pinkypunk.ru';
  const path = document.body.dataset.ppMediaPath || location.pathname;
  fallback.href = new URL(`/${path.replace(/^\/+/, '')}`, 'https://pinkypunk.ru');
  fallback.hidden = true;
  panel.append(status, button, fallback);
  document.body.append(panel);
  return { status, button, fallback };
}

function start(resources, incomingPass) {
  let pass = incomingPass || stored(PASS_KEY);
  let session;
  let failure = '';
  let connecting = false;
  let botController;
  const visible = new Set();
  const { status, button, fallback } = makePanel();
  const ageDialog = document.getElementById('pp-age');

  function render() {
    status.textContent = failure || (connecting ? 'Проверяем пропуск…' : session ? 'Фото и видео открыты' : 'Наклейки на месте · 18+');
    button.textContent = connecting ? 'Отменить' : session ? 'Закрыть материалы' : pass ? 'Открыть материалы' : 'За пропуском к Робокоту';
    fallback.hidden = !failure;
  }

  function restore(resource) {
    const expanded = document.querySelector('.gallery-zoom[open] img');
    for (const { node, source, controls } of resource.nodes) {
      if (expanded?.src === node.src) expanded.closest('dialog').close();
      if (resource.video) {
        node.pause();
        node.controls = controls;
        node.hidden = true;
      }
      if (source === null) node.removeAttribute('src');
      else node.setAttribute('src', source);
      if (resource.video) node.load();
    }
    resource.buttons.forEach((control) => { control.closest('.protected-cover').hidden = false; });
  }

  function close(message = '') {
    botController?.abort();
    botController = undefined;
    if (session) {
      session.controller.abort();
      clearTimeout(session.timer);
      for (const [resource, url] of session.loaded) {
        restore(resource);
        if (!resource.video) URL.revokeObjectURL(url);
      }
    }
    session = undefined;
    store(MODE_KEY, null);
    connecting = false;
    failure = message;
    render();
  }

  async function imageURL(resource, context) {
    const response = await request({ a: 'image', id: resource.id }, {
      signal: context.controller.signal,
      headers: { 'X-Bluriki-Ticket': context.ticket },
    });
    const type = response.headers.get('content-type')?.split(';')[0];
    if (!response.ok || !['image/jpeg', 'image/png', 'image/webp'].includes(type)) throw new Error('Invalid image');
    const url = URL.createObjectURL(await response.blob());
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
      if (context !== session) throw new Error('Session closed');
      return url;
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }

  async function videoURL(resource, context) {
    const response = await request({ a: 'videos', ids: resource.id }, {
      signal: context.controller.signal,
      headers: { 'X-Bluriki-Ticket': context.ticket },
    });
    const data = await response.json();
    const match = data.videos?.find(({ id }) => id === resource.id);
    if (!response.ok || data.ok !== true || !match) throw new Error('Invalid video');
    const url = new URL(match.url);
    if (url.protocol !== 'https:' || !VIDEO_HOSTS.has(url.hostname)) throw new Error('Invalid video host');
    return url.href;
  }

  function apply(resource, url) {
    for (const { node } of resource.nodes) {
      if (resource.video) {
        node.controls = true;
        node.hidden = false;
      }
      node.src = url;
    }
    resource.buttons.forEach((control) => { control.closest('.protected-cover').hidden = true; });
  }

  function load(resource, context) {
    if (context.loaded.has(resource)) return Promise.resolve();
    if (context.inflight.has(resource)) return context.inflight.get(resource);
    const urlRequest = resource.video ? videoURL(resource, context) : imageURL(resource, context);
    const loading = urlRequest.then((url) => {
      if (context !== session || context.expiresAt <= Date.now()) {
        if (!resource.video) URL.revokeObjectURL(url);
        return;
      }
      context.loaded.set(resource, url);
      apply(resource, url);
    }).catch(() => {
      if (context === session) {
        context.failed.add(resource);
        failure = 'Часть материалов недоступна. Их можно открыть на действующем сайте.';
        render();
      }
    }).finally(() => {
      context.inflight.delete(resource);
      pump();
    });
    context.inflight.set(resource, loading);
    return loading;
  }

  function pump() {
    if (!session?.ticket || session.expiresAt <= Date.now()) return;
    for (const resource of resources) {
      if (session.inflight.size >= 4) break;
      if (!resource.nodes.some(({ node }) => visible.has(node))) continue;
      if (resource.buttons.length || session.inflight.has(resource) || session.loaded.has(resource) || session.failed.has(resource)) continue;
      load(resource, session);
    }
  }

  async function authorize() {
    if (!pass || ageDialog?.open || session) return;
    const context = {
      controller: new AbortController(),
      loaded: new Map(),
      inflight: new Map(),
      failed: new Set(),
    };
    session = context;
    connecting = true;
    failure = '';
    render();
    try {
      const response = await request({ a: 'auth' }, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pass }),
        signal: context.controller.signal,
      });
      const auth = await response.json();
      if (context !== session) return;
      if (auth.err === 'bad_token') {
        pass = null;
        store(PASS_KEY, null);
        close('Возьмите новый пропуск у Робокота.');
        return;
      }
      const valid = response.ok && auth.ok === true && auth.version === TICKET_VERSION && /^[a-f0-9]{64}$/.test(auth.ticket)
        && Number.isFinite(auth.ttl) && auth.ttl > 0 && auth.ttl <= 900;
      if (!valid) throw new Error('Invalid ticket');
      context.ticket = auth.ticket;
      context.expiresAt = Date.now() + auth.ttl * 1_000;
      context.timer = setTimeout(expire, auth.ttl * 1_000);
      store(MODE_KEY, 'yes');
      connecting = false;
      render();
      pump();
    } catch {
      if (context === session) close('Сервис доступа недоступен с этого адреса. Откройте материалы на действующем сайте.');
    }
  }

  function expire() {
    if (session?.expiresAt <= Date.now()) close('Доступ по пропуску закончился. Откройте материалы ещё раз.');
  }

  async function openBot() {
    const controller = new AbortController();
    botController = controller;
    connecting = true;
    failure = '';
    render();
    try {
      let route = document.body.dataset.ppMediaRoute;
      if (!route) {
        const response = await request({ a: 'bindings' }, { signal: controller.signal });
        if (!response.ok) throw new Error('Routes unavailable');
        const data = await response.json();
        const path = new URL(fallback.href).pathname.replace(/\/$/, '') || '/';
        route = Object.keys(data.routes).find((key) => data.routes[key].path === path) || data.default_route;
      }
      if (controller !== botController) return;
      if (typeof route !== 'string' || !/^[a-z\d_-]+$/i.test(route)) throw new Error('Invalid route');
      location.href = `${BOT}?start=${encodeURIComponent(`nude_${route}`)}`;
      botController = undefined;
      connecting = false;
      render();
    } catch {
      if (controller === botController) close('Сервис доступа недоступен с этого адреса. Откройте материалы на действующем сайте.');
    }
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) visible.add(entry.target);
      else visible.delete(entry.target);
    }
    pump();
  }, { rootMargin: '250px 0px' });
  for (const resource of resources) {
    resource.nodes.forEach(({ node }) => observer.observe(node));
    for (const control of resource.buttons) {
      control.addEventListener('click', async () => {
        if (!pass) {
          if (!connecting) await openBot();
          return;
        }
        await authorize();
        if (!session?.ticket || session.expiresAt <= Date.now()) return;
        await load(resource, session);
        const player = control.closest('.protected-player').querySelector('video');
        if (player.hasAttribute('src')) player.play().catch(() => {});
      });
    }
  }

  button.addEventListener('click', () => {
    if (session || connecting) close();
    else if (pass) authorize();
    else openBot();
  });
  addEventListener('hashchange', () => {
    const received = consumePass();
    if (!received) return;
    pass = received;
    close();
    authorize();
  });
  addEventListener('pageshow', expire);
  if (incomingPass || stored(MODE_KEY) === 'yes') {
    if (ageDialog?.open) document.addEventListener('pp:age-confirmed', authorize, { once: true });
    else authorize();
  }
  render();
}

const resources = protectedResources();
if (document.body.hasAttribute('data-pp-media-handoff')) {
  if (resources.length || document.querySelector('img[src*="/bluriki-production-20261011/closed/"]')) {
    const { status, button, fallback } = makePanel();
    status.textContent = 'Наклейки на месте · 18+';
    button.textContent = 'За пропуском к Робокоту';
    const goToOriginal = () => location.assign(fallback.href);
    button.addEventListener('click', goToOriginal);
    document.querySelectorAll('[data-protected-play]').forEach((control) => control.addEventListener('click', goToOriginal));
  }
} else if (resources.length) {
  start(resources, consumePass());
}
