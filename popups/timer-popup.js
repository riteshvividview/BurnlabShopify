/**
 * BurnLab — Mystery Discount Popup (3-Step Flow)
 * Deploy to: assets/timer-popup.js
 *
 * Display 1 — Category selection (+ countdown timer)
 * Display 2 — Email collection
 * Display 3 — Discount revealed (code + copy + shop now)
 *
 * Config injected by timer-popup.liquid via window.BLPopupConfig.
 */
(function () {
  'use strict';

  var cfg            = window.BLPopupConfig || {};
  var SECTION_ID     = cfg.sectionId       || '';
  var DELAY_MS       = cfg.delayMs         != null ? cfg.delayMs        : 20000;
  var SESSION_ONCE   = cfg.sessionOnce     != null ? cfg.sessionOnce    : true;
  var SHOW_TIMER     = cfg.showTimer       != null ? cfg.showTimer      : true;
  var TOTAL_SECS     = cfg.timerTotalSecs  != null ? cfg.timerTotalSecs : 600;
  var CLOSE_ON_END   = cfg.closeOnTimerEnd != null ? cfg.closeOnTimerEnd : false;
  var DISCOUNT_CODE  = cfg.discountCode    || '';
  var CODE_MESSAGE   = cfg.codeMessage     || '';
  var CLOSE_ON_COPY  = cfg.closeOnCopy     != null ? cfg.closeOnCopy : false;
  var COPY_TEXT      = cfg.copyButtonText       || 'Copy Code';
  var COPIED_TEXT    = cfg.copyButtonCopiedText || 'Copied!';
  var DEFAULT_SHOP_URL = cfg.shopButtonUrl || '';
  var STORAGE_KEY    = 'bl_popup_seen_' + SECTION_ID;
  var EMAIL_RE       = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /* In the Shopify editor: show immediately, skip session gate */
  var IS_EDITOR = !!(window.Shopify && window.Shopify.designMode);
  if (IS_EDITOR) {
    DELAY_MS     = 0;
    SESSION_ONCE = false;
  }

  var popup        = null;
  var elDays       = null;
  var elHours      = null;
  var elMins       = null;
  var elSecs       = null;
  var countdownId  = null;
  var triggerTimeId = null;
  var timeLeft     = TOTAL_SECS;
  var isOpen       = false;

  var displays            = [];
  var currentStep         = 1;
  var selectedCategory    = null;
  var selectedCategoryUrl = null;
  var elShopBtn           = null;

  var elConfettiCanvas   = null;
  var elCodeCopyBtn      = null;
  var elCodeMsg          = null;
  var elCodeCopyLabel    = null;
  var elCodeCopyIcon     = null;
  var elCodeCheckIcon    = null;
  var copyResetTimeoutId = null;
  var codeMsgTimeoutId   = null;
  var COPY_RESET_MS      = 1800;
  var CODE_MSG_MS        = 2400;

  var elEmailForm   = null;
  var elEmailInput  = null;
  var elRevealBtn   = null;
  var elBackBtn     = null;
  var isSubmitting  = false;

  var MOBILE_MQ = window.matchMedia ? window.matchMedia('(max-width: 640px)') : null;

  /* ── Helpers ── */

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function decompose(secs) {
    secs = Math.max(0, secs);
    var d = Math.floor(secs / 86400);
    var rem = secs % 86400;
    var h = Math.floor(rem / 3600);
    rem = rem % 3600;
    var m = Math.floor(rem / 60);
    var s = rem % 60;
    return { d: d, h: h, m: m, s: s };
  }

  function updateDisplay(totalSecs) {
    var t = decompose(totalSecs);
    if (elDays)  elDays.textContent  = pad(t.d);
    if (elHours) elHours.textContent = pad(t.h);
    if (elMins)  elMins.textContent  = pad(t.m);
    if (elSecs)  elSecs.textContent  = pad(t.s);
  }

  function hasBeenSeen() {
    if (!SESSION_ONCE) return false;
    try { return !!sessionStorage.getItem(STORAGE_KEY); } catch (e) { return false; }
  }

  function markSeen() {
    if (!SESSION_ONCE) return;
    try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
  }

  /* ── Countdown (runs throughout — only Display 1 shows it) ── */

  function startCountdown() {
    if (!SHOW_TIMER) return;
    timeLeft = TOTAL_SECS;
    updateDisplay(timeLeft);

    countdownId = setInterval(function () {
      timeLeft -= 1;
      updateDisplay(timeLeft);

      if (timeLeft <= 0) {
        clearInterval(countdownId);
        countdownId = null;
        if (CLOSE_ON_END && currentStep === 1) {
          setTimeout(closePopup, 900);
        }
      }
    }, 1000);
  }

  function stopCountdown() {
    if (countdownId) {
      clearInterval(countdownId);
      countdownId = null;
    }
  }

  /* ── Open / close ── */

  function openPopup() {
    if (!popup || isOpen) return;
    isOpen = true;
    popup.classList.add('bl-popup--open');
    popup.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    markSeen();
    startCountdown();

    var firstFocusable = popup.querySelector(
      'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])'
    );
    if (firstFocusable) {
      setTimeout(function () { firstFocusable.focus(); }, 60);
    }
  }

  function closePopup() {
    if (!popup || !isOpen) return;
    isOpen = false;
    popup.classList.remove('bl-popup--open');
    popup.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    stopCountdown();
  }

  /* ── Confetti burst (self-contained, no external library/CDN) ── */

  function fireConfetti(canvas) {
    if (!canvas) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var rect = canvas.parentElement.getBoundingClientRect();
    var dpr  = window.devicePixelRatio || 1;
    canvas.width  = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width  = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var colors = ['#00e676', '#eaf4f5', '#ffffff', '#ffd166', '#ff6b6b'];
    var count  = 110;
    var particles = [];

    for (var i = 0; i < count; i++) {
      particles.push({
        x: rect.width / 2 + (Math.random() - 0.5) * 40,
        y: rect.height * 0.18,
        vx: (Math.random() - 0.5) * 10,
        vy: Math.random() * -8 - 4,
        size: Math.random() * 6 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        vr: (Math.random() - 0.5) * 22,
        shape: Math.random() > 0.5 ? 'circle' : 'rect',
        gravity: 0.26 + Math.random() * 0.14,
        drag: 0.994
      });
    }

    var start    = null;
    var duration = 1600;

    function frame(ts) {
      if (!start) start = ts;
      var elapsed = ts - start;
      ctx.clearRect(0, 0, rect.width, rect.height);

      for (var j = 0; j < particles.length; j++) {
        var p = particles[j];
        p.vx *= p.drag;
        p.vy = p.vy * p.drag + p.gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.vr;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        }
        ctx.restore();
      }

      if (elapsed < duration) {
        requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, rect.width, rect.height);
      }
    }

    requestAnimationFrame(frame);
  }

  /* ── Step navigation ──
     Cross-fades the outgoing/incoming display via a data-enter
     attribute the CSS reads for its resting transform, then
     toggles .is-active so the transition animates between them. */

  function goToStep(toStep, enterDir, exitDir) {
    if (toStep === currentStep) return;
    var fromEl = displays[currentStep - 1];
    var toEl   = displays[toStep - 1];
    if (!toEl) return;

    if (toEl)   toEl.setAttribute('data-enter', enterDir);
    if (fromEl) fromEl.setAttribute('data-enter', exitDir);

    if (fromEl) fromEl.classList.remove('is-active');
    if (toEl)   toEl.classList.add('is-active');

    currentStep = toStep;

    if (toStep === 3) {
      fireConfetti(elConfettiCanvas);
    }

    /* Move focus into the new step for keyboard/screen-reader users */
    var focusTarget = toEl.querySelector('input, button, [href]');
    if (focusTarget) {
      setTimeout(function () { focusTarget.focus(); }, 320);
    }
  }

  function selectCategory(label, url) {
    selectedCategory = label;
    selectedCategoryUrl = url || null;
    if (elShopBtn) {
      elShopBtn.setAttribute('href', selectedCategoryUrl || DEFAULT_SHOP_URL);
    }
    /* Dispatch a custom event so any analytics script can pick this up
       without this popup needing to hardcode a specific platform. */
    try {
      document.dispatchEvent(new CustomEvent('bl-popup:category-selected', {
        detail: { category: label, url: selectedCategoryUrl, sectionId: SECTION_ID }
      }));
    } catch (e) {}
    goToStep(2, 'right', 'left');
  }

  /* ── Email validation + submission ──
     Posts to Shopify's native newsletter/customer endpoint
     (form_type=customer, contact[tags]=newsletter) — the same
     mechanism Shopify's own {% form 'customer' %} newsletter forms
     use. No app required. Best-effort: the user still proceeds to
     the discount reveal even if this request fails. */

  function isValidEmail(value) {
    return EMAIL_RE.test((value || '').trim());
  }

  function updateRevealButtonState() {
    if (!elRevealBtn || !elEmailInput) return;
    var valid = isValidEmail(elEmailInput.value);
    elRevealBtn.disabled = !valid || isSubmitting;
  }

  function submitEmail(email) {
    var formData = new FormData();
    formData.append('form_type', 'customer');
    formData.append('utf8', '✓');
    formData.append('contact[email]', email);
    var tags = 'newsletter,mystery-popup';
    if (selectedCategory) tags += ',' + selectedCategory.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    formData.append('contact[tags]', tags);

    return fetch('/contact', {
      method: 'POST',
      body: formData,
      credentials: 'same-origin'
    });
  }

  function onEmailFormSubmit(e) {
    e.preventDefault();
    if (isSubmitting || !elEmailInput) return;
    var email = elEmailInput.value.trim();
    if (!isValidEmail(email)) {
      elEmailInput.classList.add('is-invalid');
      return;
    }
    elEmailInput.classList.remove('is-invalid');

    isSubmitting = true;
    if (elRevealBtn) {
      elRevealBtn.disabled = true;
      elRevealBtn.classList.add('is-loading');
    }

    function proceed() {
      isSubmitting = false;
      if (elRevealBtn) elRevealBtn.classList.remove('is-loading');
      goToStep(3, 'scale', 'scale');
    }

    submitEmail(email).then(proceed).catch(proceed);
  }

  /* ── Copy discount code ── */

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  /* Always resolves — even if the Clipboard API rejects (common inside
     the Shopify theme-editor preview iframe due to Permissions Policy)
     — so the caller's success/UI-feedback code always runs. */
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () {
        fallbackCopy(text);
      });
    }
    fallbackCopy(text);
    return Promise.resolve();
  }

  function showCodeMessage(text) {
    if (!elCodeMsg || !text) return;
    clearTimeout(codeMsgTimeoutId);
    elCodeMsg.textContent = text;
    elCodeMsg.classList.add('is-visible');
    codeMsgTimeoutId = setTimeout(function () {
      elCodeMsg.classList.remove('is-visible');
    }, CODE_MSG_MS);
  }

  function onCopyClick() {
    if (!elCodeCopyBtn) return;
    var code = elCodeCopyBtn.getAttribute('data-copy-code') || '';
    if (!code) return;

    copyToClipboard(code).then(function () {
      elCodeCopyBtn.classList.add('is-copied');
      if (elCodeCopyIcon)  elCodeCopyIcon.style.display = 'none';
      if (elCodeCheckIcon) elCodeCheckIcon.style.display = '';
      if (elCodeCopyLabel) elCodeCopyLabel.textContent = COPIED_TEXT;

      showCodeMessage(CODE_MESSAGE);

      clearTimeout(copyResetTimeoutId);
      copyResetTimeoutId = setTimeout(function () {
        elCodeCopyBtn.classList.remove('is-copied');
        if (elCodeCopyIcon)  elCodeCopyIcon.style.display = '';
        if (elCodeCheckIcon) elCodeCheckIcon.style.display = 'none';
        if (elCodeCopyLabel) elCodeCopyLabel.textContent = COPY_TEXT;
      }, COPY_RESET_MS);

      /* Silently redeem the real Shopify discount (native feature, no app) */
      fetch('/discount/' + encodeURIComponent(code), { credentials: 'same-origin' })
        .catch(function () { /* best-effort; UI feedback already shown */ });

      if (CLOSE_ON_COPY) {
        setTimeout(closePopup, 1400);
      }
    }).catch(function () { /* copyToClipboard never rejects, but stay safe */ });
  }

  /* ── Keyboard trap ── */

  function onKeyDown(e) {
    if (!isOpen) return;

    if (e.key === 'Escape') {
      closePopup();
      return;
    }

    if (e.key === 'Tab') {
      var focusable = Array.from(popup.querySelectorAll(
        'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])'
      )).filter(function (el) {
        return el.offsetParent !== null; /* only currently-visible controls */
      });
      if (!focusable.length) return;
      var first = focusable[0];
      var last  = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }

  /* ── Mobile: no side image/brand panel at all — desktop-only.
     CSS already hides it (display:none under 640px), this just makes
     sure the browser never fetches/keeps the image in the DOM on
     mobile, and stays in sync if the viewport is resized. ── */

  function syncMobileImage() {
    if (!popup) return;
    var leftPanel = popup.querySelector('.bl-popup__left');
    if (!leftPanel) return;
    var isMobile = MOBILE_MQ ? MOBILE_MQ.matches : window.innerWidth <= 640;
    if (isMobile) {
      var img = leftPanel.querySelector('img');
      if (img) {
        img.removeAttribute('src');
        img.removeAttribute('srcset');
      }
      leftPanel.remove();
    }
  }

  /* ── Shopify editor events ── */

  function onSectionSelect(e) {
    if (e.detail && e.detail.sectionId === SECTION_ID) openPopup();
  }

  function onSectionDeselect(e) {
    if (e.detail && e.detail.sectionId === SECTION_ID) closePopup();
  }

  function onSectionUnload(e) {
    if (e.detail && e.detail.sectionId === SECTION_ID) {
      clearTimeout(triggerTimeId);
      stopCountdown();
      document.removeEventListener('keydown', onKeyDown);
    }
  }

  /* ── Init ── */

  function init() {
    popup = document.getElementById(SECTION_ID);
    if (!popup) return;

    displays = Array.from(popup.querySelectorAll('.bl-popup__display'));

    syncMobileImage();
    if (MOBILE_MQ) {
      var onMqChange = function () { syncMobileImage(); };
      if (MOBILE_MQ.addEventListener) MOBILE_MQ.addEventListener('change', onMqChange);
      else if (MOBILE_MQ.addListener) MOBILE_MQ.addListener(onMqChange); /* older Safari */
    }

    /* Timer display elements */
    elDays  = document.getElementById(SECTION_ID + '-days');
    elHours = document.getElementById(SECTION_ID + '-hours');
    elMins  = document.getElementById(SECTION_ID + '-mins');
    elSecs  = document.getElementById(SECTION_ID + '-secs');
    if (SHOW_TIMER) updateDisplay(TOTAL_SECS);

    /* Close button(s) */
    popup.querySelectorAll('.bl-popup__close').forEach(function (btn) {
      btn.addEventListener('click', closePopup);
    });

    /* Step 1 — category buttons */
    popup.querySelectorAll('[data-category-btn]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectCategory(
          btn.getAttribute('data-category') || '',
          btn.getAttribute('data-category-url') || ''
        );
      });
    });

    /* Step 2 — email form */
    elEmailForm  = popup.querySelector('[data-email-form]');
    elEmailInput = popup.querySelector('[data-email-input]');
    elRevealBtn  = popup.querySelector('[data-reveal-btn]');
    elBackBtn    = popup.querySelector('[data-back-btn]');

    if (elEmailInput) {
      elEmailInput.addEventListener('input', function () {
        elEmailInput.classList.remove('is-invalid');
        updateRevealButtonState();
      });
    }
    if (elEmailForm) {
      elEmailForm.addEventListener('submit', onEmailFormSubmit);
    }
    if (elBackBtn) {
      elBackBtn.addEventListener('click', function () {
        goToStep(1, 'left', 'right');
      });
    }

    /* Step 3 — discount code copy */
    elConfettiCanvas = popup.querySelector('[data-confetti-canvas]');
    elCodeCopyBtn    = popup.querySelector('[data-copy-code]');
    elCodeMsg        = popup.querySelector('[data-code-msg]');
    elCodeCopyLabel  = popup.querySelector('[data-copy-label]');
    elCodeCopyIcon   = popup.querySelector('[data-copy-icon]');
    elCodeCheckIcon  = popup.querySelector('[data-check-icon]');

    if (elCodeCopyBtn) {
      elCodeCopyBtn.addEventListener('click', onCopyClick);
    }

    elShopBtn = popup.querySelector('[data-shop-btn]');

    /* Keyboard */
    document.addEventListener('keydown', onKeyDown);

    /* Shopify editor */
    document.addEventListener('shopify:section:select',   onSectionSelect);
    document.addEventListener('shopify:section:deselect', onSectionDeselect);
    document.addEventListener('shopify:section:unload',   onSectionUnload);

    /* Check session — skip if already seen */
    if (hasBeenSeen()) return;

    /* Schedule trigger */
    triggerTimeId = setTimeout(openPopup, DELAY_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
