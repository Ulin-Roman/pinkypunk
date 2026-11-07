const catalog = document.querySelector('[data-local-catalog]');
if (catalog) {
  const form = catalog.querySelector('form');
  const { q: search, sort, series, min, max } = form.elements;
  const fields = [search, sort, series, min, max].filter(Boolean);
  const count = catalog.querySelector('[data-catalog-count]');
  const empty = catalog.querySelector('[data-catalog-empty]');
  const grid = catalog.querySelector('.catalog-grid');
  const cards = Array.from(grid.children);
  const collator = new Intl.Collator('ru', { numeric: true });
  const legacyFilters = (params) => Array.from(params).filter(([key]) => key.startsWith('tfc_charact:'));
  const normalize = (value) => value.toLocaleLowerCase('ru').replaceAll('ё', 'е').trim();
  let previousSort = '';

  function restoreFields() {
    const params = new URL(location.href).searchParams;
    for (const field of fields) {
      field.value = params.get(field.name) || '';
      if (!field.value) field.value = '';
    }
    const legacySeries = legacyFilters(params)[0]?.[1];
    if (!legacySeries || search.value || series?.value) return;
    if (series && Array.from(series.options).some(({ value }) => value === legacySeries)) series.value = legacySeries;
    else search.value = legacySeries;
  }

  function filter(updateURL) {
    const words = normalize(search.value).split(/\s+/).filter(Boolean);
    const usePrice = Boolean(min?.value || max?.value);
    const lowerPrice = min?.value ? Math.max(0, Number(min.value)) : 0;
    const upperPrice = max?.value ? Math.max(0, Number(max.value)) : Infinity;
    let matched = 0;
    for (const card of cards) {
      const text = normalize(card.dataset.text);
      const price = Number(card.dataset.price);
      const matchingPrice = !usePrice || (price > 0 && price >= lowerPrice && price <= upperPrice);
      const matchingSeries = !series?.value || card.dataset.series === series.value;
      const matchingText = words.every((word) => text.includes(word) || (word.endsWith('и') && text.includes(word.slice(0, -1))));
      const found = Boolean(matchingPrice && matchingSeries && matchingText);
      card.hidden = !found;
      matched += Number(found);
    }
    if (sort.value !== previousSort) {
      const ordered = cards.slice();
      if (sort.value === 'title-asc') {
        ordered.sort((first, second) => collator.compare(first.querySelector('h2').textContent, second.querySelector('h2').textContent));
      } else if (sort.value) {
        const direction = sort.value === 'price-asc' ? 1 : -1;
        ordered.sort((first, second) => {
          const a = Number(first.dataset.price);
          const b = Number(second.dataset.price);
          if (!a || !b) return Number(!a) - Number(!b);
          return direction * (a - b);
        });
      }
      grid.append(...ordered);
      previousSort = sort.value;
    }
    count.textContent = `Товаров: ${matched}`;
    empty.hidden = matched > 0;

    if (updateURL) {
      const current = new URL(location.href);
      legacyFilters(current.searchParams).forEach(([key]) => current.searchParams.delete(key));
      current.searchParams.delete('tfc_div');
      for (const field of fields) {
        if (field.value) current.searchParams.set(field.name, field.value);
        else current.searchParams.delete(field.name);
      }
      history.replaceState(history.state, '', current);
    }
  }

  form.addEventListener('input', () => filter(true));
  form.addEventListener('reset', () => queueMicrotask(() => filter(true)));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    filter(true);
  });
  addEventListener('popstate', () => {
    restoreFields();
    filter(false);
  });
  restoreFields();
  filter(false);
}
