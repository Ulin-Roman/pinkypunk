const fitting = document.querySelector('[data-pp-fitting]');

if (fitting) {
  const query = (selector) => fitting.querySelector(selector);
  const models = Array.from(fitting.querySelectorAll('[role="tab"]'), (tab) => ({
    tab,
    ...tab.dataset,
    recommended: Number(tab.dataset.recommended),
    maximum: Number(tab.dataset.maximum),
    widths: JSON.parse(tab.dataset.widths),
    count: 0,
  }));
  const range = query('.pp-fitting-range');
  const canvas = query('.pp-fitting-scene');
  const context = canvas.getContext('2d');
  const stage = query('.pp-fitting-stage');
  const workbench = query('.pp-fitting-workbench');
  const diagram = query('.pp-fitting-diagram');
  const photoChip = query('.pp-fitting-photo-chip');
  const diagramChip = query('.pp-fitting-diagram-chip');
  const name = query('[data-fitting-name]');
  const count = query('[data-fitting-count]');
  const width = query('[data-fitting-width]');
  const copy = query('[data-fitting-copy]');
  const recommended = query('[data-fitting-safe]');
  const maximum = query('[data-fitting-max]');
  const buy = query('.pp-fitting-buy');
  let current = models.find((model) => model.tab.getAttribute('aria-selected') === 'true');
  let inRange = !('IntersectionObserver' in window);

  function loadSprite(model) {
    if (!context || model.image) return;
    model.image = new Image();
    model.image.onload = () => {
      if (model === current) renderPhoto();
    };
    model.image.src = model.fittingSprite;
  }

  function renderPhoto() {
    const image = current.image;
    const frame = current.count / 5;
    const x = (frame % 4) * canvas.width;
    const y = Math.floor(frame / 4) * canvas.height;
    const ready = Boolean(image?.complete && image.naturalWidth >= x + canvas.width
      && image.naturalHeight >= y + canvas.height);
    canvas.hidden = !ready;
    diagram.hidden = ready;
    photoChip.hidden = !ready;
    diagramChip.hidden = ready;
    if (ready) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, x, y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    }
  }

  function diameter(value, anchors) {
    for (let index = 1; index < anchors.length; index += 1) {
      const [end, high] = anchors[index];
      if (value <= end) {
        const [start, low] = anchors[index - 1];
        return low + (high - low) * (value - start) / (end - start);
      }
    }
    return anchors[anchors.length - 1][1];
  }

  function render() {
    const value = current.count;
    const size = diameter(value, current.widths);
    const beyond = value > current.widths[current.widths.length - 1][0];
    const sizeLabel = `${beyond ? 'свыше ' : ''}≈ ${size.toFixed(1).replace('.', ',')} см`;
    const over = (value - current.recommended) / 5;
    const messages = [
      'Надуть так можно. Использовать внутри — уже не надо.',
      'Показываем, что форма держится. Проверять этот запас внутри не стоит.',
      'Это уже тест, а не рабочий размер. Для использования внутри — стоп.',
      'Красная зона. Можно повредить и игрушку, и себя — пора сдувать.',
    ];
    const colors = ['#ff9d00', '#ff6a00', '#ff453a', '#ff2d55', '#ff1744', '#ff0038'];
    const color = over > 0 ? colors[Math.min(over - 1, colors.length - 1)] : '#32d27f';
    const fraction = value / current.recommended;
    let message = 'Пока скромничает. Но мы-то знаем, зачем ты здесь.';
    if (over > 0) message = messages[Math.min(over - 1, messages.length - 1)];
    else if (over === 0) message = 'Рекомендуемый предел. Для использования внутри — остановиться здесь.';
    else if (fraction > 0.72) message = 'Уверенный размер. Всё ещё зелёная зона — можно примеряться дальше.';
    else if (fraction > 0.42) message = 'Вот теперь разговор становится предметным.';
    else if (fraction > 0.08) message = 'Разминается. Всё большое когда-то начинало с пары качков.';
    range.style.setProperty('--range-progress', `${value / current.maximum * 100}%`);
    range.style.setProperty('--range-color', color);
    range.setAttribute('aria-valuetext', `${value} качков, примерная ширина ${sizeLabel}`);
    count.textContent = value;
    count.style.color = over > 0 ? color : '';
    width.textContent = sizeLabel;
    copy.textContent = message;
    stage.style.setProperty('--diagram-width', `${size / 6.3 * 100}%`);
    canvas.setAttribute('aria-label', `${current.name} рядом с банкой Burn, ${value} качков`);
    renderPhoto();
  }

  function select(model) {
    current = model;
    for (const item of models) {
      item.tab.setAttribute('aria-selected', String(item === current));
      item.tab.tabIndex = item === current ? 0 : -1;
    }
    workbench.setAttribute('aria-labelledby', model.tab.id);
    name.textContent = model.name;
    range.max = model.maximum;
    range.value = model.count;
    range.setAttribute('aria-label', `Количество качков для модели «${model.name}»`);
    recommended.textContent = `до ${model.recommended}`;
    maximum.textContent = model.maximum;
    fitting.style.setProperty('--safe-position', `${model.recommended / model.maximum * 100}%`);
    buy.textContent = model.buyLabel;
    buy.href = model.buyUrl;
    if (inRange) loadSprite(model);
    render();
  }

  for (const [index, model] of models.entries()) {
    model.tab.addEventListener('click', () => select(model));
    model.tab.addEventListener('keydown', (event) => {
      const targets = {
        ArrowLeft: (index + models.length - 1) % models.length,
        ArrowRight: (index + 1) % models.length,
        Home: 0,
        End: models.length - 1,
      };
      if (!Object.hasOwn(targets, event.key)) return;
      event.preventDefault();
      const next = models[targets[event.key]];
      select(next);
      next.tab.focus();
    });
  }
  range.addEventListener('input', () => {
    current.count = Number(range.value);
    render();
  });
  select(current);
  if (!inRange) {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      inRange = true;
      loadSprite(current);
      observer.disconnect();
    }, { rootMargin: '200px' });
    observer.observe(stage);
  }
}
