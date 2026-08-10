(() => {
  const stage = document.getElementById('stage');

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
      minWidth: Math.max(80, viewport * 0.08),
      maxWidth: Math.min(170, viewport * 0.2),
    };
  }

  function targetCount() {
    return Math.max(14, Math.min(30, Math.round((window.innerWidth * window.innerHeight) / 36000)));
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

  function applyDepth(tile) {
    const d = tile.depth;
    tile.el.style.zIndex = String(Math.round(d * 40));
    tile.el.style.setProperty('--dblur', `${((1 - d) * 2.0).toFixed(1)}px`);
    tile.el.style.setProperty('--dbright', (0.82 + d * 0.18).toFixed(2));
    tile.el.style.setProperty('--dopacity', (0.7 + d * 0.3).toFixed(2));
  }

  function pickX(width, height, depth, y) {
    const viewportWidth = window.innerWidth;
    return rand(0, Math.max(0, viewportWidth - width));
  }

  function createTile(fromTop) {
    const poster = nextPoster();
    const { minWidth, maxWidth } = sizeRange();
    const roll = Math.random();
    const depth = roll < 0.5 ? 1 : roll < 0.8 ? 0.5 : 0;
    const width = rand(minWidth, maxWidth) * (0.75 + 0.4 * depth);
    const height = width * 1.5;
    const rot = rand(-8, 8);
    const speed = 10 + depth * 60;
    const y = fromTop
      ? -height - rand(0, 120)
      : rand(-height, Math.max(0, window.innerHeight - height * 1.2));
    const x = pickX(width, height, depth, y);

    const el = document.createElement('div');
    el.className = 'tile';
    el.dataset.src = poster.src;
    el.style.width = `${width.toFixed(0)}px`;
    el.style.height = `${height.toFixed(0)}px`;
    el.style.willChange = 'transform, opacity';

    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    img.addEventListener('error', () => {
      tiles.delete(data);
      el.remove();
    });
    img.src = poster.src;

    el.appendChild(img);
    el.addEventListener('click', () => {
      if (poster.url) window.open(poster.url, '_blank', 'noopener');
    });
    el.addEventListener('mouseenter', () => promoteTile(data));
    el.addEventListener('mouseleave', () => releaseTile(data));
    el.style.cursor = 'pointer';
    el.title = poster.title ? poster.title.split(' / ')[0] : '';

    const data = { el, img, x, y, rot, speed, width, height, depth, falling: true, hovering: false };
    el._data = data;
    tiles.add(data);
    stage.appendChild(el);
    applyDepth(data);

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

  function promoteTile(tile) {
    if (tile.hovering) return;
    tile.hovering = true;
    tile.originalDepth = tile.depth;
    tile.falling = false;
    tile.el.style.zIndex = '48';
    tile.el.classList.add('is-promoted');
    tile.el.style.setProperty('--dblur', '0px');
    tile.el.style.setProperty('--dbright', '1');
    tile.el.style.setProperty('--dopacity', '1');
    setTransform(tile);
  }

  function releaseTile(tile) {
    tile.hovering = false;
    tile.depth = tile.originalDepth;
    tile.falling = true;
    tile.el.classList.remove('is-promoted');
    applyDepth(tile);
    setTransform(tile);
  }

  function setTransform(tile) {
    const scale = tile.hovering ? 1.06 : 1;
    tile.el.style.transform = `translate3d(${tile.x.toFixed(1)}px, ${tile.y.toFixed(1)}px, 0) rotate(${tile.rot.toFixed(1)}deg) scale(${scale})`;
  }

  function frame(now) {
    raf = 0;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    for (const tile of Array.from(tiles)) {
      if (tile.falling) {
        tile.y += tile.speed * dt;
        if (tile.y > window.innerHeight + 40) {
          tiles.delete(tile);
          tile.el.classList.remove('is-visible');
          tile.el.classList.add('is-leaving');
          setTimeout(() => tile.el.remove(), 700);
          continue;
        }
      }
      setTransform(tile);
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
      return;
    }

    start();
  }

  init();

  (function setupTheme() {
    const button = document.getElementById('theme-toggle');
    function apply(theme) {
      document.body.dataset.theme = theme;
      button.textContent = theme === 'light' ? '🌙' : '☀';
      try {
        localStorage.setItem('theme', theme);
      } catch (error) {
        /* ignore */
      }
    }
    let saved = 'dark';
    try {
      saved = localStorage.getItem('theme') || 'dark';
    } catch (error) {
      /* ignore */
    }
    apply(saved);
    button.addEventListener('click', () => {
      apply(document.body.dataset.theme === 'light' ? 'dark' : 'light');
    });
  })();
})();
