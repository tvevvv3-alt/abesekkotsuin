/* =================================================================
   阿部接骨院 — interactions
   - Scroll reveal (IntersectionObserver)
   - Header: solid-on-scroll + hide-on-scroll-down
   - Floating LINE button reveal
   - Horizontal cards: drag-to-scroll on pointer devices
   - LINE / Instagram link wiring (single source of truth)
   Keep it light. Respect prefers-reduced-motion.
   ================================================================= */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Config: replace with real URLs ---- */
  var LINKS = {
    line: "https://lin.ee/qJUl87W",                              // LINE公式アカウントの予約URL
    instagram: "https://www.instagram.com/abesekkotsuin_ibaraki" // Instagram URL
  };

  /* ---- Wire LINE / Instagram links ---- */
  document.querySelectorAll("[data-line]").forEach(function (el) {
    el.setAttribute("href", LINKS.line);
    el.setAttribute("target", "_blank");
    el.setAttribute("rel", "noopener");
  });
  document.querySelectorAll("[data-instagram]").forEach(function (el) {
    el.setAttribute("href", LINKS.instagram);
  });

  /* ---- Current year ---- */
  var yearEl = document.querySelector("[data-year]");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---- Scroll reveal ---- */
  var revealEls = document.querySelectorAll(".reveal");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealEls.forEach(function (el) { el.classList.add("is-visible"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.12 });
    revealEls.forEach(function (el) { io.observe(el); });
  }

  /* ---- Header behaviour ---- */
  var header = document.getElementById("siteHeader");
  var lastY = window.scrollY;
  var ticking = false;

  function onScroll() {
    var y = window.scrollY;
    // Solid background once past hero-ish threshold
    if (y > 60) header.classList.add("is-solid");
    else header.classList.remove("is-solid");

    // Hide on scroll down, show on scroll up (after some distance)
    if (y > 320 && y > lastY + 4) header.classList.add("is-hidden");
    else if (y < lastY - 4) header.classList.remove("is-hidden");

    // Floating LINE button: show after hero
    if (fab) {
      if (y > window.innerHeight * 0.7) fab.classList.add("is-shown");
      else fab.classList.remove("is-shown");
    }

    lastY = y;
    ticking = false;
  }

  var fab = document.querySelector(".fab-group");
  window.addEventListener("scroll", function () {
    if (!ticking) { window.requestAnimationFrame(onScroll); ticking = true; }
  }, { passive: true });
  onScroll();

  /* ---- Drag-to-scroll for horizontal card rails (pointer/mouse) ---- */
  document.querySelectorAll("[data-hscroll]").forEach(function (rail) {
    var isDown = false, startX = 0, startScroll = 0, moved = 0;

    rail.addEventListener("pointerdown", function (e) {
      // Only hijack for mouse/pen; touch already scrolls natively & nicely
      if (e.pointerType === "touch") return;
      isDown = true; moved = 0;
      startX = e.clientX;
      startScroll = rail.scrollLeft;
      rail.classList.add("is-dragging");
      rail.setPointerCapture(e.pointerId);
    });
    rail.addEventListener("pointermove", function (e) {
      if (!isDown) return;
      var dx = e.clientX - startX;
      moved = Math.max(moved, Math.abs(dx));
      rail.scrollLeft = startScroll - dx;
    });
    function end(e) {
      if (!isDown) return;
      isDown = false;
      rail.classList.remove("is-dragging");
      try { rail.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    rail.addEventListener("pointerup", end);
    rail.addEventListener("pointercancel", end);
    rail.addEventListener("pointerleave", end);
    // Prevent accidental link/card click after a drag
    rail.addEventListener("click", function (e) {
      if (moved > 6) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  });

  /* ---- Carousel position indicator (dots) ---- */
  document.querySelectorAll("[data-hscroll]").forEach(function (rail) {
    var track = rail.querySelector(".hscroll__track");
    if (!track) return;
    var cards = track.children;
    if (cards.length < 2) return;

    var dots = document.createElement("div");
    dots.className = "hscroll__dots";
    dots.setAttribute("aria-hidden", "true");
    for (var i = 0; i < cards.length; i++) {
      var d = document.createElement("span");
      d.className = "hscroll__dot";
      dots.appendChild(d);
    }
    // カード下にあるスクロール案内は上へ移動して、ドットと並べる
    var trailingHint = rail.nextElementSibling;
    if (trailingHint && trailingHint.classList && trailingHint.classList.contains("hscroll__hint")) {
      trailingHint.classList.add("hscroll__hint--top");
      rail.parentNode.insertBefore(trailingHint, rail);
    }
    rail.parentNode.insertBefore(dots, rail);
    var dotEls = dots.children;
    var ticking = false;

    function refresh() {
      var rc = rail.getBoundingClientRect();
      var center = rc.left + rc.width / 2;
      var best = 0, bestDist = Infinity;
      for (var i = 0; i < cards.length; i++) {
        var b = cards[i].getBoundingClientRect();
        var dist = Math.abs((b.left + b.width / 2) - center);
        if (dist < bestDist) { bestDist = dist; best = i; }
      }
      for (var j = 0; j < dotEls.length; j++) {
        dotEls[j].classList.toggle("is-active", j === best);
      }
      ticking = false;
    }
    rail.addEventListener("scroll", function () {
      if (!ticking) { window.requestAnimationFrame(refresh); ticking = true; }
    }, { passive: true });
    window.addEventListener("resize", refresh);
    refresh();
  });

  /* ---- 機器：3D カバーフロー ---- */
  (function () {
    var root = document.getElementById("deviceFlow");
    if (!root) return;
    var stage = root.querySelector(".coverflow__stage");
    var cards = Array.prototype.slice.call(root.querySelectorAll(".cf-card"));
    var nameEl = root.querySelector(".coverflow__name");
    var descEl = root.querySelector(".coverflow__desc");
    var caption = root.querySelector(".coverflow__caption");
    var dotsWrap = root.querySelector(".coverflow__dots");
    var prevBtn = root.querySelector(".coverflow__btn--prev");
    var nextBtn = root.querySelector(".coverflow__btn--next");
    var n = cards.length;
    if (!n) return;
    var active = 0;

    // dots
    var dots = [];
    for (var d = 0; d < n; d++) {
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "coverflow__dot";
      dot.setAttribute("aria-label", (d + 1) + "番目へ");
      (function (idx) { dot.addEventListener("click", function () { go(idx); }); })(d);
      dotsWrap.appendChild(dot);
      dots.push(dot);
    }

    function layout() {
      var cardW = cards[0].offsetWidth || 170;
      var spacing = cardW * 0.62;
      for (var i = 0; i < n; i++) {
        var off = i - active;
        if (off > n / 2) off -= n;
        if (off < -n / 2) off += n;
        var abs = Math.abs(off);
        var sign = off < 0 ? -1 : 1;
        var x, y, z, rotate, scale, opacity;
        if (off === 0) {
          x = 0; y = -8; z = 60; rotate = 0; scale = 1.24; opacity = 1;
        } else {
          x = sign * (spacing + (abs - 1) * spacing * 0.6);
          y = 0;
          z = -170 - (abs - 1) * 85;
          rotate = -sign * 46;
          scale = abs === 1 ? 0.74 : 0.6;
          opacity = abs >= 3 ? 0 : (abs === 1 ? 0.8 : 0.4);
        }
        var card = cards[i];
        card.style.transform =
          "translate(-50%, -50%) translateX(" + x.toFixed(1) + "px) translateY(" + y + "px) translateZ(" + z + "px) rotateY(" + rotate + "deg) scale(" + scale.toFixed(3) + ")";
        card.style.opacity = opacity;
        card.style.zIndex = String(100 - abs);
        card.style.pointerEvents = abs >= 3 ? "none" : "auto";
        card.classList.toggle("is-active", off === 0);
      }
      for (var k = 0; k < n; k++) dots[k].classList.toggle("is-active", k === active);
      // caption fade
      caption.classList.add("is-changing");
      window.setTimeout(function () {
        nameEl.textContent = cards[active].getAttribute("data-name") || "";
        descEl.textContent = cards[active].getAttribute("data-desc") || "";
        caption.classList.remove("is-changing");
      }, 160);
    }

    function go(idx) {
      active = ((idx % n) + n) % n;
      layout();
    }
    function next() { go(active + 1); }
    function prev() { go(active - 1); }

    nextBtn.addEventListener("click", next);
    prevBtn.addEventListener("click", prev);

    // クリックで中央へ
    cards.forEach(function (card, i) {
      card.addEventListener("click", function () {
        if (!card.classList.contains("is-active") && !dragged) go(i);
      });
    });

    // スワイプ（左右）
    var startX = 0, downX = 0, isDown = false, dragged = false;
    stage.addEventListener("pointerdown", function (e) {
      isDown = true; dragged = false; startX = downX = e.clientX;
    });
    stage.addEventListener("pointermove", function (e) {
      if (!isDown) return;
      if (Math.abs(e.clientX - startX) > 8) dragged = true;
      downX = e.clientX;
    });
    function release() {
      if (!isDown) return;
      isDown = false;
      var dx = downX - startX;
      if (dx <= -40) next();
      else if (dx >= 40) prev();
    }
    stage.addEventListener("pointerup", release);
    stage.addEventListener("pointercancel", function () { isDown = false; });
    stage.addEventListener("pointerleave", release);

    // キーボード
    stage.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
    });

    window.addEventListener("resize", layout);
    // 画像読み込み後に幅が確定するので再レイアウト
    window.addEventListener("load", layout);
    layout();
  })();

  /* ---- Hero motion: zoom image + drift text on scroll ---- */
  (function () {
    var hero = document.querySelector(".hero");
    var img = document.querySelector(".hero__media img");
    var inner = document.querySelector(".hero__inner");
    if (reduceMotion || !hero || !img) return;
    var baseMargin = inner ? getComputedStyle(inner).marginTop : "0px";
    var hTicking = false;
    function heroUpdate() {
      var h = hero.offsetHeight || window.innerHeight;
      var p = Math.min(Math.max(window.scrollY / h, 0), 1);
      img.style.transform = "scale(" + (1 + p * 0.16).toFixed(3) + ")";
      if (inner) {
        inner.style.transform = "translateY(" + (p * -18).toFixed(1) + "px)";
        inner.style.opacity = (1 - p * 0.38).toFixed(2);
      }
      hTicking = false;
    }
    window.addEventListener("scroll", function () {
      if (!hTicking) { window.requestAnimationFrame(heroUpdate); hTicking = true; }
    }, { passive: true });
    heroUpdate();
  })();

  /* ---- Premium: scroll progress bar + subtle parallax ---- */
  (function () {
    var bar = document.createElement("div");
    bar.className = "scroll-progress";
    document.body.appendChild(bar);

    var items = [];
    function register(selector, strength, base) {
      document.querySelectorAll(selector).forEach(function (el) {
        items.push({ el: el, k: strength, base: base });
        el.style.transform = "translateY(0) scale(" + base + ")";
      });
    }
    if (!reduceMotion) {
      register(".band__img", 0.10, 1.16);
      register(".split__media img", 0.045, 1.14);
      register(".taikan__media img", 0.05, 1.12);
      register(".access__exterior img", 0.045, 1.14);
    }

    var vh = window.innerHeight;
    var pTicking = false;

    function update() {
      var de = document.documentElement;
      var max = de.scrollHeight - vh;
      bar.style.transform = "scaleX(" + (max > 0 ? Math.min(window.scrollY / max, 1) : 0) + ")";

      for (var i = 0; i < items.length; i++) {
        var p = items[i];
        var r = p.el.getBoundingClientRect();
        if (r.bottom < -120 || r.top > vh + 120) continue;
        var off = (r.top + r.height / 2 - vh / 2) / vh; /* ~ -0.5..0.5 */
        var ty = (-off * p.k * vh).toFixed(1);
        p.el.style.transform = "translateY(" + ty + "px) scale(" + p.base + ")";
      }
      pTicking = false;
    }

    window.addEventListener("scroll", function () {
      if (!pTicking) { window.requestAnimationFrame(update); pTicking = true; }
    }, { passive: true });
    window.addEventListener("resize", function () { vh = window.innerHeight; update(); });
    update();
  })();

  /* ---- 書籍ポップアップ（見開き） ---- */
  (function () {
    var modal = document.getElementById("bookModal");
    if (!modal) return;
    function open() {
      modal.hidden = false;
      document.body.classList.add("is-modal-open");
      var c = modal.querySelector(".bookmodal__close");
      if (c) c.focus();
    }
    function close() {
      modal.hidden = true;
      document.body.classList.remove("is-modal-open");
    }
    document.querySelectorAll("[data-book-open]").forEach(function (el) {
      el.addEventListener("click", function (e) { e.preventDefault(); open(); });
    });
    modal.querySelectorAll("[data-book-close]").forEach(function (el) {
      el.addEventListener("click", close);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !modal.hidden) close();
    });
  })();

  /* ---- Smooth anchor offset for fixed header (in-page links) ---- */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      if (a.hasAttribute("data-book-open")) return;
      var id = a.getAttribute("href");
      if (id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
  });
})();
