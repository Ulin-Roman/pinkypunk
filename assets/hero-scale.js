const heroes = Array.from(document.querySelectorAll('.artboard[data-hero-scale]'), (board) => {
  const scaleHeights = JSON.parse(board.dataset.heroScale);
  const breakpoints = board.dataset.screens.split(',').map(Number).reverse();
  return {
    board,
    backgrounds: board.querySelectorAll(':scope > .art-background, :scope > .art-tint'),
    sizes: breakpoints.map((width) => ({
      width,
      height: scaleHeights[width],
      media: matchMedia(`(min-width: ${width}px)`),
    })),
  };
});
function resizeCatalogHeroes() {
  const viewport = document.documentElement.clientWidth;
  for (const { board, backgrounds, sizes } of heroes) {
    const size = sizes.find(({ media }) => media.matches);
    if (!size?.height) {
      board.style.zoom = '';
      board.style.width = '';
      board.style.height = '';
      backgrounds.forEach((background) => { background.style.height = ''; });
      continue;
    }

    // These catalog boards have only grid elements at their scalable breakpoints.
    // The authored centered coordinates then resolve against the design width.
    const scale = Number((viewport / size.width).toFixed(3));
    const height = `${Math.floor(size.height * scale) / scale}px`;
    board.style.width = `${size.width}px`;
    board.style.zoom = String(scale);
    board.style.height = height;
    backgrounds.forEach((background) => { background.style.height = height; });
  }
}

addEventListener('resize', resizeCatalogHeroes, { passive: true });
resizeCatalogHeroes();
