const collator = new Intl.Collator('ru', { sensitivity: 'base', numeric: true });

for (const shelf of document.querySelectorAll('[data-shelf-filter]')) {
  const grid = shelf.querySelector('.shelf-grid');
  const search = shelf.querySelector('input[type="search"]');
  const order = shelf.querySelector('select');
  const tools = shelf.querySelector('.shelf-tools');
  const searchButton = tools.querySelector('[data-shelf-search]');
  const filtersButton = tools.querySelector('[data-shelf-filters]');
  const dialog = shelf.querySelector('.shelf-sort-dialog');
  const sortOptions = [...dialog.querySelectorAll('[data-shelf-sort-option]')];
  const empty = shelf.querySelector('.shelf-tools-empty');
  const cards = Array.from(grid.children, (element) => ({
    element,
    title: element.querySelector('h3').textContent,
    text: element.querySelector('.shelf-copy').textContent.toLocaleLowerCase('ru'),
    price: Number(element.dataset.shelfPrice),
    newest: Number(element.dataset.shelfNewest),
  }));
  const comparators = {
    price: (a, b) => a.price - b.price,
    title: (a, b) => collator.compare(a.title, b.title),
    created: (a, b) => b.newest - a.newest,
  };

  function update() {
    const query = search.value.trim().toLocaleLowerCase('ru');
    const [field, direction] = order.value.split(':');
    const sorted = [...cards];
    if (comparators[field]) {
      sorted.sort((a, b) => comparators[field](a, b) * (direction === 'desc' ? -1 : 1));
    }
    let shown = 0;
    for (const { element, text } of sorted) {
      element.hidden = !text.includes(query);
      if (!element.hidden) shown++;
      grid.append(element);
    }
    empty.hidden = shown !== 0;
    sortOptions.forEach((option) => option.setAttribute('aria-pressed', String(option.dataset.shelfSortOption === order.value)));
  }

  function showSearch(visible) {
    tools.classList.toggle('shelf-search-open', visible);
    searchButton.setAttribute('aria-expanded', String(visible));
    if (visible) search.focus();
    else {
      search.value = '';
      update();
      searchButton.focus();
    }
  }

  search.addEventListener('input', update);
  order.addEventListener('change', update);
  searchButton.addEventListener('click', () => showSearch(true));
  tools.querySelector('[data-shelf-search-close]').addEventListener('click', () => showSearch(false));
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && tools.classList.contains('shelf-search-open')) showSearch(false);
  });
  filtersButton.addEventListener('click', () => dialog.showModal());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
    const option = event.target.closest('[data-shelf-sort-option]');
    if (!option) return;
    order.value = option.dataset.shelfSortOption;
    update();
    dialog.close();
  });
  update();
}
