(() => {
  const cells = [...document.querySelectorAll('[data-glyph-src]')];
  const glyphStates = [];
  const fieldRadius = 96;
  const maximumDisplacement = 42;
  let animationFrame = 0;
  let controlIndex = 0;

  function parsePoint(value) {
    const [x, y] = value.split(',').map(Number);
    return { x, y };
  }

  function pathPoint(point) {
    return `${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }

  function makeControl(base, circle, handle, segment) {
    return {
      base,
      current: { ...base },
      velocity: { x: 0, y: 0 },
      glow: 0,
      circle,
      handle,
      segment,
      index: controlIndex++,
    };
  }

  function syncSegment(segment) {
    segment.path.setAttribute(
      'd',
      `M${pathPoint(segment.p0)}C${pathPoint(segment.c1.current)} ${pathPoint(segment.c2.current)} ${pathPoint(segment.p3)}`,
    );

    segment.handle1.setAttribute('x1', segment.p0.x);
    segment.handle1.setAttribute('y1', segment.p0.y);
    segment.handle1.setAttribute('x2', segment.c1.current.x);
    segment.handle1.setAttribute('y2', segment.c1.current.y);
    segment.handle2.setAttribute('x1', segment.p3.x);
    segment.handle2.setAttribute('y1', segment.p3.y);
    segment.handle2.setAttribute('x2', segment.c2.current.x);
    segment.handle2.setAttribute('y2', segment.c2.current.y);

    segment.c1.circle.setAttribute('cx', segment.c1.current.x);
    segment.c1.circle.setAttribute('cy', segment.c1.current.y);
    segment.c2.circle.setAttribute('cx', segment.c2.current.x);
    segment.c2.circle.setAttribute('cy', segment.c2.current.y);
  }

  function styleControl(control) {
    const energy = control.glow;
    if (energy < 0.008) {
      control.circle.style.fill = '#e7e4db';
      control.circle.style.fillOpacity = '0.92';
      control.circle.style.filter = 'none';
      control.handle.style.strokeOpacity = '0.48';
      control.handle.style.strokeWidth = '1';
      return;
    }

    const glowRadius = 2 + energy * 7;
    const glowOpacity = 0.2 + energy * 0.58;
    control.circle.style.fill = '#d9ff48';
    control.circle.style.fillOpacity = `${0.2 + energy * 0.75}`;
    control.circle.style.strokeOpacity = `${0.74 + energy * 0.26}`;
    control.circle.style.filter = `drop-shadow(0 0 ${glowRadius.toFixed(2)}px rgba(217, 255, 72, ${glowOpacity.toFixed(2)}))`;
    control.handle.style.strokeOpacity = `${0.48 + energy * 0.38}`;
    control.handle.style.strokeWidth = `${1 + energy * 0.55}`;
  }

  function updateControl(control, pointer) {
    let targetX = control.base.x;
    let targetY = control.base.y;
    let targetGlow = 0;

    if (pointer) {
      let dx = control.base.x - pointer.x;
      let dy = control.base.y - pointer.y;
      let distance = Math.hypot(dx, dy);

      if (distance < fieldRadius) {
        if (distance < 0.001) {
          const angle = control.index * 2.39996;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }
        const influence = Math.pow(1 - distance / fieldRadius, 2);
        targetX += (dx / distance) * maximumDisplacement * influence;
        targetY += (dy / distance) * maximumDisplacement * influence;
        targetGlow = influence;
      }
    }

    control.velocity.x += (targetX - control.current.x) * 0.105;
    control.velocity.y += (targetY - control.current.y) * 0.105;
    control.velocity.x *= 0.74;
    control.velocity.y *= 0.74;
    control.current.x += control.velocity.x;
    control.current.y += control.velocity.y;
    control.glow += (targetGlow - control.glow) * 0.18;

    const positionDelta = Math.abs(targetX - control.current.x) + Math.abs(targetY - control.current.y);
    const velocity = Math.abs(control.velocity.x) + Math.abs(control.velocity.y);
    const glowDelta = Math.abs(targetGlow - control.glow);

    if (!pointer && positionDelta < 0.006 && velocity < 0.006 && control.glow < 0.006) {
      control.current.x = control.base.x;
      control.current.y = control.base.y;
      control.velocity.x = 0;
      control.velocity.y = 0;
      control.glow = 0;
    }

    styleControl(control);
    return positionDelta > 0.004 || velocity > 0.004 || glowDelta > 0.004;
  }

  function render() {
    animationFrame = 0;
    let keepAnimating = false;

    for (const state of glyphStates) {
      const dirtySegments = new Set();
      for (const control of state.controls) {
        if (updateControl(control, state.pointer)) {
          dirtySegments.add(control.segment);
          keepAnimating = true;
        }
      }
      for (const segment of dirtySegments) syncSegment(segment);
    }

    if (keepAnimating) animationFrame = window.requestAnimationFrame(render);
  }

  function scheduleRender() {
    if (!animationFrame) animationFrame = window.requestAnimationFrame(render);
  }

  function pointerInSvg(svg, event) {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    return matrix ? point.matrixTransform(matrix.inverse()) : null;
  }

  function initializeGlyph(svg) {
    const controls = [];
    const state = { svg, controls, pointer: null };
    const cubicSegments = [...svg.querySelectorAll('.cubic-segment')];

    for (const path of cubicSegments) {
      const id = path.dataset.segment;
      const handle1 = svg.querySelector(`.control-handle[data-segment="${id}"][data-handle="c1"]`);
      const handle2 = svg.querySelector(`.control-handle[data-segment="${id}"][data-handle="c2"]`);
      const circle1 = svg.querySelector(`.control-point[data-segment="${id}"][data-control="c1"]`);
      const circle2 = svg.querySelector(`.control-point[data-segment="${id}"][data-control="c2"]`);
      const segment = {
        path,
        p0: parsePoint(path.dataset.p0),
        p3: parsePoint(path.dataset.p3),
        handle1,
        handle2,
        c1: null,
        c2: null,
      };

      segment.c1 = makeControl(parsePoint(path.dataset.c1), circle1, handle1, segment);
      segment.c2 = makeControl(parsePoint(path.dataset.c2), circle2, handle2, segment);
      controls.push(segment.c1, segment.c2);
      syncSegment(segment);
    }

    glyphStates.push(state);
  }

  function clearPointers() {
    for (const state of glyphStates) state.pointer = null;
    scheduleRender();
  }

  document.addEventListener('pointermove', (event) => {
    for (const state of glyphStates) {
      const bounds = state.svg.getBoundingClientRect();
      const inside = event.clientX >= bounds.left
        && event.clientX <= bounds.right
        && event.clientY >= bounds.top
        && event.clientY <= bounds.bottom;
      state.pointer = inside ? pointerInSvg(state.svg, event) : null;
    }
    scheduleRender();
  }, { passive: true });

  document.documentElement.addEventListener('pointerleave', clearPointers);
  window.addEventListener('blur', clearPointers);

  async function loadGlyph(cell) {
    const response = await fetch(cell.dataset.glyphSrc, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Unable to load ${cell.dataset.glyphSrc}`);
    const source = await response.text();
    const documentNode = new DOMParser().parseFromString(source, 'image/svg+xml');
    if (documentNode.querySelector('parsererror')) throw new Error(`Invalid SVG: ${cell.dataset.glyphSrc}`);

    const svg = document.importNode(documentNode.documentElement, true);
    svg.setAttribute('aria-hidden', 'true');
    svg.removeAttribute('role');
    cell.replaceChildren(svg);
    initializeGlyph(svg);
  }

  Promise.all(cells.map(loadGlyph)).catch((error) => {
    console.error(error);
  });
})();
