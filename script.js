(() => {
  const stage = document.getElementById('stage');
  const loader = document.getElementById('loader');

  const TARGET = 10;
  const posters = [];
  const tiles = new Set();
  const pool = [];
  let cursor = 0;
  let timer = 0;

  const rand = (min, max) => min + Math.random() * (max - min);

  function sizeRange() {
    const viewport = Math.min(window.innerWidth, 900);
    return {
      minWidth: Math.max(110, viewport * 0.14),
      maxWidth: Math.min(250, viewport * 0.34),
    };
  }

  function nextPoster() {
    if (cursor >= pool.length) {
      const shown = new Set(Array.from(tiles).map((el) => el.dataset.src));
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

  function spawnTile() {
    const poster = nextPoster();
    const posterUrl = poster.url || '';
    const posterTitle = poster.title ? poster.title.split(' / ')[0] : '';
    const src = poster.src;
    const { minWidth, maxWidth } = sizeRange();
    const width = rand(minWidth, maxWidth);
    const height = width * 1.5;
    const rot = rand(-5, 5);
    const left = rand(0, 90);
    const top = rand(0, 82);

    const el = document.createElement('div');
    el.className = 'tile';
    el.dataset.src = src;
    el.style.width = `${width.toFixed(0)}px`;
    el.style.height = `${height.toFixed(0)}px`;
    el.style.left = `${left.toFixed(1)}%`;
    el.style.top = `${top.toFixed(1)}%`;
    el.style.setProperty('--rot', `${rot.toFixed(1)}deg`);
    el.style.animationDuration = `${rand(6, 12).toFixed(1)}s`;
    el.style.animationDelay = `${(-rand(0, 8)).toFixed(1)}s`;

    el.addEventListener('click', () => {
      if (posterUrl) window.open(posterUrl, '_blank', 'noopener');
    });
    el.style.cursor = 'pointer';
    el.title = posterTitle;

    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.addEventListener('error', () => {
      el.classList.add('is-leaving');
      setTimeout(() => {
        tiles.delete(el);
        el.remove();
      }, 900);
    });
    img.src = src;

    el.appendChild(img);
    stage.appendChild(el);
    tiles.add(el);

    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.classList.add('is-visible');
    }));

    return el;
  }

  function removeRandomTile() {
    const entries = Array.from(tiles);
    if (!entries.length) return;
    const el = entries[Math.floor(Math.random() * entries.length)];
    el.classList.remove('is-visible');
    el.classList.add('is-leaving');
    tiles.delete(el);
    setTimeout(() => el.remove(), 1000);
  }

  function tick() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (tiles.size < TARGET) {
        spawnTile();
      } else {
        removeRandomTile();
        spawnTile();
      }
      tick();
    }, rand(1300, 3600));
  }

  async function init() {
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

    for (let i = 0; i < TARGET; i += 1) spawnTile();
    loader.classList.add('is-done');
    tick();
  }

  window.addEventListener('resize', () => {
    if (tiles.size >= TARGET) return;
    while (tiles.size < TARGET) spawnTile();
  });

  init();
})();
