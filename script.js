(() => {
  const canvas = document.querySelector('#line-field');
  const screen = document.querySelector('#screen');
  const marker = document.querySelector('#pointer-marker');
  const context = canvas.getContext('2d', { alpha: false });

  if (!context) return;

  const colors = {
    paper: '#e7e4db',
    ink: '#151612',
    inkSoft: 'rgba(21, 22, 18, 0.27)',
    grid: 'rgba(21, 22, 18, 0.04)',
    cyan: '#00aab4',
    cyanSoft: 'rgba(0, 170, 180, 0.28)',
    coral: '#f05a45',
    coralSoft: 'rgba(240, 90, 69, 0.28)',
    acid: '#d9ff48',
  };

  const segmentStyles = {
    line: { stroke: colors.ink, handle: colors.inkSoft },
    quadratic: { stroke: colors.coral, handle: colors.coralSoft },
    cubic: { stroke: colors.ink, handle: colors.inkSoft },
    spline: { stroke: colors.cyan, handle: colors.cyanSoft },
  };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pointer = { x: -1000, y: -1000, active: false };

  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let entities = [];
  let connections = [];
  let connectionCooldowns = new Map();
  let pointCounter = 0;
  let entityCounter = 0;
  let connectionCounter = 0;
  let animationFrame = 0;
  let lastFrame = 0;
  let startTime = performance.now();
  let currentTime = 0;
  let lastPositions = new Map();
  let dragState = null;

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function random(minimum, maximum) {
    return minimum + Math.random() * (maximum - minimum);
  }

  function randomInteger(minimum, maximum) {
    return Math.floor(random(minimum, maximum + 1));
  }

  function choose(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function rotatePoint(x, y, angle) {
    return {
      x: x * Math.cos(angle) - y * Math.sin(angle),
      y: x * Math.sin(angle) + y * Math.cos(angle),
    };
  }

  function createPoint(entity, x, y, role, movement) {
    const id = pointCounter;
    pointCounter += 1;
    const amplitude = movement ?? (role.includes('control') ? random(10, 18) : random(4, 9));
    const source = {
      id,
      entity,
      x,
      y,
      role,
      amplitudeX: amplitude * random(0.76, 1.16),
      amplitudeY: amplitude * random(0.76, 1.16),
      phaseX: random(0, Math.PI * 2),
      phaseY: random(0, Math.PI * 2),
      speedX: random(0.12, 0.22),
      speedY: random(0.1, 0.2),
      dragging: false,
      dragX: 0,
      dragY: 0,
      glyphFrom: randomInteger(0, 4),
      glyphTo: randomInteger(0, 4),
      glyphStart: 0,
      nextGlyphAt: random(1.4, 4.4),
    };
    entity.points.push(source);
    return source;
  }

  function createAnchorLayout(entity, count, closed, length, breadth, angle) {
    const anchors = [];

    if (closed) {
      for (let index = 0; index < count; index += 1) {
        const theta = (index / count) * Math.PI * 2 + random(-0.11, 0.11);
        const radius = random(0.82, 1.08);
        const local = rotatePoint(
          Math.cos(theta) * length * radius,
          Math.sin(theta) * breadth * radius,
          angle,
        );
        anchors.push(createPoint(entity, local.x, local.y, 'anchor'));
      }
    } else {
      const waveCount = choose([0.75, 1, 1.25]);
      const wavePhase = random(-0.45, 0.45);
      for (let index = 0; index < count; index += 1) {
        const progress = index / (count - 1);
        const local = rotatePoint(
          (progress - 0.5) * length * 2,
          Math.sin(progress * Math.PI * waveCount + wavePhase) * breadth,
          angle,
        );
        anchors.push(createPoint(entity, local.x, local.y, 'anchor'));
      }
      anchors[0].role = 'endpoint';
      anchors[anchors.length - 1].role = 'endpoint';
    }

    return anchors;
  }

  function createSegment(entity, from, to, type, scale) {
    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;
    const length = Math.max(1, Math.hypot(deltaX, deltaY));
    const normalX = -deltaY / length;
    const normalY = deltaX / length;

    if (type === 'line') return { type, from, to };

    if (type === 'quadratic') {
      const bend = random(-0.42, 0.42) * scale;
      const control = createPoint(
        entity,
        (from.x + to.x) * 0.5 + normalX * bend,
        (from.y + to.y) * 0.5 + normalY * bend,
        'quadratic-control',
      );
      return { type, from, control, to };
    }

    const bendA = random(-0.38, 0.38) * scale;
    const bendB = random(-0.38, 0.38) * scale;
    const role = type === 'spline' ? 'spline-control' : 'cubic-control';
    const controlA = createPoint(
      entity,
      from.x + deltaX * 0.34 + normalX * bendA,
      from.y + deltaY * 0.34 + normalY * bendA,
      role,
    );
    const controlB = createPoint(
      entity,
      from.x + deltaX * 0.66 + normalX * bendB,
      from.y + deltaY * 0.66 + normalY * bendB,
      role,
    );
    return { type, from, controlA, controlB, to };
  }

  function createCompoundGeometry(entity, closed, length, breadth, angle) {
    const count = closed ? randomInteger(4, 6) : randomInteger(4, 7);
    entity.anchors = createAnchorLayout(entity, count, closed, length, breadth, angle);
    entity.segments = [];

    const typeCycle = ['line', 'quadratic', 'cubic', 'spline'];
    const typeOffset = randomInteger(0, typeCycle.length - 1);
    const segmentCount = closed ? count : count - 1;
    for (let index = 0; index < segmentCount; index += 1) {
      const type = typeCycle[(index + typeOffset) % typeCycle.length];
      const from = entity.anchors[index];
      const to = entity.anchors[(index + 1) % count];
      entity.segments.push(createSegment(entity, from, to, type, Math.min(length, breadth)));
    }
  }

  function placeEntity(entity, initial, slot, total) {
    const speed = random(4.5, 9.5);

    if (initial) {
      const zones = width < 600
        ? [[0.3, 0.18], [0.7, 0.36], [0.3, 0.6], [0.7, 0.8]]
        : [[0.25, 0.24], [0.75, 0.24], [0.27, 0.7], [0.73, 0.7]];
      const pair = Math.floor(slot / 2) % zones.length;
      const side = slot % 2 === 0 ? -1 : 1;
      const zone = zones[pair];
      const separation = width < 600 ? width * 0.085 : width * 0.072;
      entity.x = zone[0] * width + side * separation + random(-16, 16);
      entity.y = zone[1] * height + random(-height * 0.045, height * 0.045);
      const direction = side < 0 ? random(-0.13, 0.13) : Math.PI + random(-0.13, 0.13);
      entity.velocityX = Math.cos(direction) * speed;
      entity.velocityY = Math.sin(direction) * speed;
      return;
    }

    const edge = randomInteger(0, 3);
    const margin = entity.radius * 0.55;
    if (edge === 0) {
      entity.x = -margin;
      entity.y = random(height * 0.08, height * 0.92);
    } else if (edge === 1) {
      entity.x = width + margin;
      entity.y = random(height * 0.08, height * 0.92);
    } else if (edge === 2) {
      entity.x = random(width * 0.08, width * 0.92);
      entity.y = -margin;
    } else {
      entity.x = random(width * 0.08, width * 0.92);
      entity.y = height + margin;
    }

    const targetX = random(width * 0.22, width * 0.78);
    const targetY = random(height * 0.2, height * 0.8);
    const direction = Math.atan2(targetY - entity.y, targetX - entity.x) + random(-0.16, 0.16);
    entity.velocityX = Math.cos(direction) * speed;
    entity.velocityY = Math.sin(direction) * speed;
  }

  function createEntity(initial = false, slot = 0, total = 1) {
    const shortSide = Math.min(width, height);
    const closed = Math.random() < 0.38;
    const length = random(shortSide * 0.1, shortSide * 0.18);
    const breadth = random(shortSide * 0.055, shortSide * 0.13);
    const directionFamilies = [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4];
    const angle = choose(directionFamilies) + random(-0.12, 0.12);
    const entity = {
      id: entityCounter,
      points: [],
      anchors: [],
      segments: [],
      closed,
      x: 0,
      y: 0,
      velocityX: 0,
      velocityY: 0,
      radius: Math.max(length, breadth) * 1.8 + 42,
      wanderAmplitude: random(5, 13),
      wanderSpeed: random(0.035, 0.075),
      wanderPhase: random(0, Math.PI * 2),
      fill: choose([
        'rgba(21, 22, 18, 0.013)',
        'rgba(240, 90, 69, 0.014)',
        'rgba(0, 170, 180, 0.014)',
      ]),
      width: random(0.85, 1.25),
    };
    entityCounter += 1;
    createCompoundGeometry(entity, closed, length, breadth, angle);
    placeEntity(entity, initial, slot, total);
    return entity;
  }

  function createScene() {
    pointCounter = 0;
    entityCounter = 0;
    connectionCounter = 0;
    connections = [];
    connectionCooldowns = new Map();
    const count = width < 600 ? 7 : 8;
    const result = [];
    for (let index = 0; index < count; index += 1) result.push(createEntity(true, index, count));
    return result;
  }

  function entityOrigin(entity, time) {
    return {
      x: entity.x + Math.sin(time * entity.wanderSpeed + entity.wanderPhase) * entity.wanderAmplitude,
      y: entity.y + Math.cos(time * entity.wanderSpeed * 0.82 + entity.wanderPhase) * entity.wanderAmplitude * 0.68,
    };
  }

  function pointOffset(source, time) {
    return {
      x: Math.sin(time * source.speedX + source.phaseX) * source.amplitudeX,
      y: Math.sin(time * source.speedY + source.phaseY) * source.amplitudeY,
    };
  }

  function pointPosition(source, time) {
    if (source.dragging) return { x: source.dragX, y: source.dragY };
    const origin = entityOrigin(source.entity, time);
    const offset = pointOffset(source, time);
    return { x: origin.x + source.x + offset.x, y: origin.y + source.y + offset.y };
  }

  function allPoints() {
    return entities.flatMap((entity) => entity.points);
  }

  function resolvePositions(time) {
    const positions = new Map();
    for (const source of allPoints()) positions.set(source.id, pointPosition(source, time));
    return positions;
  }

  function getPosition(positions, source) {
    return positions.get(source.id);
  }

  function traceSegment(segment, positions) {
    const to = getPosition(positions, segment.to);
    if (segment.type === 'line') {
      context.lineTo(to.x, to.y);
    } else if (segment.type === 'quadratic') {
      const control = getPosition(positions, segment.control);
      context.quadraticCurveTo(control.x, control.y, to.x, to.y);
    } else {
      const controlA = getPosition(positions, segment.controlA);
      const controlB = getPosition(positions, segment.controlB);
      context.bezierCurveTo(controlA.x, controlA.y, controlB.x, controlB.y, to.x, to.y);
    }
  }

  function traceEntity(entity, positions) {
    const first = getPosition(positions, entity.anchors[0]);
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (const segment of entity.segments) traceSegment(segment, positions);
    if (entity.closed) context.closePath();
  }

  function drawFramework() {
    context.save();
    context.strokeStyle = colors.grid;
    context.lineWidth = 0.7;
    context.beginPath();
    const columns = width < 600 ? 4 : 8;
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

    context.strokeStyle = 'rgba(21, 22, 18, 0.07)';
    context.beginPath();
    context.moveTo(width * 0.5, 0);
    context.lineTo(width * 0.5, height);
    context.moveTo(0, height * 0.5);
    context.lineTo(width, height * 0.5);
    context.stroke();
    context.restore();
  }

  function drawFills(positions) {
    for (const entity of entities) {
      if (!entity.closed) continue;
      traceEntity(entity, positions);
      context.fillStyle = entity.fill;
      context.fill();
    }
  }

  function drawSegmentHandle(segment, positions) {
    const style = segmentStyles[segment.type];
    const from = getPosition(positions, segment.from);
    const to = getPosition(positions, segment.to);
    context.strokeStyle = style.handle;
    context.lineWidth = 0.68;
    context.setLineDash(segment.type === 'spline' ? [2, 5] : [3, 6]);

    if (segment.type === 'quadratic') {
      const control = getPosition(positions, segment.control);
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(control.x, control.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    } else if (segment.type === 'cubic' || segment.type === 'spline') {
      const controlA = getPosition(positions, segment.controlA);
      const controlB = getPosition(positions, segment.controlB);
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(controlA.x, controlA.y);
      context.moveTo(to.x, to.y);
      context.lineTo(controlB.x, controlB.y);
      if (segment.type === 'spline') {
        context.moveTo(controlA.x, controlA.y);
        context.lineTo(controlB.x, controlB.y);
      }
      context.stroke();
    }
  }

  function drawHandles(positions) {
    context.save();
    for (const entity of entities) {
      for (const segment of entity.segments) drawSegmentHandle(segment, positions);
    }
    context.restore();
  }

  function drawSegments(positions) {
    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.setLineDash([]);

    for (const entity of entities) {
      for (const segment of entity.segments) {
        const from = getPosition(positions, segment.from);
        context.beginPath();
        context.moveTo(from.x, from.y);
        traceSegment(segment, positions);
        context.strokeStyle = segmentStyles[segment.type].stroke;
        context.lineWidth = entity.width;
        context.stroke();
      }
    }
    context.restore();
  }

  function updateGlyph(source, time) {
    if (!source.role.includes('control') || time < source.nextGlyphAt) return;
    source.glyphFrom = source.glyphTo;
    source.glyphTo = (source.glyphTo + randomInteger(1, 4)) % 5;
    source.glyphStart = time;
    source.nextGlyphAt = time + random(2.4, 5.2);
  }

  function drawGlyph(position, glyph, size, fill, stroke, opacity) {
    context.save();
    context.globalAlpha = opacity;
    context.fillStyle = fill;
    context.strokeStyle = stroke;
    context.lineWidth = 0.8;
    context.translate(position.x, position.y);

    if (glyph === 0) {
      context.beginPath();
      context.arc(0, 0, size, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    } else if (glyph === 1) {
      context.fillRect(-size, -size, size * 2, size * 2);
      context.strokeRect(-size, -size, size * 2, size * 2);
    } else if (glyph === 2) {
      context.rotate(Math.PI / 4);
      context.fillRect(-size, -size, size * 2, size * 2);
      context.strokeRect(-size, -size, size * 2, size * 2);
    } else if (glyph === 3) {
      context.beginPath();
      context.moveTo(0, -size * 1.2);
      context.lineTo(size * 1.1, size);
      context.lineTo(-size * 1.1, size);
      context.closePath();
      context.fill();
      context.stroke();
    } else {
      context.beginPath();
      context.moveTo(-size * 1.25, 0);
      context.lineTo(size * 1.25, 0);
      context.moveTo(0, -size * 1.25);
      context.lineTo(0, size * 1.25);
      context.stroke();
    }
    context.restore();
  }

  function pointColor(source) {
    if (source.role === 'quadratic-control') return colors.coral;
    if (source.role === 'spline-control') return colors.cyan;
    if (source.role === 'cubic-control') return colors.acid;
    return colors.ink;
  }

  function drawPoint(source, position, time) {
    context.save();
    context.lineWidth = 0.8;
    context.setLineDash([]);

    if (source.role === 'endpoint') {
      context.fillStyle = colors.ink;
      context.fillRect(position.x - 2.5, position.y - 2.5, 5, 5);
    } else if (source.role === 'anchor') {
      context.strokeStyle = colors.ink;
      context.strokeRect(position.x - 2.8, position.y - 2.8, 5.6, 5.6);
    } else {
      updateGlyph(source, time);
      const progress = clamp((time - source.glyphStart) / 0.5, 0, 1);
      const size = 2.9 + Math.sin(time * 0.55 + source.id) * 0.35;
      const fill = pointColor(source);
      const stroke = source.role === 'cubic-control' ? colors.ink : fill;
      if (progress < 1) drawGlyph(position, source.glyphFrom, size, fill, stroke, 1 - progress);
      drawGlyph(position, source.glyphTo, size, fill, stroke, progress);
    }
    context.restore();
  }

  function drawPoints(positions, time) {
    for (const source of allPoints()) drawPoint(source, getPosition(positions, source), time);
  }

  function connectionKey(entityA, entityB) {
    return entityA.id < entityB.id ? `${entityA.id}:${entityB.id}` : `${entityB.id}:${entityA.id}`;
  }

  function connectionPorts(entity) {
    if (!entity.closed) return [entity.anchors[0], entity.anchors[entity.anchors.length - 1]];
    return [entity.anchors[0], entity.anchors[Math.floor(entity.anchors.length / 2)]];
  }

  function createConnection(entityA, pointA, entityB, pointB, time) {
    const key = connectionKey(entityA, entityB);
    if (connections.some((connection) => connection.key === key)) return;
    connections.push({
      id: connectionCounter,
      key,
      entityA,
      entityB,
      pointA,
      pointB,
      type: choose(['line', 'quadratic', 'cubic', 'spline']),
      bornAt: time,
      duration: random(5, 10),
      restDistance: random(50, 85),
      bend: random(-52, 52),
      phase: random(0, Math.PI * 2),
    });
    connectionCounter += 1;
  }

  function updateConnections(positions, elapsedSeconds, time) {
    const entityIds = new Set(entities.map((entity) => entity.id));
    connections = connections.filter((connection) => {
      if (!entityIds.has(connection.entityA.id) || !entityIds.has(connection.entityB.id)) return false;
      const age = time - connection.bornAt;
      const pointA = getPosition(positions, connection.pointA);
      const pointB = getPosition(positions, connection.pointB);
      if (!pointA || !pointB) return false;
      const distance = Math.hypot(pointB.x - pointA.x, pointB.y - pointA.y);
      if (age > connection.duration || distance > Math.min(width, height) * 0.38) {
        if (distance > 1) {
          const directionX = (pointB.x - pointA.x) / distance;
          const directionY = (pointB.y - pointA.y) / distance;
          connection.entityA.velocityX -= directionX * 1.4;
          connection.entityA.velocityY -= directionY * 1.4;
          connection.entityB.velocityX += directionX * 1.4;
          connection.entityB.velocityY += directionY * 1.4;
        }
        connectionCooldowns.set(connection.key, time + random(3, 6));
        return false;
      }
      return true;
    });

    const linkedEntities = new Set(connections.flatMap((connection) => [connection.entityA.id, connection.entityB.id]));
    const candidates = [];
    const attractionRange = Math.max(105, Math.min(width, height) * 0.22);

    for (let firstIndex = 0; firstIndex < entities.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < entities.length; secondIndex += 1) {
        const entityA = entities[firstIndex];
        const entityB = entities[secondIndex];
        const key = connectionKey(entityA, entityB);
        const activeConnection = connections.find((connection) => connection.key === key);
        if (activeConnection) {
          const positionA = getPosition(positions, activeConnection.pointA);
          const positionB = getPosition(positions, activeConnection.pointB);
          const deltaX = positionB.x - positionA.x;
          const deltaY = positionB.y - positionA.y;
          const distance = Math.max(1, Math.hypot(deltaX, deltaY));
          const directionX = deltaX / distance;
          const directionY = deltaY / distance;
          const spring = clamp((distance - activeConnection.restDistance) * 0.024, -1.2, 1.2);
          entityA.velocityX += directionX * spring * elapsedSeconds;
          entityA.velocityY += directionY * spring * elapsedSeconds;
          entityB.velocityX -= directionX * spring * elapsedSeconds;
          entityB.velocityY -= directionY * spring * elapsedSeconds;
          continue;
        }
        if ((connectionCooldowns.get(key) || 0) > time) continue;

        let closest = null;
        for (const pointA of connectionPorts(entityA)) {
          for (const pointB of connectionPorts(entityB)) {
            const positionA = getPosition(positions, pointA);
            const positionB = getPosition(positions, pointB);
            const deltaX = positionB.x - positionA.x;
            const deltaY = positionB.y - positionA.y;
            const distance = Math.max(1, Math.hypot(deltaX, deltaY));
            if (!closest || distance < closest.distance) closest = { pointA, pointB, positionA, positionB, deltaX, deltaY, distance };
          }
        }

        if (!closest || closest.distance > attractionRange) continue;
        const strength = (1 - closest.distance / attractionRange) * 1.3;
        const directionX = closest.deltaX / closest.distance;
        const directionY = closest.deltaY / closest.distance;
        entityA.velocityX += directionX * strength * elapsedSeconds;
        entityA.velocityY += directionY * strength * elapsedSeconds;
        entityB.velocityX -= directionX * strength * elapsedSeconds;
        entityB.velocityY -= directionY * strength * elapsedSeconds;

        if (closest.distance < 58 && !linkedEntities.has(entityA.id) && !linkedEntities.has(entityB.id)) {
          candidates.push({ entityA, entityB, ...closest });
        }
      }
    }

    candidates.sort((first, second) => first.distance - second.distance);
    while (connections.length < 2 && candidates.length) {
      const candidate = candidates.shift();
      if (connections.some((connection) => connection.entityA.id === candidate.entityA.id
        || connection.entityB.id === candidate.entityA.id
        || connection.entityA.id === candidate.entityB.id
        || connection.entityB.id === candidate.entityB.id)) continue;
      createConnection(candidate.entityA, candidate.pointA, candidate.entityB, candidate.pointB, time);
    }

    for (const entity of entities) {
      const speed = Math.hypot(entity.velocityX, entity.velocityY);
      if (speed > 11) {
        entity.velocityX = (entity.velocityX / speed) * 11;
        entity.velocityY = (entity.velocityY / speed) * 11;
      }
    }
  }

  function drawConnectionControl(position, type, opacity) {
    context.save();
    context.globalAlpha = opacity;
    context.strokeStyle = segmentStyles[type].stroke;
    context.lineWidth = 0.8;
    context.translate(position.x, position.y);
    context.rotate(Math.PI / 4);
    context.strokeRect(-2.8, -2.8, 5.6, 5.6);
    context.restore();
  }

  function drawConnection(connection, positions, time) {
    const pointA = getPosition(positions, connection.pointA);
    const pointB = getPosition(positions, connection.pointB);
    const age = time - connection.bornAt;
    const fadeIn = clamp(age / 0.7, 0, 1);
    const fadeOut = clamp((connection.duration - age) / 1.1, 0, 1);
    const opacity = Math.min(fadeIn, fadeOut);
    const deltaX = pointB.x - pointA.x;
    const deltaY = pointB.y - pointA.y;
    const distance = Math.max(1, Math.hypot(deltaX, deltaY));
    const normalX = -deltaY / distance;
    const normalY = deltaX / distance;
    const bend = connection.bend + Math.sin(time * 0.32 + connection.phase) * 9;
    const controlA = {
      x: pointA.x + deltaX * 0.34 + normalX * bend,
      y: pointA.y + deltaY * 0.34 + normalY * bend,
    };
    const controlB = {
      x: pointA.x + deltaX * 0.66 - normalX * bend * 0.55,
      y: pointA.y + deltaY * 0.66 - normalY * bend * 0.55,
    };

    context.save();
    context.globalAlpha = opacity;
    context.strokeStyle = segmentStyles[connection.type].handle;
    context.lineWidth = 0.65;
    context.setLineDash([2, 6]);
    if (connection.type === 'quadratic') {
      context.beginPath();
      context.moveTo(pointA.x, pointA.y);
      context.lineTo(controlA.x, controlA.y);
      context.lineTo(pointB.x, pointB.y);
      context.stroke();
    } else if (connection.type === 'cubic' || connection.type === 'spline') {
      context.beginPath();
      context.moveTo(pointA.x, pointA.y);
      context.lineTo(controlA.x, controlA.y);
      context.moveTo(pointB.x, pointB.y);
      context.lineTo(controlB.x, controlB.y);
      if (connection.type === 'spline') {
        context.moveTo(controlA.x, controlA.y);
        context.lineTo(controlB.x, controlB.y);
      }
      context.stroke();
    }

    const gradient = context.createLinearGradient(pointA.x, pointA.y, pointB.x, pointB.y);
    gradient.addColorStop(0, segmentStyles[connection.type].stroke);
    gradient.addColorStop(1, connection.type === 'line' ? colors.cyan : colors.ink);
    context.strokeStyle = gradient;
    context.lineWidth = 1.15;
    context.setLineDash([]);
    context.beginPath();
    context.moveTo(pointA.x, pointA.y);
    if (connection.type === 'line') {
      context.lineTo(pointB.x, pointB.y);
    } else if (connection.type === 'quadratic') {
      context.quadraticCurveTo(controlA.x, controlA.y, pointB.x, pointB.y);
    } else {
      context.bezierCurveTo(controlA.x, controlA.y, controlB.x, controlB.y, pointB.x, pointB.y);
    }
    context.stroke();
    context.restore();

    if (connection.type === 'quadratic') drawConnectionControl(controlA, connection.type, opacity);
    if (connection.type === 'cubic' || connection.type === 'spline') {
      drawConnectionControl(controlA, connection.type, opacity);
      drawConnectionControl(controlB, connection.type, opacity);
    }
  }

  function drawConnections(positions, time) {
    for (const connection of connections) drawConnection(connection, positions, time);
  }

  function entityIsDragging(entity) {
    return entity.points.some((point) => point.dragging);
  }

  function entityIsGone(entity) {
    const margin = entity.radius + 80;
    return entity.x < -margin || entity.x > width + margin || entity.y < -margin || entity.y > height + margin;
  }

  function updateEntities(elapsedSeconds) {
    for (let index = 0; index < entities.length; index += 1) {
      const entity = entities[index];
      entity.x += entity.velocityX * elapsedSeconds;
      entity.y += entity.velocityY * elapsedSeconds;
      if (!entityIsDragging(entity) && entityIsGone(entity)) {
        connections = connections.filter((connection) => connection.entityA.id !== entity.id && connection.entityB.id !== entity.id);
        entities[index] = createEntity(false);
      }
    }
  }

  function seedConnections(positions, time) {
    const candidates = [];
    for (let firstIndex = 0; firstIndex < entities.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < entities.length; secondIndex += 1) {
        const entityA = entities[firstIndex];
        const entityB = entities[secondIndex];
        for (const pointA of connectionPorts(entityA)) {
          for (const pointB of connectionPorts(entityB)) {
            const positionA = getPosition(positions, pointA);
            const positionB = getPosition(positions, pointB);
            const distance = Math.hypot(positionB.x - positionA.x, positionB.y - positionA.y);
            candidates.push({ entityA, entityB, pointA, pointB, distance });
          }
        }
      }
    }
    candidates.sort((first, second) => first.distance - second.distance);
    const used = new Set();
    for (const candidate of candidates) {
      if (connections.length >= 2) break;
      if (candidate.distance > Math.min(width, height) * 0.34) break;
      if (used.has(candidate.entityA.id) || used.has(candidate.entityB.id)) continue;
      createConnection(candidate.entityA, candidate.pointA, candidate.entityB, candidate.pointB, time);
      used.add(candidate.entityA.id);
      used.add(candidate.entityB.id);
    }
  }

  function draw(time) {
    currentTime = time;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.fillStyle = colors.paper;
    context.fillRect(0, 0, width, height);
    drawFramework();

    const positions = resolvePositions(time);
    lastPositions = positions;
    drawFills(positions);
    drawHandles(positions);
    drawSegments(positions);
    drawConnections(positions, time);
    drawPoints(positions, time);
  }

  function render(timestamp) {
    animationFrame = window.requestAnimationFrame(render);
    const frameInterval = reducedMotion ? Infinity : 1000 / 30;
    if (timestamp - lastFrame < frameInterval) return;

    const elapsed = Math.min(50, timestamp - lastFrame || 33);
    const elapsedSeconds = elapsed * 0.001;
    lastFrame = timestamp;
    updateEntities(elapsedSeconds);
    const time = (timestamp - startTime) * 0.001;
    const positions = resolvePositions(time);
    updateConnections(positions, elapsedSeconds, time);
    draw(time);
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    width = Math.max(1, Math.round(bounds.width));
    height = Math.max(1, Math.round(bounds.height));
    pixelRatio = Math.min(window.devicePixelRatio || 1, 1.6);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    entities = createScene();
    const time = reducedMotion ? 0 : (performance.now() - startTime) * 0.001;
    const positions = resolvePositions(time);
    seedConnections(positions, time);
    draw(time);
  }

  function findPointAt(x, y) {
    let closest = null;
    let closestDistance = 22 * 22;
    for (const source of allPoints()) {
      const position = lastPositions.get(source.id);
      if (!position) continue;
      const deltaX = position.x - x;
      const deltaY = position.y - y;
      const distance = deltaX * deltaX + deltaY * deltaY;
      if (distance < closestDistance) {
        closest = source;
        closestDistance = distance;
      }
    }
    return closest;
  }

  function setPointer(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer.x = event.clientX - bounds.left;
    pointer.y = event.clientY - bounds.top;
    pointer.active = true;
    screen.classList.add('is-active');
    marker.style.transform = `translate3d(${event.clientX - 9}px, ${event.clientY - 9}px, 0) rotate(45deg)`;

    if (dragState) {
      dragState.source.dragX = clamp(pointer.x, 16, width - 16);
      dragState.source.dragY = clamp(pointer.y, 16, height - 16);
    } else {
      screen.classList.toggle('is-point-hover', Boolean(findPointAt(pointer.x, pointer.y)));
    }
    if (reducedMotion) draw(0);
  }

  function commitDraggedPoint(source) {
    const origin = entityOrigin(source.entity, currentTime);
    const offset = pointOffset(source, currentTime);
    source.x = source.dragX - origin.x - offset.x;
    source.y = source.dragY - origin.y - offset.y;
    source.dragging = false;
  }

  function finishDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    commitDraggedPoint(dragState.source);
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    dragState = null;
    screen.classList.remove('is-dragging');
    screen.classList.remove('is-point-hover');
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
    if (dragState) return;
    pointer.active = false;
    screen.classList.remove('is-active');
    screen.classList.remove('is-point-hover');
  });

  canvas.addEventListener('pointerdown', (event) => {
    setPointer(event);
    const source = findPointAt(pointer.x, pointer.y);
    if (source) {
      const position = lastPositions.get(source.id);
      source.dragging = true;
      source.dragX = position.x;
      source.dragY = position.y;
      dragState = { source, pointerId: event.pointerId };
      canvas.setPointerCapture(event.pointerId);
      screen.classList.add('is-dragging');
    }
    screen.classList.add('is-pressed');
    window.setTimeout(() => screen.classList.remove('is-pressed'), 180);
    event.preventDefault();
  });

  canvas.addEventListener('pointerup', finishDrag);
  canvas.addEventListener('pointercancel', finishDrag);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopAnimation();
    } else {
      lastFrame = 0;
      startTime = performance.now() - currentTime * 1000;
      startAnimation();
    }
  });

  resize();
  if (!reducedMotion) startAnimation();
})();
