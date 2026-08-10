(() => {
  const stage = document.getElementById('stage');
  const loader = document.getElementById('loader');

  const posters = [];
  const pool = [];
  const tiles = new Set();
  let cursor = 0;
  let raf = 0;
  let last = 0;
  let reducedMotion = false;

  const rand = (min, max) => min + Math.random() * (max - min);

  function sizeRange() {
    const viewport = Math.min(window.innerWidth, 900);
    return {
      minWidth: Math.max(96, viewport * 0.11),
      maxWidth: Math.min(230, viewport * 0.3),
    };
  }

  function targetCount() {
    return Math.max(18, Math.round((window.innerWidth * window.innerHeight) / 30000));
  }

  function nextPoster() {
    if (cursor >= pool.length) {
      const shown = new Set(Array.from(tiles).map((t) => t.el.dataset.src));
      const remaining = posters.filter((p) => !shown.has(p.src));
      pool.length = 0;
      pool.push(...(remaining.length ? remaining : posters));
      for (let i = pool.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      cursor = 0;
    }
    return pool[cursor++];
  }

  function createTile(fromTop) {
    const poster = nextPoster();
    const { minWidth, maxWidth } = sizeRange();
    const depth = Math.random();
    const width = rand(minWidth, maxWidth) * (0.72 + 0.55 * depth);
    const height = width * 1.5;
    const rot = rand(-8, 8);
    const x = rand(0, Math.max(0, window.innerWidth - width));
    const speed = 10 + depth * 60;
    const blur = (1 - depth) * 2.6;
    const bright = 0.82 + depth * 0.18;
    const opacity = 0.7 + depth * 0.3;
    const y = fromTop
      ? -height - rand(0, 120)
      : rand(-height, Math.max(0, window.innerHeight - height * 1.2));

    const el = document.createElement('div');
    el.className = 'tile';
    el.dataset.src = poster.src;
    el.style.width = `${width.toFixed(0)}px`;
    el.style.height = `${height.toFixed(0)}px`;
    el.style.willChange = 'transform, filter, opacity';
    el.style.zIndex = String(Math.round(depth * 40));
    el.style.setProperty('--dblur', `${blur.toFixed(1)}px`);
    el.style.setProperty('--dbright', bright.toFixed(2));
    el.style.setProperty('--dopacity', opacity.toFixed(2));

    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.addEventListener('error', () => {
      tiles.delete(data);
      el.remove();
    });
    img.src = poster.src;

    el.appendChild(img);
    el.addEventListener('click', () => {
      if (poster.url) window.open(poster.url, '_blank', 'noopener');
    });
    el.style.cursor = 'pointer';
    el.title = poster.title ? poster.title.split(' / ')[0] : '';

    const data = { el, img, x, y, rot, speed, width, height };
    el._data = data;
    tiles.add(data);
    stage.appendChild(el);

    if (reducedMotion) {
      data.y = rand(0, Math.max(0, window.innerHeight - height));
      setTransform(data);
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-visible')));
      return data;
    }

    setTransform(data);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-visible')));
    return data;
  }

  function setTransform(tile) {
    tile.el.style.transform = `translate3d(${tile.x.toFixed(1)}px, ${tile.y.toFixed(1)}px, 0) rotate(${tile.rot.toFixed(1)}deg)`;
  }

  function frame(now) {
    raf = 0;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    for (const tile of Array.from(tiles)) {
      tile.y += tile.speed * dt;
      if (tile.y > window.innerHeight + 40) {
        tiles.delete(tile);
        tile.el.classList.remove('is-visible');
        tile.el.classList.add('is-leaving');
        setTimeout(() => tile.el.remove(), 700);
      } else {
        setTransform(tile);
      }
    }

    while (tiles.size < targetCount()) createTile(true);

    raf = requestAnimationFrame(frame);
  }

  function start() {
    last = performance.now();
    const burst = Math.min(targetCount(), 26);
    for (let i = 0; i < burst; i += 1) createTile(false);
    while (tiles.size < targetCount()) createTile(true);
    if (!reducedMotion) raf = requestAnimationFrame(frame);
  }

  window.addEventListener('resize', () => {
    if (reducedMotion) {
      for (const tile of tiles) setTransform(tile);
    }
  });

  async function init() {
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    try {
      const response = await fetch('data/movies.json');
      if (!response.ok) throw new Error(String(response.status));
      const movies = await response.json();
      for (const movie of movies) {
        if (movie.poster) {
          posters.push({ src: movie.poster, url: movie.url, title: movie.title });
        }
      }
      if (!posters.length) throw new Error('empty');
    } catch (error) {
      console.error(error);
      loader.textContent = '数据加载失败';
      return;
    }

    loader.classList.add('is-done');
    start();
  }

  init();
})();
