const catalog = document.querySelector('[data-local-catalog]');
if (catalog) {
  const form = catalog.querySelector('form');
  const { q: search, sort, min, max, available } = form.elements;
  const fields = [search, sort, min, max].filter(Boolean);
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
  const normalize = (value) => value.toLocaleLowerCase('ru').replaceAll('ё', 'е').trim();
  const cards = Array.from(grid.children, (node) => ({
    node,
    title: node.querySelector('h2').textContent,
    text: normalize(node.dataset.text),
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

  function restoreFields() {
    const params = new URL(location.href).searchParams;
    for (const field of fields) {
      field.value = params.get(field.name) || '';
      if (!field.value) field.value = '';
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
      if (values.length && group.container.tagName === 'DETAILS') group.container.open = true;
    }
    const legacySeries = legacy.find(([key]) => key.startsWith('tfc_charact:10811812'))?.[1];
    if (legacySeries && !search.value && !facetGroups.some(({ name }) => name === 'series')) search.value = legacySeries;
  }

  function filter(updateURL, focusIndex = -1) {
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
    const words = normalize(search.value).split(/\s+/).filter(Boolean);
    const usePrice = Boolean(min?.value || max?.value);
    const lowerPrice = min?.value ? Math.max(0, Number(min.value)) : 0;
    const upperPrice = max?.value ? Math.max(0, Number(max.value)) : Infinity;
    const selected = facetGroups.map(({ name, inputs }) => ({
      name,
      values: inputs.filter((input) => input.type !== 'checkbox' || input.checked).map(({ value }) => value).filter(Boolean),
    }));
    let matched = 0;
    let firstNewCard;
    for (const card of orderedCards) {
      const matchingPrice = !usePrice || (card.price > 0 && card.price >= lowerPrice && card.price <= upperPrice);
      const matchingTraits = selected.every(({ name, values }) => !values.length ||
        values.some((value) => card.traits[name]?.includes(value)));
      const matchingStock = !available?.checked || card.available;
      const matchingText = words.every((word) => card.text.includes(word) ||
        (word.length > 2 && word.endsWith('и') && card.text.includes(word.slice(0, -1))));
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
        if (key.startsWith('tfc_quantity')) current.searchParams.delete(key);
      }
      current.searchParams.delete('tfc_div');
      for (const field of fields) {
        if (field.value) current.searchParams.set(field.name, field.value);
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
