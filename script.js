(() => {
  const canvas = document.querySelector('#line-field');
  const screen = document.querySelector('#screen');
  const marker = document.querySelector('#pointer-marker');
  const context = canvas.getContext('2d', { alpha: false });

  if (!context) return;

  const colors = {
    paper: '#e7e4db',
    ink: '#151612',
    inkSoft: 'rgba(21, 22, 18, 0.34)',
    inkFaint: 'rgba(21, 22, 18, 0.105)',
    grid: 'rgba(21, 22, 18, 0.05)',
    cyan: '#00aab4',
    cyanSoft: 'rgba(0, 170, 180, 0.32)',
    coral: '#f05a45',
    coralSoft: 'rgba(240, 90, 69, 0.3)',
    acid: '#d9ff48',
  };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pointer = {
    x: -1000,
    y: -1000,
    targetX: -1000,
    targetY: -1000,
    rawX: -1000,
    rawY: -1000,
    velocity: 0,
    presence: 0,
    active: false,
    lastMove: 0,
  };

  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let scene = null;
  let pointCounter = 0;
  let animationFrame = 0;
  let lastFrame = 0;
  let startTime = performance.now();

  function createPoint(x, y, options = {}) {
    const index = pointCounter;
    pointCounter += 1;
    return {
      id: index,
      x,
      y,
      role: options.role || 'anchor',
      amplitudeX: options.amplitudeX ?? 4,
      amplitudeY: options.amplitudeY ?? 4,
      phaseX: options.phaseX ?? index * 1.37,
      phaseY: options.phaseY ?? index * 1.91 + 0.7,
      speedX: options.speedX ?? 0.24 + (index % 4) * 0.035,
      speedY: options.speedY ?? 0.2 + (index % 5) * 0.03,
    };
  }

  function createScene() {
    pointCounter = 0;

    const straightPoints = [
      createPoint(0.075, 0.19, { role: 'line-end', amplitudeX: 12, amplitudeY: 9 }),
      createPoint(0.27, 0.13, { role: 'line-end', amplitudeX: 11, amplitudeY: 12 }),
      createPoint(0.335, 0.31, { role: 'line-end', amplitudeX: 10, amplitudeY: 9 }),
      createPoint(0.215, 0.405, { role: 'line-end', amplitudeX: 13, amplitudeY: 10 }),
      createPoint(0.055, 0.32, { role: 'line-end', amplitudeX: 10, amplitudeY: 12 }),
    ];

    const quadraticAnchors = [
      createPoint(0.69, 0.13, { role: 'anchor', amplitudeX: 3, amplitudeY: 3 }),
      createPoint(0.91, 0.22, { role: 'anchor', amplitudeX: 3, amplitudeY: 3 }),
      createPoint(0.875, 0.47, { role: 'anchor', amplitudeX: 3, amplitudeY: 3 }),
      createPoint(0.665, 0.395, { role: 'anchor', amplitudeX: 3, amplitudeY: 3 }),
    ];
    const quadraticControls = [
      createPoint(0.82, 0.07, { role: 'quadratic-control', amplitudeX: 15, amplitudeY: 12 }),
      createPoint(0.975, 0.34, { role: 'quadratic-control', amplitudeX: 12, amplitudeY: 16 }),
      createPoint(0.77, 0.55, { role: 'quadratic-control', amplitudeX: 16, amplitudeY: 13 }),
      createPoint(0.61, 0.235, { role: 'quadratic-control', amplitudeX: 13, amplitudeY: 15 }),
    ];

    const cubicAnchors = [
      createPoint(0.31, 0.255, { role: 'anchor', amplitudeX: 3, amplitudeY: 3 }),
      createPoint(0.59, 0.185, { role: 'anchor', amplitudeX: 3, amplitudeY: 3 }),
      createPoint(0.68, 0.55, { role: 'anchor', amplitudeX: 3, amplitudeY: 3 }),
      createPoint(0.45, 0.77, { role: 'anchor', amplitudeX: 3, amplitudeY: 3 }),
      createPoint(0.235, 0.585, { role: 'anchor', amplitudeX: 3, amplitudeY: 3 }),
    ];
    const cubicControls = [
      createPoint(0.39, 0.11, { role: 'cubic-control', amplitudeX: 12, amplitudeY: 16 }),
      createPoint(0.52, 0.33, { role: 'cubic-control', amplitudeX: 15, amplitudeY: 12 }),
      createPoint(0.69, 0.255, { role: 'cubic-control', amplitudeX: 14, amplitudeY: 15 }),
      createPoint(0.61, 0.43, { role: 'cubic-control', amplitudeX: 13, amplitudeY: 16 }),
      createPoint(0.71, 0.69, { role: 'cubic-control', amplitudeX: 15, amplitudeY: 13 }),
      createPoint(0.54, 0.82, { role: 'cubic-control', amplitudeX: 14, amplitudeY: 14 }),
      createPoint(0.35, 0.84, { role: 'cubic-control', amplitudeX: 16, amplitudeY: 12 }),
      createPoint(0.29, 0.68, { role: 'cubic-control', amplitudeX: 13, amplitudeY: 15 }),
      createPoint(0.18, 0.47, { role: 'cubic-control', amplitudeX: 12, amplitudeY: 16 }),
      createPoint(0.255, 0.34, { role: 'cubic-control', amplitudeX: 15, amplitudeY: 12 }),
    ];

    const splinePoints = [
      createPoint(0.61, 0.62, { role: 'spline-control', amplitudeX: 10, amplitudeY: 12 }),
      createPoint(0.76, 0.54, { role: 'spline-control', amplitudeX: 13, amplitudeY: 10 }),
      createPoint(0.925, 0.65, { role: 'spline-control', amplitudeX: 11, amplitudeY: 14 }),
      createPoint(0.885, 0.865, { role: 'spline-control', amplitudeX: 14, amplitudeY: 11 }),
      createPoint(0.69, 0.905, { role: 'spline-control', amplitudeX: 12, amplitudeY: 13 }),
      createPoint(0.545, 0.785, { role: 'spline-control', amplitudeX: 11, amplitudeY: 14 }),
    ];

    const quadraticSegments = quadraticAnchors.map((anchor, index) => ({
      type: 'quadratic',
      from: anchor,
      control: quadraticControls[index],
      to: quadraticAnchors[(index + 1) % quadraticAnchors.length],
    }));

    const cubicSegments = cubicAnchors.map((anchor, index) => ({
      type: 'cubic',
      from: anchor,
      controlA: cubicControls[index * 2],
      controlB: cubicControls[index * 2 + 1],
      to: cubicAnchors[(index + 1) % cubicAnchors.length],
    }));

    const shapes = [
      {
        type: 'line',
        points: straightPoints,
        stroke: colors.ink,
        fill: 'rgba(21, 22, 18, 0.022)',
        width: 1.15,
      },
      {
        type: 'quadratic',
        segments: quadraticSegments,
        stroke: colors.coral,
        fill: 'rgba(240, 90, 69, 0.025)',
        width: 1.25,
      },
      {
        type: 'cubic',
        segments: cubicSegments,
        stroke: colors.ink,
        fill: 'rgba(217, 255, 72, 0.045)',
        width: 1.45,
      },
      {
        type: 'spline',
        points: splinePoints,
        stroke: colors.cyan,
        fill: 'rgba(0, 170, 180, 0.025)',
        width: 1.3,
      },
    ];

    const points = [
      ...straightPoints,
      ...quadraticAnchors,
      ...quadraticControls,
      ...cubicAnchors,
      ...cubicControls,
      ...splinePoints,
    ];

    return { shapes, points };
  }

  function naturalPosition(source, time) {
    const x = source.x * width + Math.sin(time * source.speedX + source.phaseX) * source.amplitudeX;
    const y = source.y * height + Math.sin(time * source.speedY + source.phaseY) * source.amplitudeY;

    if (pointer.presence < 0.005) return { x, y };

    const deltaX = x - pointer.x;
    const deltaY = y - pointer.y;
    const distance = Math.max(1, Math.hypot(deltaX, deltaY));
    const radius = Math.max(105, Math.min(width, height) * 0.225);
    const influence = Math.exp(-(distance * distance) / (radius * radius)) * pointer.presence;
    const speedBoost = Math.min(pointer.velocity / 24, 1);
    const force = influence * (18 + speedBoost * 28);
    const radialX = deltaX / distance;
    const radialY = deltaY / distance;
    const tangentX = -radialY;
    const tangentY = radialX;

    if (source.role === 'quadratic-control' || source.role === 'cubic-control') {
      return {
        x: x + tangentX * force * 0.72 + radialX * force * 0.3,
        y: y + tangentY * force * 0.72 + radialY * force * 0.3,
      };
    }

    if (source.role === 'spline-control') {
      return {
        x: x + radialX * force * 0.48 + tangentX * force * 0.42,
        y: y + radialY * force * 0.48 + tangentY * force * 0.42,
      };
    }

    return {
      x: x + radialX * force * 0.68,
      y: y + radialY * force * 0.68,
    };
  }

  function resolvePositions(time) {
    const positions = new Map();
    for (const source of scene.points) positions.set(source.id, naturalPosition(source, time));
    return positions;
  }

  function getPosition(positions, source) {
    return positions.get(source.id);
  }

  function traceLineShape(shape, positions) {
    const first = getPosition(positions, shape.points[0]);
    context.moveTo(first.x, first.y);
    for (let index = 1; index < shape.points.length; index += 1) {
      const current = getPosition(positions, shape.points[index]);
      context.lineTo(current.x, current.y);
    }
    context.closePath();
  }

  function traceBezierShape(shape, positions) {
    const first = getPosition(positions, shape.segments[0].from);
    context.moveTo(first.x, first.y);

    for (const segment of shape.segments) {
      const to = getPosition(positions, segment.to);
      if (segment.type === 'quadratic') {
        const control = getPosition(positions, segment.control);
        context.quadraticCurveTo(control.x, control.y, to.x, to.y);
      } else {
        const controlA = getPosition(positions, segment.controlA);
        const controlB = getPosition(positions, segment.controlB);
        context.bezierCurveTo(controlA.x, controlA.y, controlB.x, controlB.y, to.x, to.y);
      }
    }
    context.closePath();
  }

  function traceSplineShape(shape, positions) {
    const points = shape.points.map((source) => getPosition(positions, source));
    const count = points.length;
    context.moveTo(points[0].x, points[0].y);

    for (let index = 0; index < count; index += 1) {
      const previous = points[(index - 1 + count) % count];
      const current = points[index];
      const next = points[(index + 1) % count];
      const after = points[(index + 2) % count];
      const controlA = {
        x: current.x + (next.x - previous.x) / 6,
        y: current.y + (next.y - previous.y) / 6,
      };
      const controlB = {
        x: next.x - (after.x - current.x) / 6,
        y: next.y - (after.y - current.y) / 6,
      };
      context.bezierCurveTo(controlA.x, controlA.y, controlB.x, controlB.y, next.x, next.y);
    }
    context.closePath();
  }

  function traceShape(shape, positions) {
    context.beginPath();
    if (shape.type === 'line') traceLineShape(shape, positions);
    if (shape.type === 'quadratic' || shape.type === 'cubic') traceBezierShape(shape, positions);
    if (shape.type === 'spline') traceSplineShape(shape, positions);
  }

  function drawFramework() {
    context.save();
    context.strokeStyle = colors.grid;
    context.lineWidth = 0.7;
    context.setLineDash([]);
    context.beginPath();

    const columns = width < 600 ? 4 : 7;
    const rows = height < 600 ? 4 : 6;
    for (let index = 1; index < columns; index += 1) {
      const x = (width / columns) * index;
      context.moveTo(x, 0);
      context.lineTo(x, height);
    }
    for (let index = 1; index < rows; index += 1) {
      const y = (height / rows) * index;
      context.moveTo(0, y);
      context.lineTo(width, y);
    }
    context.stroke();
    context.restore();
  }

  function drawFills(positions) {
    for (const shape of scene.shapes) {
      traceShape(shape, positions);
      context.fillStyle = shape.fill;
      context.fill();
    }
  }

  function drawHandles(positions) {
    context.save();
    context.lineWidth = 0.75;
    context.setLineDash([3, 5]);

    for (const shape of scene.shapes) {
      if (shape.type === 'quadratic') {
        context.strokeStyle = colors.coralSoft;
        for (const segment of shape.segments) {
          const from = getPosition(positions, segment.from);
          const control = getPosition(positions, segment.control);
          const to = getPosition(positions, segment.to);
          context.beginPath();
          context.moveTo(from.x, from.y);
          context.lineTo(control.x, control.y);
          context.lineTo(to.x, to.y);
          context.stroke();
        }
      }

      if (shape.type === 'cubic') {
        context.strokeStyle = colors.inkSoft;
        for (const segment of shape.segments) {
          const from = getPosition(positions, segment.from);
          const controlA = getPosition(positions, segment.controlA);
          const controlB = getPosition(positions, segment.controlB);
          const to = getPosition(positions, segment.to);
          context.beginPath();
          context.moveTo(from.x, from.y);
          context.lineTo(controlA.x, controlA.y);
          context.moveTo(to.x, to.y);
          context.lineTo(controlB.x, controlB.y);
          context.stroke();
        }
      }

      if (shape.type === 'spline') {
        context.strokeStyle = colors.cyanSoft;
        const first = getPosition(positions, shape.points[0]);
        context.beginPath();
        context.moveTo(first.x, first.y);
        for (let index = 1; index < shape.points.length; index += 1) {
          const current = getPosition(positions, shape.points[index]);
          context.lineTo(current.x, current.y);
        }
        context.closePath();
        context.stroke();
      }
    }

    context.restore();
  }

  function drawStrokes(positions) {
    for (const shape of scene.shapes) {
      traceShape(shape, positions);
      context.strokeStyle = shape.stroke;
      context.lineWidth = shape.width;
      context.lineJoin = 'round';
      context.lineCap = 'round';
      context.setLineDash([]);
      context.stroke();
    }
  }

  function drawPoint(source, position) {
    context.save();
    context.lineWidth = 0.85;
    context.setLineDash([]);

    if (source.role === 'line-end') {
      context.fillStyle = colors.ink;
      context.fillRect(position.x - 2.2, position.y - 2.2, 4.4, 4.4);
    } else if (source.role === 'anchor') {
      context.strokeStyle = colors.ink;
      context.strokeRect(position.x - 2.8, position.y - 2.8, 5.6, 5.6);
    } else if (source.role === 'quadratic-control') {
      context.fillStyle = colors.coral;
      context.beginPath();
      context.arc(position.x, position.y, 3.2, 0, Math.PI * 2);
      context.fill();
    } else if (source.role === 'cubic-control') {
      context.fillStyle = colors.acid;
      context.strokeStyle = colors.ink;
      context.beginPath();
      context.arc(position.x, position.y, 3, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    } else {
      context.fillStyle = colors.cyan;
      context.translate(position.x, position.y);
      context.rotate(Math.PI / 4);
      context.fillRect(-2.7, -2.7, 5.4, 5.4);
    }

    context.restore();
  }

  function drawPoints(positions) {
    for (const source of scene.points) drawPoint(source, getPosition(positions, source));
  }

  function draw(time) {
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.fillStyle = colors.paper;
    context.fillRect(0, 0, width, height);
    drawFramework();

    const positions = resolvePositions(time);
    drawFills(positions);
    drawHandles(positions);
    drawStrokes(positions);
    drawPoints(positions);
  }

  function render(timestamp) {
    animationFrame = window.requestAnimationFrame(render);
    const frameInterval = reducedMotion ? Infinity : 1000 / 30;
    if (timestamp - lastFrame < frameInterval) return;

    const elapsed = Math.min(50, timestamp - lastFrame || 33);
    lastFrame = timestamp;
    pointer.x += (pointer.targetX - pointer.x) * 0.16;
    pointer.y += (pointer.targetY - pointer.y) * 0.16;
    pointer.presence += ((pointer.active ? 1 : 0) - pointer.presence) * 0.12;
    pointer.velocity *= Math.pow(0.88, elapsed / 16.67);
    draw((timestamp - startTime) * 0.001);
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    width = Math.max(1, Math.round(bounds.width));
    height = Math.max(1, Math.round(bounds.height));
    pixelRatio = Math.min(window.devicePixelRatio || 1, 1.65);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    scene = createScene();
    draw(reducedMotion ? 0 : (performance.now() - startTime) * 0.001);
  }

  function setPointer(event) {
    const bounds = canvas.getBoundingClientRect();
    const nextX = event.clientX - bounds.left;
    const nextY = event.clientY - bounds.top;
    const now = performance.now();
    const elapsed = Math.max(16, now - pointer.lastMove);
    const distance = Math.hypot(nextX - pointer.rawX, nextY - pointer.rawY);

    pointer.velocity = Math.min(40, (distance / elapsed) * 16.67);
    pointer.rawX = nextX;
    pointer.rawY = nextY;
    pointer.targetX = nextX;
    pointer.targetY = nextY;
    pointer.lastMove = now;
    pointer.active = true;
    screen.classList.add('is-active');
    marker.style.transform = `translate3d(${event.clientX - 9}px, ${event.clientY - 9}px, 0) rotate(45deg)`;

    if (reducedMotion) {
      pointer.x = nextX;
      pointer.y = nextY;
      pointer.presence = 1;
      draw(0);
    }
  }

  function startAnimation() {
    if (!animationFrame) animationFrame = window.requestAnimationFrame(render);
  }

  function stopAnimation() {
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  canvas.addEventListener('pointermove', setPointer, { passive: true });
  canvas.addEventListener('pointerenter', setPointer, { passive: true });
  canvas.addEventListener('pointerleave', () => {
    pointer.active = false;
    screen.classList.remove('is-active');
    if (reducedMotion) {
      pointer.presence = 0;
      draw(0);
    }
  });

  canvas.addEventListener('pointerdown', (event) => {
    setPointer(event);
    screen.classList.add('is-pressed');
    window.setTimeout(() => screen.classList.remove('is-pressed'), 180);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopAnimation();
    } else {
      lastFrame = 0;
      startTime = performance.now();
      startAnimation();
    }
  });

  window.addEventListener('resize', resize, { passive: true });
  resize();
  if (!reducedMotion) startAnimation();
})();
