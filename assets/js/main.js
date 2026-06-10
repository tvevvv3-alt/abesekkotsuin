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

  /* ---- Smooth anchor offset for fixed header (in-page links) ---- */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      var id = a.getAttribute("href");
      if (id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
  });
})();
