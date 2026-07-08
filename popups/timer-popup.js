/**
 * BurnLab — Mystery Discount Popup
 * Deploy to: assets/timer-popup.js
 *
 * Config injected by timer-popup.liquid via window.BLPopupConfig.
 */
(function () {
  'use strict';

  var cfg           = window.BLPopupConfig || {};
  var SECTION_ID    = cfg.sectionId       || '';
  var DELAY_MS      = cfg.delayMs         != null ? cfg.delayMs        : 20000;
  var SESSION_ONCE  = cfg.sessionOnce     != null ? cfg.sessionOnce    : true;
  var SHOW_TIMER    = cfg.showTimer       != null ? cfg.showTimer      : true;
  var TOTAL_SECS    = cfg.timerTotalSecs  != null ? cfg.timerTotalSecs : 172800; /* 2 days default */
  var CLOSE_ON_END  = cfg.closeOnTimerEnd != null ? cfg.closeOnTimerEnd : false;
  var STORAGE_KEY   = 'bl_popup_seen_' + SECTION_ID;

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

  /* ── Countdown ── */

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
        if (CLOSE_ON_END) {
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

    /* Move focus to first focusable element inside popup */
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

  /* ── Button click ── */

  function onButtonClick(e) {
    var btn          = e.currentTarget;
    var discount     = (btn.getAttribute('data-discount') || '').trim();
    var closeOnClick = btn.getAttribute('data-close-on-click') !== 'false';
    var href         = btn.getAttribute('href') || '';

    if (discount) {
      e.preventDefault();
      var redirect = (href && href !== '#')
        ? '?redirect=' + encodeURIComponent(href)
        : '';
      if (closeOnClick) closePopup();
      window.location.href = '/discount/' + encodeURIComponent(discount) + redirect;
      return;
    }

    if (closeOnClick) closePopup();
  }

  /* ── Keyboard trap ── */

  function onKeyDown(e) {
    if (!isOpen) return;

    if (e.key === 'Escape') {
      closePopup();
      return;
    }

    /* Trap Tab focus inside popup */
    if (e.key === 'Tab') {
      var focusable = Array.from(popup.querySelectorAll(
        'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])'
      ));
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

    /* Timer display elements */
    elDays  = document.getElementById(SECTION_ID + '-days');
    elHours = document.getElementById(SECTION_ID + '-hours');
    elMins  = document.getElementById(SECTION_ID + '-mins');
    elSecs  = document.getElementById(SECTION_ID + '-secs');

    /* Set correct initial display without waiting for first tick */
    if (SHOW_TIMER) updateDisplay(TOTAL_SECS);

    /* Close button(s) */
    popup.querySelectorAll('.bl-popup__close').forEach(function (btn) {
      btn.addEventListener('click', closePopup);
    });

    /* CTA buttons */
    popup.querySelectorAll('.bl-popup__btn').forEach(function (btn) {
      btn.addEventListener('click', onButtonClick);
    });

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
