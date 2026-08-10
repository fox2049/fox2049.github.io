(() => {
  const glass = document.getElementById('glass');
  if (!glass) return;

  const SURFACE_FNS = {
    convex_squircle: (x) => Math.pow(1 - Math.pow(1 - x, 4), 0.25),
  };

  function calculateRefractionProfile(glassThickness, bezelWidth, heightFn, ior, samples) {
    const eta = 1 / ior;
    function refract(nx, ny) {
      const dot = ny;
      const k = 1 - eta * eta * (1 - dot * dot);
      if (k < 0) return null;
      const sq = Math.sqrt(k);
      return [-(eta * dot + sq) * nx, eta - (eta * dot + sq) * ny];
    }
    const profile = new Float64Array(samples);
    for (let i = 0; i < samples; i += 1) {
      const x = i / samples;
      const y = heightFn(x);
      const dx = x < 1 ? 0.0001 : -0.0001;
      const deriv = (heightFn(x + dx) - y) / dx;
      const mag = Math.sqrt(deriv * deriv + 1);
      const ref = refract(-deriv / mag, -1 / mag);
      if (!ref) {
        profile[i] = 0;
        continue;
      }
      profile[i] = ref[0] * ((y * bezelWidth + glassThickness) / ref[1]);
    }
    return profile;
  }

  function generateDisplacementMap(w, h, radius, bezelWidth, profile, maxDisp) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 128;
      d[i + 1] = 128;
      d[i + 2] = 0;
      d[i + 3] = 255;
    }

    const r = radius;
    const rSq = r * r;
    const r1Sq = (r + 1) * (r + 1);
    const rBSq = Math.max(r - bezelWidth, 0) * (r - bezelWidth > 0 ? r - bezelWidth : 0);
    const wB = w - r * 2;
    const hB = h - r * 2;
    const S = profile.length;

    for (let y1 = 0; y1 < h; y1 += 1) {
      for (let x1 = 0; x1 < w; x1 += 1) {
        const x = x1 < r ? x1 - r : x1 >= w - r ? x1 - r - wB : 0;
        const y = y1 < r ? y1 - r : y1 >= h - r ? y1 - r - hB : 0;
        const dSq = x * x + y * y;
        if (dSq > r1Sq || dSq < rBSq) continue;
        const dist = Math.sqrt(dSq);
        const fromSide = r - dist;
        const op = dSq < rSq ? 1 : 1 - (dist - Math.sqrt(rSq)) / (Math.sqrt(r1Sq) - Math.sqrt(rSq));
        if (op <= 0 || dist === 0) continue;
        const cos = x / dist;
        const sin = y / dist;
        const bi = Math.min(((fromSide / bezelWidth) * S) | 0, S - 1);
        const disp = profile[bi] || 0;
        const dX = (-cos * disp) / maxDisp;
        const dY = (-sin * disp) / maxDisp;
        const idx = (y1 * w + x1) * 4;
        d[idx] = (128 + dX * 127 * op + 0.5) | 0;
        d[idx + 1] = (128 + dY * 127 * op + 0.5) | 0;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL();
  }

  function generateSpecularMap(w, h, radius, bezelWidth, angle) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;
    d.fill(0);

    const r = radius;
    const rSq = r * r;
    const r1Sq = (r + 1) * (r + 1);
    const rBSq = Math.max(r - bezelWidth, 0) * (r - bezelWidth > 0 ? r - bezelWidth : 0);
    const wB = w - r * 2;
    const hB = h - r * 2;
    const sv = [Math.cos(angle), Math.sin(angle)];

    for (let y1 = 0; y1 < h; y1 += 1) {
      for (let x1 = 0; x1 < w; x1 += 1) {
        const x = x1 < r ? x1 - r : x1 >= w - r ? x1 - r - wB : 0;
        const y = y1 < r ? y1 - r : y1 >= h - r ? y1 - r - hB : 0;
        const dSq = x * x + y * y;
        if (dSq > r1Sq || dSq < rBSq) continue;
        const dist = Math.sqrt(dSq);
        const fromSide = r - dist;
        const op = dSq < rSq ? 1 : 1 - (dist - Math.sqrt(rSq)) / (Math.sqrt(r1Sq) - Math.sqrt(rSq));
        if (op <= 0 || dist === 0) continue;
        const cos = x / dist;
        const sin = -y / dist;
        const dot = Math.abs(cos * sv[0] + sin * sv[1]);
        const edge = Math.sqrt(Math.max(0, 1 - (1 - fromSide) * (1 - fromSide)));
        const coeff = dot * edge;
        const col = (255 * coeff) | 0;
        const alpha = (col * coeff * op) | 0;
        const idx = (y1 * w + x1) * 4;
        d[idx] = col;
        d[idx + 1] = col;
        d[idx + 2] = col;
        d[idx + 3] = alpha;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL();
  }

  const SETTINGS = {
    glassThickness: 80,
    bezelWidth: 60,
    ior: 3.0,
    scaleRatio: 1.0,
    blurAmount: 1.0,
    specularOpacity: 0.5,
    specularSaturation: 4,
    radius: 60,
    tintOpacity: 6,
    outerShadowBlur: 26,
  };

  function rebuildFilter() {
    const w = Math.round(glass.offsetWidth);
    const h = Math.round(glass.offsetHeight);
    if (w < 2 || h < 2) return;

    const radius = Math.min(SETTINGS.radius, Math.min(w, h) / 2 - 1);
    const clampedBezel = Math.min(SETTINGS.bezelWidth, radius - 1, Math.min(w, h) / 2 - 1);

    const profile = calculateRefractionProfile(
      SETTINGS.glassThickness,
      clampedBezel,
      SURFACE_FNS.convex_squircle,
      SETTINGS.ior,
      128,
    );
    const maxDisp = Array.from(profile).reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
    const dispUrl = generateDisplacementMap(w, h, radius, clampedBezel, profile, maxDisp);
    const specUrl = generateSpecularMap(w, h, radius, clampedBezel * 2.5);
    const scale = maxDisp * SETTINGS.scaleRatio;

    document.getElementById('svg-defs').innerHTML = `
      <filter id="liquid-glass-filter" x="0%" y="0%" width="100%" height="100%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="${SETTINGS.blurAmount}" result="blurred_source" />
        <feImage href="${dispUrl}" x="0" y="0" width="${w}" height="${h}" result="disp_map" />
        <feDisplacementMap in="blurred_source" in2="disp_map" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="displaced" />
        <feColorMatrix in="displaced" type="saturate" values="${SETTINGS.specularSaturation}" result="displaced_sat" />
        <feImage href="${specUrl}" x="0" y="0" width="${w}" height="${h}" result="spec_layer" />
        <feComposite in="displaced_sat" in2="spec_layer" operator="in" result="spec_masked" />
        <feComponentTransfer in="spec_layer" result="spec_faded">
          <feFuncA type="linear" slope="${SETTINGS.specularOpacity}" />
        </feComponentTransfer>
        <feBlend in="spec_masked" in2="displaced" mode="normal" result="with_sat" />
        <feBlend in="spec_faded" in2="with_sat" mode="normal" />
      </filter>
    `;
  }

  function updateCSS() {
    const root = document.documentElement.style;
    root.setProperty('--glass-radius', SETTINGS.radius + 'px');
    root.setProperty('--tint-opacity', (SETTINGS.tintOpacity / 100).toFixed(3));
    root.setProperty('--outer-shadow-blur', SETTINGS.outerShadowBlur + 'px');
  }

  let timer = 0;
  function scheduleRebuild() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      updateCSS();
      rebuildFilter();
    }, 60);
  }

  window.addEventListener('resize', scheduleRebuild);
  updateCSS();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(() => requestAnimationFrame(rebuildFilter)));
  } else {
    requestAnimationFrame(() => requestAnimationFrame(rebuildFilter));
  }
})();
