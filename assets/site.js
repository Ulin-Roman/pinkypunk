const header = document.querySelector('[data-pp-header]');
const menu = document.querySelector('#pp-menu');
const menuButton = document.querySelector('.pp-menu-toggle');
const menuShade = document.querySelector('.pp-menu-shade');
const ageDialog = document.querySelector('#pp-age');
const cookieNotice = document.querySelector('[data-pp-cookie]');

function preference(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function remember(key) {
  try {
    localStorage.setItem(key, 'yes');
  } catch {
    // The current page still works in browsers that disable storage.
  }
}

function setMenu(open) {
  if (!menu) return;
  menu.hidden = !open;
  menuShade.hidden = !open;
  menuButton.setAttribute('aria-expanded', String(open));
  header.classList.toggle('pp-menu-open', open);
}

if (header) {
  if (header.dataset.ppHeader === 'home') {
    const updateToolbar = () => header.classList.toggle('pp-scrolled', scrollY >= 400);
    addEventListener('scroll', updateToolbar, { passive: true });
    addEventListener('pageshow', updateToolbar);
    updateToolbar();
  }

  menuButton.addEventListener('click', () => setMenu(menu.hidden));
  menuShade.addEventListener('click', () => setMenu(false));
  menu.addEventListener('click', (event) => {
    if (event.target.closest('a[href]')) setMenu(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || menu.hidden) return;
    setMenu(false);
    menuButton.focus();
  });
}

function dialogFor(hash) {
  const dialog = hash && document.getElementById(hash.slice(1));
  return dialog instanceof HTMLDialogElement && dialog !== ageDialog ? dialog : null;
}

function showDialog(dialog) {
  if (!dialog || dialog.open || ageDialog?.open) return;
  setMenu(false);
  dialog.showModal();
}

function showLinkedDialog() {
  showDialog(dialogFor(location.hash));
}

document.addEventListener('pp:cart-open', () => showDialog(dialogFor('#opencart')));

document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest('a[href^="#"]');
  const dialog = dialogFor(link?.getAttribute('href'));
  if (!dialog) return;
  event.preventDefault();
  showDialog(dialog);
});

document.querySelectorAll('dialog.pp-dialog:not(.pp-age-dialog)').forEach((dialog) => {
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (dialog.classList.contains('pp-search-dialog') || event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) {
      dialog.close();
    }
  });
  dialog.addEventListener('close', () => {
    if (location.hash === `#${dialog.id}`) history.replaceState(null, '', location.pathname + location.search);
  });
});

addEventListener('hashchange', showLinkedDialog);

const telegramPopup = document.getElementById('zeropopup');
const telegramTrigger = document.querySelector('[data-telegram-popup-trigger]');
if (telegramPopup) {
  const openTelegramPopup = (trigger, days) => {
    const key = `pinkypunk.telegram-${trigger}`;
    if (Number(preference(key)) > Date.now()) return;
    if (document.querySelector('dialog[open]')) return;
    showDialog(telegramPopup);
    try {
      localStorage.setItem(key, String(Date.now() + days * 86_400_000));
    } catch {
      // Keep the popup usable without persistent storage.
    }
  };
  setTimeout(() => openTelegramPopup('time', 2), 40_000);
  if (telegramTrigger) {
    const checkPosition = () => {
      if (telegramTrigger.getBoundingClientRect().top > innerHeight) return;
      removeEventListener('scroll', checkPosition);
      openTelegramPopup('scroll', 1);
    };
    addEventListener('scroll', checkPosition, { passive: true });
  }
}

if (ageDialog && !preference('pinkypunk.age-confirmed')) {
  ageDialog.addEventListener('cancel', (event) => event.preventDefault());
  ageDialog.querySelector('[data-pp-age-deny]')?.addEventListener('click', () => {
    const denial = ageDialog.querySelector('#pp-age-denial');
    ageDialog.querySelector('[data-pp-age-prompt]').hidden = true;
    ageDialog.setAttribute('aria-labelledby', denial.id);
    denial.hidden = false;
    denial.focus();
  });
  ageDialog.querySelector('[data-pp-age-confirm]').addEventListener('click', () => {
    remember('pinkypunk.age-confirmed');
    ageDialog.close();
    showLinkedDialog();
    document.dispatchEvent(new Event('pp:age-confirmed'));
  });
  ageDialog.showModal();
} else {
  showLinkedDialog();
}

if (cookieNotice && !preference('pinkypunk.cookie-notice')) {
  cookieNotice.hidden = false;
  cookieNotice.querySelector('button').addEventListener('click', () => {
    remember('pinkypunk.cookie-notice');
    cookieNotice.hidden = true;
  });
}

const search = document.querySelector('[data-pp-search-index]');

if (search) {
  const input = search.querySelector('input[type="search"]');
  const clear = search.querySelector('.pp-search-clear');
  const content = search.querySelector('.pp-search-content');
  const status = search.querySelector('.pp-search-status');
  const results = search.querySelector('.pp-search-results');
  let indexRequest;
  let revision = 0;

  const normalize = (value) => value.toLocaleLowerCase('ru-RU').replaceAll('ё', 'е').trim();

  function loadIndex() {
    indexRequest ??= fetch(search.dataset.ppSearchIndex)
      .then((response) => {
        if (!response.ok) throw new Error('Search index unavailable');
        return response.json();
      })
      .then((data) => (Array.isArray(data) ? data : data.items)
        .filter((item) => item && typeof item.url === 'string' && typeof item.title === 'string')
        .map(({ url, title, description = '' }) => ({
          url: new URL(url, document.baseURI),
          title,
          description,
          searchTitle: normalize(title),
          searchText: normalize(`${title} ${description}`),
        }))
        .filter(({ url }) => url.protocol === 'https:' || url.protocol === 'http:'))
      .catch((error) => {
        indexRequest = undefined;
        throw error;
      });
    return indexRequest;
  }

  function resultItem(item) {
    const entry = document.createElement('li');
    const link = document.createElement('a');
    link.href = item.url;
    link.textContent = item.title;
    entry.append(link);
    if (item.description) {
      const description = document.createElement('p');
      description.textContent = item.description;
      entry.append(description);
    }
    return entry;
  }

  async function updateResults() {
    const current = ++revision;
    const query = normalize(input.value);
    clear.hidden = !input.value;
    content.hidden = !query;
    results.replaceChildren();
    if (!query) {
      status.textContent = '';
      return;
    }

    status.textContent = 'Ищем…';
    try {
      const index = await loadIndex();
      if (current !== revision) return;
      const words = query.split(/\s+/);
      const matches = index.filter(({ searchText }) => words.every((word) => searchText.includes(word)));
      matches.sort((a, b) => Number(b.searchTitle.includes(query)) - Number(a.searchTitle.includes(query)));
      status.textContent = matches.length ? `Найдено: ${matches.length}` : 'По этому запросу ничего не найдено.';
      results.append(...matches.slice(0, 24).map(resultItem));
    } catch {
      if (current === revision) status.textContent = 'Поиск временно недоступен. Попробуйте ещё раз.';
    }
  }

  input.addEventListener('input', updateResults);
  clear.addEventListener('click', () => {
    input.value = '';
    input.focus();
    updateResults();
  });
  search.querySelector('.pp-search-topics').addEventListener('click', (event) => {
    const topic = event.target.closest('[data-pp-search-topic]');
    if (!topic) return;
    input.value = topic.textContent;
    input.focus();
    updateResults();
  });
}
