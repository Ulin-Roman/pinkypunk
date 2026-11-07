const cart = document.querySelector('[data-pp-cart]');
const shopBase = new URL('../', import.meta.url);
const preview = cart?.hasAttribute('data-cart-preview');
const storageKey = `pinkypunk.cart.v1:${shopBase.pathname}${preview ? ':preview' : ''}`;
const maxQuantity = 99;
const maxPrice = 1_000_000_000;
const rubles = new Intl.NumberFormat('ru-RU', {
  style: 'currency', currency: 'RUB', minimumFractionDigits: 0, maximumFractionDigits: 2,
});

function priceInKopecks(value) {
  const text = value?.replace(/\s/g, '').replace(/(?:₽|руб\.?|р\.)$/i, '').replace(',', '.');
  if (!text || !/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const amount = Math.round(Number(text) * 100);
  return amount <= maxPrice ? amount : null;
}

function safeUrl(value, image = false) {
  if (!value || typeof value !== 'string' || value.startsWith('#')) return '';
  try {
    const target = new URL(value.startsWith('/assets/') ? value.slice(1) : value, shopBase);
    if (target.username || target.password) return '';
    const local = target.origin === shopBase.origin && target.pathname.startsWith(shopBase.pathname);
    if (local) return target.href;
    const official = target.hostname === 'pinkypunk.ru' || target.hostname === 'www.pinkypunk.ru';
    if (target.protocol === 'https:' && (image || (!preview && official))) return target.href;
  } catch {
    // Invalid metadata is optional and does not prevent adding the item.
  }
  return '';
}

function validItem(item) {
  return item && typeof item.id === 'string' && item.id.length > 0 &&
    typeof item.title === 'string' && item.title.length > 0 &&
    Number.isInteger(item.price) && item.price >= 0 && item.price <= maxPrice &&
    Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= maxQuantity;
}

function loadBasket() {
  let raw;
  try {
    raw = localStorage.getItem(storageKey);
  } catch {
    return null;
  }
  try {
    const entries = JSON.parse(raw ?? '[]');
    if (Array.isArray(entries)) return new Map(entries.filter(validItem).map((item) => [item.id, item]));
  } catch {
    // Corrupt storage can be replaced by the next change.
  }
  return new Map();
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function itemButton(action, text, label, disabled = false) {
  const button = element('button', `pp-cart-${action}`, text);
  button.type = 'button';
  button.dataset.cartAction = action;
  button.setAttribute('aria-label', label);
  button.disabled = disabled;
  return button;
}

function itemRow(item) {
  const row = element('li', 'pp-cart-row');
  row.dataset.cartRow = item.id;

  const image = safeUrl(item.image, true);
  if (image) {
    const thumbnail = element('img', 'pp-cart-thumbnail');
    thumbnail.src = image;
    thumbnail.alt = '';
    thumbnail.loading = 'lazy';
    thumbnail.decoding = 'async';
    row.append(thumbnail);
  }

  const info = element('div', 'pp-cart-item-info');
  const url = safeUrl(item.url);
  const title = element(url ? 'a' : 'span', 'pp-cart-item-title', item.title);
  if (url) title.href = url;
  info.append(title, element('span', 'pp-cart-unit-price', rubles.format(item.price / 100)));

  const quantity = element('div', 'pp-cart-quantity');
  quantity.setAttribute('role', 'group');
  quantity.setAttribute('aria-label', `Количество: ${item.title}`);
  quantity.append(
    itemButton('decrease', '−', 'Уменьшить количество', item.quantity === 1),
    element('span', 'pp-cart-quantity-value', String(item.quantity)),
    itemButton('increase', '+', 'Увеличить количество', item.quantity === maxQuantity),
  );
  row.append(
    info, quantity,
    element('strong', 'pp-cart-item-total', rubles.format(item.price * item.quantity / 100)),
    itemButton('remove', '×', `Удалить: ${item.title}`),
  );
  return row;
}

if (cart) {
  const list = cart.querySelector('[data-cart-items]');
  const empty = cart.querySelector('[data-cart-empty]');
  const total = cart.querySelector('[data-cart-total]');
  const summary = cart.querySelector('[data-cart-summary]');
  const checkout = cart.querySelector('[data-cart-checkout]');
  const status = cart.querySelector('[data-cart-status]');
  const counters = document.querySelectorAll('[data-cart-count]');
  const openers = document.querySelectorAll('[data-cart-open]');
  let items = loadBasket() ?? new Map();
  let persistent = true;

  function render(message = '') {
    const focused = document.activeElement;
    const focusedRow = list.contains(focused) ? focused.closest('[data-cart-row]') : null;
    const rows = new Map();
    let count = 0;
    let amount = 0;
    for (const item of items.values()) {
      rows.set(item.id, itemRow(item));
      count += item.quantity;
      amount += item.price * item.quantity;
    }
    list.replaceChildren(...rows.values());
    list.hidden = !count;
    empty.hidden = Boolean(count);
    total.textContent = rubles.format(amount / 100);
    if (summary) summary.hidden = !count;
    if (checkout) checkout.hidden = preview || !count;
    if (status) status.textContent = message;

    for (const counter of counters) {
      counter.textContent = count > 99 ? '99+' : String(count);
      counter.hidden = !count;
    }
    for (const opener of openers) {
      opener.setAttribute('aria-label', count ? `Корзина, товаров: ${count}` : 'Корзина');
    }

    if (focusedRow) {
      const row = rows.get(focusedRow.dataset.cartRow);
      const focusedAction = focused.dataset.cartAction;
      const next = row?.querySelector(focusedAction ? `[data-cart-action="${focusedAction}"]:not(:disabled)` : 'a')
        ?? row?.querySelector('button:not(:disabled)')
        ?? list.querySelector('button:not(:disabled)')
        ?? cart.querySelector('[data-cart-close]');
      next?.focus();
    }
  }

  function updateBasket(update) {
    if (persistent) items = loadBasket() ?? items;
    const message = update();
    if (persistent) {
      try {
        localStorage.setItem(storageKey, JSON.stringify([...items.values()]));
      } catch {
        // Keep the basket usable on this page when browser storage is unavailable.
        persistent = false;
      }
    }
    render(message);
  }

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const control = event.target.closest('[data-cart-add]');
    if (!control || document.querySelector('#pp-age[open]')) return;
    const id = control.dataset.cartAdd?.trim();
    const title = control.dataset.cartTitle?.trim();
    const price = priceInKopecks(control.dataset.cartPrice);
    if (!id || !title || price === null) return;

    event.preventDefault();
    const image = safeUrl(control.dataset.cartImage, true);
    const url = safeUrl(control.dataset.cartLink || control.getAttribute('href'));
    updateBasket(() => {
      const previous = items.get(id)?.quantity ?? 0;
      items.set(id, { id, title, price, image, url, quantity: Math.min(previous + 1, maxQuantity) });
      return previous === maxQuantity ? 'Достигнуто максимальное количество.' : `Добавлено: ${title}.`;
    });
    document.dispatchEvent(new Event('pp:cart-open'));
  });

  list.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-cart-action]');
    const id = button?.closest('[data-cart-row]')?.dataset.cartRow;
    if (!id) return;
    updateBasket(() => {
      const item = items.get(id);
      if (!item) return '';
      const action = button.dataset.cartAction;
      if (action === 'remove') {
        items.delete(id);
        return `Удалено: ${item.title}.`;
      }
      const change = action === 'increase' ? 1 : -1;
      item.quantity = Math.max(1, Math.min(maxQuantity, item.quantity + change));
      return `${item.title}, количество: ${item.quantity}.`;
    });
  });

  function refreshBasket() {
    if (persistent) items = loadBasket() ?? items;
    render();
  }

  window.addEventListener('storage', (event) => {
    if (event.key === storageKey || event.key === null) refreshBasket();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) refreshBasket();
  });
  render();
}
