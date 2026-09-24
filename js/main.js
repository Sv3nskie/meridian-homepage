/* Meridian homepage — scroll choreography, navigation and pointer effects.
 *
 * One requestAnimationFrame loop reads window.scrollY and writes transforms.
 * Layout metrics (section offsets, track widths) are cached by measure() and
 * refreshed on resize, font load and content-size changes, so the loop never
 * forces layout. Every scroll-driven effect is a pure function of scroll
 * position (smoothed with a lerp), which makes all of them reverse naturally
 * when scrolling back up; the time-based reveals toggle both ways too.
 */
(() => {
  'use strict';

  const root = document.documentElement;
  const motion = root.classList.contains('motion');
  const canHover = matchMedia('(hover: hover)').matches;
  const fine = canHover && matchMedia('(pointer: fine)').matches;

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  // Frame-rate independent lerp; f is the per-frame factor at 60fps.
  const damp = (cur, target, f, dt) => {
    const v = cur + (target - cur) * (1 - Math.pow(1 - f, dt / 16.667));
    return Math.abs(target - v) < 0.0005 ? target : v;
  };
  // Document offset from layout (ignores transforms, unlike getBoundingClientRect).
  const docTop = (el) => { let y = 0; while (el) { y += el.offsetTop; el = el.offsetParent; } return y; };
  // Write a style property only when its value changes.
  const set = (el, prop, val) => {
    if (!el || el['_' + prop] === val) return;
    el['_' + prop] = val;
    el.style[prop] = val;
  };

  /* Split text into word spans, keeping [data-accent] wrappers. Returns spans in reading order. */
  function splitWords(el) {
    const out = [];
    const walk = (node, accent) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const w = document.createElement('span');
            w.className = accent ? 'w w--accent' : 'w';
            w.textContent = part;
            frag.appendChild(w);
            out.push(w);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1) {
          walk(child, accent || child.hasAttribute('data-accent'));
        }
      });
    };
    walk(el, false);
    return out;
  }

  /* ───────────── Elements ───────────── */
  const probe = $('.vh-probe');
  const nav = $('[data-nav]');
  const main = $('#top');
  const menu = $('#menu');
  const toggle = $('[data-menu-toggle]');
  const megaTrigger = $('[data-mega-trigger]');
  const mega = $('[data-mega]');
  const cursor = $('.cursor');

  const hero = { el: $('#hero'), scroll: $('[data-hero-scroll]'), copy: $('[data-hero-copy]'), hint: $('.hero__hint') };
  const sheet = $('#sheet');
  const valueBlocks = $$('[data-words]').map((el) => ({ el, words: splitWords(el), lit: -1 }));

  const svc = {
    el: $('#services'),
    cards: $$('[data-card]'),
    shades: $$('[data-shade]'),
    idx: $('[data-svc-index]'),
    titles: $$('[data-svc-title]'),
    bar: $('[data-svc-bar]'),
    act: 0,
  };
  const st = { el: $('#statement'), track: $('[data-st-track]'), orb: $('[data-orb]') };
  st.words = splitWords(st.track);
  const stage = { wrap: $('[data-stage-wrap]'), el: $('[data-stage]'), plates: $$('[data-plate]'), hot: false };
  const wk = {
    el: $('#work'),
    track: $('[data-work-track]'),
    line: $('[data-work-line]'),
    idx: $$('[data-work-index]'),
    prev: $$('[data-work-prev]'),
    next: $$('[data-work-next]'),
    count: $$('.story').length,
    i: -1,
  };
  const mq = { wrap: $('[data-marquee-wrap]'), el: $('[data-marquee]'), group: $('[data-marquee-group]') };
  const glow = { el: $('[data-glow]'), box: $('#contact') };
  const reveals = $$('[data-reveal]').map((el) => ({
    el,
    shown: false,
    delay: parseFloat(el.style.getPropertyValue('--d')) * 1000 || 0,
    counters: $$('[data-count]', el).map((c) => ({ el: c, to: parseFloat(c.dataset.count), suffix: c.dataset.suffix || '', v: 0, tw: null })),
  }));
  const counters = reveals.flatMap((r) => r.counters);
  const parallax = $$('[data-parallax]').map((el) => ({ el, box: el.closest('.tile'), f: parseFloat(el.dataset.parallax) || 0.07 }));

  if (motion) counters.forEach((c) => { c.el.textContent = '0' + c.suffix; });

  /* ───────────── Metrics ───────────── */
  let VW = root.clientWidth;
  let VH = innerHeight;
  let docH = root.scrollHeight;
  let sheetTop = 0;

  function measure() {
    VW = root.clientWidth;
    VH = (probe && probe.offsetHeight) || innerHeight;
    docH = root.scrollHeight;
    sheetTop = docTop(sheet);
    valueBlocks.forEach((b) => { b.top = docTop(b.el); b.h = b.el.offsetHeight; });
    svc.top = docTop(svc.el); svc.h = svc.el.offsetHeight;
    st.top = docTop(st.el); st.h = st.el.offsetHeight;
    st.tw = st.track.offsetWidth;
    st.centers = st.words.map((w) => w.offsetLeft + w.offsetWidth / 2);
    stage.top = docTop(stage.wrap); stage.h = stage.wrap.offsetHeight;
    stage.scale = stage.el.offsetWidth / 380;
    wk.top = docTop(wk.el); wk.h = wk.el.offsetHeight;
    wk.tw = wk.track.offsetWidth;
    wk.pad = parseFloat(getComputedStyle(wk.track).paddingLeft) || 0;
    mq.top = docTop(mq.wrap); mq.h = mq.wrap.offsetHeight; mq.period = mq.group.offsetWidth;
    glow.top = docTop(glow.box); glow.h = glow.box.offsetHeight;
    reveals.forEach((r) => { r.top = docTop(r.el); });
    parallax.forEach((p) => { p.top = docTop(p.box); p.h = p.box.offsetHeight; });
  }

  let measureRaf = 0;
  const remeasure = () => {
    cancelAnimationFrame(measureRaf);
    measureRaf = requestAnimationFrame(measure);
  };

  /* ───────────── Reveals (reversible) ───────────── */
  function countTo(c, to, dur, delay) {
    c.tw = { from: c.v, to, t0: performance.now() + delay, dur };
  }
  function show(r) {
    r.shown = true;
    r.el.classList.add('is-in');
    r.counters.forEach((c) => countTo(c, c.to, 1800, r.delay));
  }
  function hide(r) {
    r.shown = false;
    r.el.classList.remove('is-in');
    r.counters.forEach((c) => countTo(c, 0, 700, 0));
  }

  /* ───────────── Loop state ───────────── */
  const S = {
    hero: 0, svc: 0, st: 0, stage: 0.5, hot: 0, wk: 0,
    mx: innerWidth / 2, my: innerHeight / 2, tx: innerWidth / 2, ty: innerHeight / 2,
    cs: 1, mq: 0, mqv: 0.6,
  };
  let last = 0;
  let prevY = window.scrollY;
  let dir = 1;
  let cursorHot = false;
  const lazyGroups = [svc, wk].map((g) => ({ g, done: false }));

  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    const dt = last ? Math.min(now - last, 64) : 16.667;
    last = now;

    const y = window.scrollY;
    const dy = y - prevY;
    prevY = y;
    if (dy > 0.5) dir = 1; else if (dy < -0.5) dir = -1;

    // Pointer (smoothed) — drives cursor, statement orb, stage tilt, CTA glow.
    S.mx = damp(S.mx, S.tx, 0.2, dt);
    S.my = damp(S.my, S.ty, 0.2, dt);
    let nx = S.mx / innerWidth - 0.5;
    let ny = S.my / innerHeight - 0.5;
    if (!fine) { nx = Math.sin(now / 3200) * 0.3; ny = Math.cos(now / 4100) * 0.3; } // gentle idle drift on touch

    if (cursorOn) {
      S.cs = damp(S.cs, cursorHot ? 2 : 1, 0.2, dt);
      set(cursor, 'transform', `translate3d(${S.mx.toFixed(1)}px, ${S.my.toFixed(1)}px, 0) scale(${S.cs.toFixed(3)})`);
    }

    // Warm up images inside pinned chapters before they arrive (they sit off-screen via transforms).
    for (const lg of lazyGroups) {
      if (!lg.done && lg.g.top - y < VH * 2.5) {
        $$('img[loading="lazy"]', lg.g.el).forEach((img) => { img.loading = 'eager'; });
        lg.done = true;
      }
    }

    /* Hero — the sheet slides over it */
    {
      const raw = clamp(1 - (sheetTop - y) / VH);
      const p = S.hero = motion ? damp(S.hero, raw, 0.14, dt) : raw;
      set(hero.el, 'visibility', p > 0.995 ? 'hidden' : 'visible');
      if (p <= 0.995) {
        if (motion) {
          set(hero.scroll, 'transform', `scale(${(1 + 0.22 * p).toFixed(4)})`);
          set(hero.copy, 'transform', `translate3d(0, ${(-p * VH * 0.25).toFixed(1)}px, 0)`);
        }
        set(hero.scroll, 'opacity', (1 - 0.8 * p).toFixed(3));
        set(hero.copy, 'opacity', clamp(1 - p * 1.7).toFixed(3));
        set(hero.hint, 'opacity', clamp(1 - p * 4).toFixed(2));
      }
    }

    /* Value — words light in reading order */
    for (const b of valueBlocks) {
      const top = b.top - y;
      const p = motion ? clamp((VH * 0.9 - top) / (b.h + VH * 0.35)) : 1;
      const n = Math.min(b.words.length, Math.ceil(p * b.words.length));
      if (n !== b.lit) {
        b.words.forEach((w, i) => w.classList.toggle('is-lit', i < n));
        b.lit = n;
      }
    }

    /* Services — pinned card stack */
    {
      const top = svc.top - y;
      if (top < VH * 1.5 && top + svc.h > -VH * 0.5) {
        const N = svc.cards.length;
        const step = Math.max(1, (svc.h - VH) / (N - 0.5)); // 0.8·vh per card at 380vh
        const raw = clamp(-top / step, 0, N);
        const p = S.svc = motion ? damp(S.svc, raw, 0.16, dt) : raw;
        const act = clamp(Math.round(p), 0, N - 1);
        svc.cards.forEach((card, i) => {
          const a = clamp(p - (i - 1));
          const e = 1 - Math.pow(1 - a, 3);
          const d = i < N - 1 ? clamp(p - i, 0, 2) : 0;
          const ty = (1 - e) * VH * 1.1 - d * 20;
          const s = 1 - d * 0.045;
          set(card, 'transform', `translate3d(0, ${ty.toFixed(1)}px, 0) scale(${s.toFixed(4)})`);
          set(card, 'pointerEvents', i === act ? 'auto' : 'none');
          set(svc.shades[i], 'opacity', (Math.min(d, 1) * 0.55 + Math.max(d - 1, 0) * 0.3).toFixed(3));
        });
        if (act !== svc.act) {
          svc.act = act;
          svc.idx.textContent = String(act + 1).padStart(2, '0');
          svc.titles.forEach((t, i) => {
            t.classList.toggle('is-active', i === act);
            t.classList.toggle('is-past', i < act);
          });
        }
        set(svc.bar, 'transform', `scaleY(${clamp(p / (N - 1)).toFixed(4)})`);
      }
    }

    /* Brand statement — pinned horizontal type */
    {
      const top = st.top - y;
      if (top < VH * 1.2 && top + st.h > -VH * 0.2) {
        const raw = clamp(-top / Math.max(1, st.h - VH));
        const p = S.st = motion ? damp(S.st, raw, 0.12, dt) : raw;
        const x = VW * 0.6 - (st.tw - VW * 0.3) * p;
        set(st.track, 'transform', `translate3d(${x.toFixed(1)}px, 0, 0)`);
        if (motion) {
          const lim = VW * 0.62;
          st.words.forEach((w, i) => {
            const lit = x + st.centers[i] < lim;
            if (lit !== w._lit) { w._lit = lit; w.classList.toggle('is-lit', lit); }
          });
          set(st.orb, 'transform', `translate3d(${(p * 45 + nx * 10).toFixed(2)}vw, ${(p * 10 + ny * 12).toFixed(2)}vh, 0)`);
        }
      }
    }

    /* About — 3D plate stack */
    {
      const top = stage.top - y;
      if (top < VH * 1.3 && top + stage.h > -VH * 0.3) {
        const raw = clamp((VH - top) / (VH + stage.h));
        const p = S.stage = motion ? damp(S.stage, raw, 0.1, dt) : 0.5;
        const hot = S.hot = damp(S.hot, stage.hot ? 1 : 0, 0.08, dt);
        const spread = ((motion ? 36 + 110 * Math.sin(p * Math.PI) : 60) + hot * 40) * stage.scale;
        const rz = -34 + (motion ? (p - 0.5) * 56 : 0) + (motion ? nx * 10 * hot : 0);
        const rx = 56 - (motion ? ny * 12 * hot : 0);
        set(stage.el, 'transform', `rotateX(${rx.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg)`);
        stage.plates.forEach((pl, i) => set(pl, 'transform', `translate3d(0, 0, ${((i - 1.5) * spread).toFixed(1)}px)`));
      }
    }

    /* Credibility marquee — follows scroll direction, speeds up with scroll velocity */
    {
      const top = mq.top - y;
      if (motion && mq.period > 0 && top < VH && top + mq.h > 0) {
        const boost = Math.min(Math.abs(dy) * (16.667 / dt) * 0.3, 12);
        S.mqv = damp(S.mqv, (0.6 + boost) * dir, 0.08, dt);
        S.mq = (((S.mq + S.mqv * (dt / 16.667)) % mq.period) + mq.period) % mq.period;
        set(mq.el, 'transform', `translate3d(${(-S.mq).toFixed(1)}px, 0, 0)`);
      }
    }

    /* Client stories — pinned horizontal track */
    {
      const top = wk.top - y;
      if (top < VH * 1.2 && top + wk.h > -VH * 0.2) {
        const raw = clamp(-top / Math.max(1, wk.h - VH));
        const p = S.wk = motion ? damp(S.wk, raw, 0.12, dt) : raw;
        set(wk.track, 'transform', `translate3d(${(-(wk.tw - VW + wk.pad) * p).toFixed(1)}px, 0, 0)`);
        set(wk.line, 'transform', `scaleX(${p.toFixed(4)})`);
        const i = clamp(Math.round(p * (wk.count - 1)), 0, wk.count - 1);
        if (i !== wk.i) {
          wk.i = i;
          const label = String(i + 1).padStart(2, '0');
          wk.idx.forEach((el) => { el.textContent = label; });
          wk.prev.forEach((b) => { b.disabled = i === 0; });
          wk.next.forEach((b) => { b.disabled = i === wk.count - 1; });
        }
      }
    }

    /* Featured solutions — image parallax */
    if (motion) {
      for (const pr of parallax) {
        const c = pr.top + pr.h / 2 - y;
        if (c < -VH || c > VH * 2) continue;
        set(pr.el, 'transform', `translate3d(0, ${((c - VH / 2) * -pr.f).toFixed(1)}px, 0)`);
      }
    }

    /* CTA glow follows the pointer */
    if (motion) {
      const top = glow.top - y;
      if (top < VH && top + glow.h > 0) {
        set(glow.el, 'transform', `translate3d(${(nx * 30).toFixed(1)}vw, ${(ny * 24).toFixed(1)}vh, 0)`);
      }
    }

    /* Reveals — play in when the top crosses 90% of the viewport, reverse when it drops back below */
    if (motion) {
      const line = VH * 0.9;
      const atBottom = y + innerHeight >= docH - 4;
      for (const r of reveals) {
        const top = r.top - y;
        if (!r.shown) { if (top < line || atBottom) show(r); }
        else if (top > line + 24 && !atBottom) hide(r);
      }
      for (const c of counters) {
        if (!c.tw || now < c.tw.t0) continue;
        const t = clamp((now - c.tw.t0) / c.tw.dur);
        const e = 1 - Math.pow(1 - t, 4);
        c.v = c.tw.from + (c.tw.to - c.tw.from) * e;
        const txt = Math.round(c.v) + c.suffix;
        if (c.el.textContent !== txt) c.el.textContent = txt;
        if (t >= 1) c.tw = null;
      }
    }
  }

  /* ───────────── Intro + hero entrance ───────────── */
  const startHero = () => root.classList.add('hero-in');
  if (root.classList.contains('has-intro')) {
    setTimeout(() => root.classList.add('intro-in'), 60);
    setTimeout(() => root.classList.add('intro-out'), 1400);
    setTimeout(startHero, 1500);
    setTimeout(() => {
      const intro = $('.intro');
      if (intro) intro.remove();
      root.classList.remove('has-intro', 'intro-in', 'intro-out');
      try { sessionStorage.setItem('meridian-intro-seen', '1'); } catch (e) { /* private mode */ }
    }, 2400);
  } else {
    setTimeout(startHero, 80);
  }

  /* ───────────── Header: glass, hide on scroll down, mega-menu ───────────── */
  let navLastY = window.scrollY;
  let navHidden = false;
  let menuOpen = false;
  let megaOpen = false;
  let megaTimer = 0;

  function syncNav() {
    const y = window.scrollY;
    nav.classList.toggle('is-scrolled', y > 8);
    nav.classList.toggle('is-glass', y > 8 || menuOpen || megaOpen);
    nav.classList.toggle('is-hidden', navHidden && !menuOpen && !megaOpen);
    nav.classList.toggle('is-mega', megaOpen);
  }

  function onScroll() {
    const y = window.scrollY;
    const d = y - navLastY;
    if (y < 160) navHidden = false;
    else if (d > 6) navHidden = true;
    else if (d < -6) navHidden = false;
    if (Math.abs(d) > 6 || y < 160) navLastY = y; // small deltas accumulate
    if (megaOpen && Math.abs(d) > 6) setMega(false);
    syncNav();
  }

  function setMega(open) {
    clearTimeout(megaTimer);
    if (megaOpen === open) return;
    megaOpen = open;
    syncNav();
  }

  if (canHover && megaTrigger && mega) {
    [megaTrigger, mega].forEach((el) => {
      el.addEventListener('mouseenter', () => setMega(true));
      el.addEventListener('mouseleave', () => {
        clearTimeout(megaTimer);
        megaTimer = setTimeout(() => setMega(false), 120);
      });
    });
  }

  /* ───────────── Mobile menu ───────────── */
  function setMenu(open) {
    if (menuOpen === open) return;
    menuOpen = open;
    root.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.style.overflow = open ? 'hidden' : '';
    main.inert = open;
    if (open) {
      navHidden = false;
      menu.focus({ preventScroll: true });
    } else if (menu.contains(document.activeElement)) {
      toggle.focus({ preventScroll: true });
    }
    syncNav();
  }
  toggle.addEventListener('click', () => setMenu(!menuOpen));

  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (menuOpen) setMenu(false);
    if (megaOpen) setMega(false);
  });

  /* ───────────── In-page navigation ───────────── */
  function scrollToY(top) {
    window.scrollTo({ top: Math.max(0, top), behavior: motion ? 'smooth' : 'auto' });
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    const hash = a.getAttribute('href');
    if (hash === '#') { e.preventDefault(); return; }
    const target = hash === '#top' ? main : $(hash);
    if (!target) return;
    e.preventDefault();
    setMenu(false);
    setMega(false);
    let top = docTop(target);
    if (target === svc.el && a.dataset.svcGo) {
      // Deep-link to a specific service card inside the pinned stack.
      const step = (svc.h - VH) / (svc.cards.length - 0.5);
      top += step * parseInt(a.dataset.svcGo, 10);
    } else if (target !== main && target !== svc.el && target !== wk.el && target !== st.el) {
      top -= 76; // clear the header on regular sections
    }
    scrollToY(top);
    if (a.classList.contains('skip-link')) {
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  });

  function goWork(step) {
    const range = wk.h - VH;
    const cur = clamp((window.scrollY - wk.top) / range);
    const i = clamp(Math.round(cur * (wk.count - 1)) + step, 0, wk.count - 1);
    scrollToY(wk.top + (i / (wk.count - 1)) * range);
  }
  wk.prev.forEach((b) => b.addEventListener('click', () => goWork(-1)));
  wk.next.forEach((b) => b.addEventListener('click', () => goWork(1)));

  /* ───────────── Pointer effects (fine pointer + motion only) ───────────── */
  const cursorOn = !!(motion && fine && cursor);
  if (cursorOn) {
    root.classList.add('has-cursor');
    addEventListener('mousemove', (e) => {
      if (!cursor.classList.contains('is-on')) { S.mx = e.clientX; S.my = e.clientY; cursor.classList.add('is-on'); }
      S.tx = e.clientX;
      S.ty = e.clientY;
      cursorHot = !!(e.target.closest && e.target.closest('a, button, input, textarea, select, label, img, [data-stage-wrap]'));
      cursor.classList.toggle('is-hot', cursorHot);
    }, { passive: true });
    document.documentElement.addEventListener('mouseleave', () => cursor.classList.remove('is-on'));
  } else if (fine) {
    addEventListener('mousemove', (e) => { S.tx = e.clientX; S.ty = e.clientY; }, { passive: true });
  }

  if (motion && fine) {
    const settle = 'transform .8s cubic-bezier(.2,.7,.1,1), background-color .3s, color .3s, border-color .3s';
    $$('[data-magnetic]').forEach((el) => {
      let ox = 0;
      let oy = 0;
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left - ox + r.width / 2);
        const dy = e.clientY - (r.top - oy + r.height / 2);
        ox = dx * 0.28;
        oy = dy * 0.28;
        el.style.transition = 'transform .2s ease-out, background-color .3s, color .3s, border-color .3s';
        el.style.transform = `translate3d(${ox.toFixed(1)}px, ${oy.toFixed(1)}px, 0)`;
      });
      el.addEventListener('mouseleave', () => {
        ox = 0;
        oy = 0;
        el.style.transition = settle;
        el.style.transform = '';
      });
    });

    $$('[data-tilt]').forEach((el) => {
      const layer = $('[data-depth]', el);
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const dx = (e.clientX - r.left) / r.width - 0.5;
        const dy = (e.clientY - r.top) / r.height - 0.5;
        el.style.transition = 'transform .18s ease-out';
        el.style.transform = `perspective(1200px) rotateX(${(-dy * 7).toFixed(2)}deg) rotateY(${(dx * 9).toFixed(2)}deg)`;
        layer.style.transition = 'transform .18s ease-out';
        layer.style.transform = `translate3d(${(-dx * 18).toFixed(1)}px, ${(-dy * 18).toFixed(1)}px, 0) scale(1.06)`;
      });
      el.addEventListener('mouseleave', () => {
        el.style.transition = 'transform 1s cubic-bezier(.2,.7,.1,1)';
        el.style.transform = 'perspective(1200px) rotateX(0deg) rotateY(0deg)';
        layer.style.transition = 'transform 1s cubic-bezier(.2,.7,.1,1)';
        layer.style.transform = 'none';
      });
    });
  }

  if (stage.wrap) {
    if (canHover) {
      stage.wrap.addEventListener('mouseenter', () => { stage.hot = true; });
      stage.wrap.addEventListener('mouseleave', () => { stage.hot = false; });
    } else {
      stage.wrap.addEventListener('click', () => { stage.hot = !stage.hot; });
    }
  }

  /* ───────────── Contact form ───────────── */
  const form = $('[data-form]');
  const success = $('[data-success]');
  if (form && success) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const endpoint = form.dataset.endpoint;
      if (endpoint) {
        try {
          await fetch(endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
        } catch (err) { /* still thank the visitor; the enquiry can be retried by email */ }
      }
      form.hidden = true;
      success.hidden = false;
      success.focus({ preventScroll: true });
    });
  }

  /* ───────────── Boot ───────────── */
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => {
    if (menuOpen && innerWidth >= 900) setMenu(false);
    remeasure();
  });
  addEventListener('load', remeasure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
  if ('ResizeObserver' in window) new ResizeObserver(remeasure).observe(document.body);

  measure();
  syncNav();
  requestAnimationFrame(frame);
})();
