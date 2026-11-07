// Russian word endings follow the Snowball algorithm so catalogue search finds inflected forms.
// https://snowballstem.org/algorithms/russian/stemmer.html
function russianStem(word) {
  if (!/^[а-я]+$/.test(word)) return word;
  const firstVowel = word.search(/[аеиоуыэюя]/);
  if (firstVowel < 0) return word;
  const prefix = word.slice(0, firstVowel + 1);
  const rv = word.slice(prefix.length);
  const r2 = rv.match(/^[аеиоуыэюя]*[^аеиоуыэюя]+[аеиоуыэюя]+[^аеиоуыэюя]/)?.[0].length ?? rv.length;
  let stem = rv.replace(/(?:ившись|ывшись|ивши|ывши|ив|ыв|([ая])(?:вшись|вши|в))$/, '$1');
  if (stem === rv) {
    stem = rv.replace(/(?:ся|сь)$/, '');
    const adjective = stem.replace(/(?:ими|ыми|его|ого|ему|ому|ее|ие|ые|ое|ей|ий|ый|ой|ем|им|ым|ом|их|ых|ую|юю|ая|яя|ою|ею)$/, '');
    if (adjective !== stem) {
      stem = adjective.replace(/(?:ивш|ывш|ующ|([ая])(?:ющ|ем|нн|вш|щ))$/, '$1');
    } else {
      const verb = stem.replace(/(?:ейте|уйте|ила|ыла|ена|ите|или|ыли|ило|ыло|ено|ует|уют|ены|ить|ыть|ишь|ей|уй|ил|ыл|им|ым|ен|ят|ит|ыт|ую|ю|([ая])(?:ете|йте|ешь|нно|ла|на|ли|ло|но|ет|ют|ны|ть|ем|й|л|н))$/, '$1');
      stem = verb !== stem ? verb : stem.replace(/(?:иями|ями|ами|ией|иям|ием|иях|ев|ов|ие|ье|еи|ии|ей|ой|ий|ям|ем|ам|ом|ах|ях|ию|ью|ия|ья|а|е|и|й|о|у|ы|ь|ю|я)$/, '');
    }
  }
  stem = stem.replace(/и$/, '');
  stem = stem.slice(0, r2) + stem.slice(r2).replace(/ость?$/, '');
  if (stem.endsWith('нн')) stem = stem.slice(0, -1);
  else if (/ейше?$/.test(stem)) stem = stem.replace(/ейше?$/, '').replace(/нн$/, 'н');
  else stem = stem.replace(/ь$/, '');
  return prefix + stem;
}

function searchWords(text) {
  return (text.toLocaleLowerCase('ru').replaceAll('ё', 'е').match(/[\p{L}\p{N}]+/gu) || []).map(russianStem);
}

const catalog = document.querySelector('[data-local-catalog]');
if (catalog) {
  const form = catalog.querySelector('form');
  const { q: search, sort, min, max, available } = form.elements;
  const fields = [search, sort, min, max].filter(Boolean);
  const priceRange = form.querySelector('[data-catalog-price-range]');
  const priceHandles = priceRange ? Array.from(priceRange.querySelectorAll('[data-catalog-price-bound]')) : [];
  const reset = form.querySelector('[data-catalog-reset]');
  const priceFormat = new Intl.NumberFormat('ru', { maximumFractionDigits: 2 });
  const parsePrice = (value) => {
    const plain = value.replace(/\s/g, '').replace(',', '.');
    return /^\d+(?:\.\d{1,2})?$/.test(plain) ? Number(plain) : null;
  };
  const facetGroups = Array.from(form.querySelectorAll('[data-catalog-facet]'), (container) => ({
    container,
    name: container.dataset.catalogFacet,
    legacy: `tfc_charact:${container.dataset.legacyFacet}`,
    inputs: Array.from(container.querySelectorAll('input, select')),
  }));
  const count = catalog.querySelector('[data-catalog-count]');
  const empty = catalog.querySelector('[data-catalog-empty]');
  const more = catalog.querySelector('[data-catalog-more]');
  const grid = catalog.querySelector('.catalog-grid');
  const pageSize = Number(catalog.dataset.pageSize);
  const collator = new Intl.Collator('ru', { numeric: true });
  const legacyFilters = (params) => Array.from(params).filter(([key]) => key.startsWith('tfc_charact:'));
  const cards = Array.from(grid.children, (node) => ({
    node,
    title: node.querySelector('h2').textContent,
    words: new Set(searchWords(node.dataset.text)),
    traits: JSON.parse(node.dataset.facets || '{}'),
    price: Number(node.dataset.price),
    available: node.dataset.available === 'yes',
    rank: Number(node.dataset.createdRank || 'Infinity'),
  }));
  let orderedCards = cards;
  let limit = pageSize;
  let previousSort = '';
  const mobile = matchMedia('(max-width: 960px)');
  const searchToggle = form.querySelector('[aria-controls="catalog-search"]');
  const searchClose = form.querySelector('[data-catalog-search-close]');
  const facets = document.getElementById('catalog-facets');
  const filterDialog = document.getElementById('catalog-filters-dialog');

  function setExpanded(button, expanded) {
    button.setAttribute('aria-expanded', String(expanded));
  }

  function toggleSearch(expanded) {
    form.toggleAttribute('data-catalog-search-open', expanded);
    searchToggle.setAttribute('aria-expanded', String(expanded));
    if (mobile.matches) (expanded ? search : searchToggle).focus();
  }

  searchToggle.addEventListener('click', () => toggleSearch(true));
  searchClose.addEventListener('click', () => toggleSearch(false));
  const dialogs = [];
  for (const control of form.querySelectorAll('[data-catalog-toggle][aria-haspopup="dialog"]')) {
    const dialog = document.getElementById(control.getAttribute('aria-controls'));
    const content = dialog.querySelector('[data-catalog-modal-content]');
    dialogs.push(dialog);
    control.addEventListener('click', () => {
      if (dialog === filterDialog) content.append(facets);
      for (const option of content.querySelectorAll('[data-catalog-sort]')) {
        option.setAttribute('aria-pressed', String(option.dataset.catalogSort === sort.value));
      }
      dialog.showModal();
      control.setAttribute('aria-expanded', 'true');
    });
    dialog.addEventListener('close', () => {
      if (dialog === filterDialog) dialog.before(facets);
      control.setAttribute('aria-expanded', 'false');
      if (mobile.matches) control.focus();
    });
    dialog.addEventListener('click', (event) => {
      const option = event.target.closest('[data-catalog-sort]');
      if (option) {
        sort.value = option.dataset.catalogSort;
        filter(true);
        dialog.close();
      } else if (event.target.closest('[data-catalog-close]')) {
        dialog.close();
      } else if (event.target === dialog && event.clientY < dialog.getBoundingClientRect().top) {
        dialog.close();
      }
    });
  }
  mobile.addEventListener('change', () => {
    if (mobile.matches) return;
    for (const dialog of dialogs) if (dialog.open) dialog.close();
    toggleSearch(false);
  });
  form.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !form.hasAttribute('data-catalog-search-open')) return;
    event.preventDefault();
    toggleSearch(false);
  });
  form.setAttribute('data-catalog-mobile-ready', '');

  function syncPriceSlider() {
    if (!priceRange) return;
    const [low, high] = priceHandles;
    const lower = parsePrice(min.value);
    const upper = parsePrice(max.value);
    low.value = lower === Number(priceRange.dataset.min) ? low.min : lower ?? low.min;
    high.value = upper === Number(priceRange.dataset.max) ? high.max : upper ?? high.max;
    const start = Number(low.min);
    const distance = Number(low.max) - start;
    priceRange.style.setProperty('--price-start', `${(Number(low.value) - start) / distance * 100}%`);
    priceRange.style.setProperty('--price-end', `${(Number(high.value) - start) / distance * 100}%`);
  }

  for (const handle of priceHandles) {
    handle.addEventListener('input', () => {
      if (handle.dataset.catalogPriceBound === 'min') {
        min.value = priceFormat.format(Math.min(Number(handle.value), Number(priceHandles[1].value)));
      } else {
        max.value = priceFormat.format(Math.max(Number(handle.value), Number(priceHandles[0].value)));
      }
    });
  }

  form.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-catalog-facet-toggle]');
    if (toggle) setExpanded(toggle, toggle.getAttribute('aria-expanded') !== 'true');
    const expand = event.target.closest('[data-catalog-expand-options]');
    if (expand) {
      const expanded = expand.getAttribute('aria-expanded') !== 'true';
      setExpanded(expand, expanded);
      expand.textContent = expanded ? 'Свернуть' : 'Показать все';
    }
    const option = event.target.closest('[data-catalog-select-option]');
    if (option) {
      const input = option.parentElement.querySelector('[data-catalog-select-value]');
      const value = option.dataset.catalogSelectOption;
      input.value = input.value === value ? '' : value;
      filter(true);
    }
  });

  function restoreFields() {
    const params = new URL(location.href).searchParams;
    const legacyField = (name) => [...params].find(([key]) => key.startsWith(`tfc_${name}[`))?.[1];
    const legacySort = legacyField('sort')?.replace(':', '-');
    const legacyValues = { q: legacyField('query'), sort: legacySort, min: legacyField('price:min'), max: legacyField('price:max') };
    for (const field of fields) {
      field.value = params.get(field.name) || legacyValues[field.name] || field.defaultValue || '';
    }
    if (available) {
      available.checked = params.get('available') === 'y' ||
        [...params].some(([key, value]) => key.startsWith('tfc_quantity') && value === 'y');
    }
    const legacy = legacyFilters(params);
    for (const group of facetGroups) {
      const values = params.getAll(group.name);
      if (!values.length) {
        for (const [key, value] of legacy) {
          if (key === group.legacy || key.startsWith(`${group.legacy}[`)) values.push(value);
        }
      }
      for (const input of group.inputs) {
        if (input.type === 'checkbox') input.checked = values.includes(input.value);
        else input.value = values[0] || '';
      }
      if (values.length) {
        setExpanded(group.container.querySelector('[data-catalog-facet-toggle]'), true);
        const extraChecked = group.container.querySelector('[data-catalog-extra-option] input:checked');
        if (extraChecked) {
          const expand = group.container.querySelector('[data-catalog-expand-options]');
          setExpanded(expand, true);
          expand.textContent = 'Свернуть';
        }
      }
    }
    const legacySeries = legacy.find(([key]) => key.startsWith('tfc_charact:10811812'))?.[1];
    if (legacySeries && !search.value && !facetGroups.some(({ name }) => name === 'series')) search.value = legacySeries;
  }

  function filter(updateURL, focusIndex = -1) {
    syncPriceSlider();
    if (updateURL) limit = pageSize;
    if (sort.value !== previousSort) {
      orderedCards = cards.slice();
      if (sort.value.startsWith('title-')) {
        const direction = sort.value === 'title-asc' ? 1 : -1;
        orderedCards.sort((first, second) => direction * collator.compare(first.title, second.title));
      } else if (sort.value.startsWith('created-')) {
        const direction = sort.value === 'created-desc' ? 1 : -1;
        orderedCards.sort((first, second) => direction * (first.rank - second.rank));
      } else if (sort.value) {
        const direction = sort.value === 'price-asc' ? 1 : -1;
        orderedCards.sort((first, second) => {
          const a = first.price;
          const b = second.price;
          if (!a || !b) return Number(!a) - Number(!b);
          return direction * (a - b);
        });
      }
      grid.append(...orderedCards.map(({ node }) => node));
      previousSort = sort.value;
    }
    const words = searchWords(search.value);
    const lowerPrice = parsePrice(min?.value || '');
    const upperPrice = parsePrice(max?.value || '');
    const lowerActive = lowerPrice !== null && lowerPrice !== Number(priceRange?.dataset.min);
    const upperActive = upperPrice !== null && upperPrice !== Number(priceRange?.dataset.max);
    const selected = facetGroups.map(({ name, inputs }) => ({
      name,
      values: inputs.filter((input) => input.type !== 'checkbox' || input.checked).map(({ value }) => value).filter(Boolean),
    }));
    for (const { container, inputs } of facetGroups) {
      for (const option of container.querySelectorAll('[data-catalog-select-option]')) {
        option.setAttribute('aria-pressed', String(option.dataset.catalogSelectOption === inputs[0].value));
      }
    }
    if (reset) reset.hidden = !lowerActive && !upperActive && !available?.checked && !selected.some(({ values }) => values.length);
    let matched = 0;
    let firstNewCard;
    for (const card of orderedCards) {
      const matchingPrice = (!lowerActive || card.price >= lowerPrice) && (!upperActive || card.price <= upperPrice);
      const matchingTraits = selected.every(({ name, values }) => !values.length ||
        values.some((value) => card.traits[name]?.includes(value)));
      const matchingStock = !available?.checked || card.available;
      const matchingText = words.every((word) => card.words.has(word));
      const matches = matchingPrice && matchingTraits && matchingStock && matchingText;
      if (matches && matched === focusIndex) firstNewCard = card.node;
      matched += Number(matches);
      const hidden = !matches || matched > limit;
      if (card.node.hidden !== hidden) card.node.hidden = hidden;
    }
    count.textContent = `Товаров: ${matched}`;
    empty.hidden = matched > 0;
    if (document.activeElement === more) firstNewCard?.querySelector('a')?.focus();
    more.hidden = matched <= limit;

    if (updateURL) {
      const current = new URL(location.href);
      legacyFilters(current.searchParams).forEach(([key]) => current.searchParams.delete(key));
      for (const key of [...current.searchParams.keys()]) {
        if (/^tfc_(?:query|quantity|sort|price:(?:min|max))(?:\[|$)/.test(key)) current.searchParams.delete(key);
      }
      current.searchParams.delete('tfc_div');
      for (const field of fields) {
        const value = field === min ? (lowerActive ? lowerPrice : '') : field === max ? (upperActive ? upperPrice : '') : field.value;
        if (value !== '') current.searchParams.set(field.name, value);
        else current.searchParams.delete(field.name);
      }
      for (const { name, values } of selected) {
        current.searchParams.delete(name);
        for (const value of values) current.searchParams.append(name, value);
      }
      if (available?.checked) current.searchParams.set('available', 'y');
      else current.searchParams.delete('available');
      if (current.href !== location.href) history.replaceState(history.state, '', current);
    }
  }

  more.addEventListener('click', () => {
    const firstNewIndex = limit;
    limit += pageSize;
    filter(false, firstNewIndex);
  });
  form.addEventListener('input', () => filter(true));
  form.addEventListener('reset', () => queueMicrotask(() => filter(true)));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    filter(true);
  });
  addEventListener('popstate', () => {
    limit = pageSize;
    restoreFields();
    filter(false);
  });
  restoreFields();
  filter(false);
}
