/* ============================================================
   GRUHA ALANKARA — script.js
   Camera, AR, UI interactions & upload utilities
   ============================================================ */

'use strict';

/* ─────────────────────────────────────────
   1. CAMERA MODULE
   ───────────────────────────────────────── */
const Camera = (() => {
  let activeStream = null;       // holds the active MediaStream
  let videoEl     = null;        // <video> element reference
  let canvasEl    = null;        // <canvas> element reference (capture)
  let onCaptureCb = null;        // callback after a successful capture

  /* ── 1a. Request Camera Permission & Start Stream ── */
  async function start(videoElement, options = {}) {
    videoEl = videoElement;

    // Constraints: ideal HD resolution, prefer back camera on mobile
    const constraints = {
      video: {
        width:  { ideal: 1280, max: 1920 },
        height: { ideal: 720,  max: 1080 },
        facingMode: options.facingMode || { ideal: 'environment' },
        frameRate: { ideal: 30 }
      },
      audio: false
    };

    try {
      // Check API availability
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new DOMException(
          'MediaDevices API not supported in this browser.',
          'NotSupportedError'
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      activeStream = stream;

      // Attach stream to video element
      videoEl.srcObject = stream;
      videoEl.setAttribute('playsinline', '');   // iOS Safari requirement
      videoEl.setAttribute('autoplay', '');
      videoEl.muted = true;

      await videoEl.play();

      _setStatus('live');
      _showMessage('Camera active', 'success');

      return stream;

    } catch (err) {
      _handleError(err);
      throw err;   // re-throw so callers can react
    }
  }

  /* ── 1b. Stop Camera & Release Stream ── */
  function stop() {
    if (!activeStream) return;

    activeStream.getTracks().forEach(track => {
      track.stop();
    });

    if (videoEl) {
      videoEl.srcObject = null;
      videoEl.load();   // reset the element
    }

    activeStream = null;
    _setStatus('idle');
  }

  /* ── 1c. Switch Front / Back Camera ── */
  async function switchCamera() {
    if (!activeStream) return;

    const currentFacing = activeStream
      .getVideoTracks()[0]
      ?.getSettings()?.facingMode ?? 'environment';

    const nextFacing = currentFacing === 'environment' ? 'user' : 'environment';

    stop();
    await start(videoEl, { facingMode: nextFacing });
  }

  /* ── 1d. Capture Frame → Canvas → Blob ── */
  function capture(quality = 0.92) {
    return new Promise((resolve, reject) => {
      if (!videoEl || !activeStream) {
        reject(new Error('Camera is not active.'));
        return;
      }

      // Create (or reuse) an offscreen canvas
      if (!canvasEl) {
        canvasEl = document.createElement('canvas');
      }

      const vw = videoEl.videoWidth;
      const vh = videoEl.videoHeight;

      if (!vw || !vh) {
        reject(new Error('Video dimensions not available yet.'));
        return;
      }

      canvasEl.width  = vw;
      canvasEl.height = vh;

      const ctx = canvasEl.getContext('2d');

      // Mirror front camera so text isn't backwards
      const isFront = activeStream
        .getVideoTracks()[0]
        ?.getSettings()?.facingMode === 'user';

      if (isFront) {
        ctx.translate(vw, 0);
        ctx.scale(-1, 1);
      }

      ctx.drawImage(videoEl, 0, 0, vw, vh);

      // Reset transform
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      canvasEl.toBlob(
        blob => {
          if (!blob) {
            reject(new Error('Failed to capture frame.'));
            return;
          }
          resolve(blob);
          if (typeof onCaptureCb === 'function') onCaptureCb(blob);
        },
        'image/jpeg',
        quality
      );
    });
  }

  /* ── 1e. Upload Captured Blob to Backend ── */
  async function uploadCapture(blob, endpoint = '/analyze', extraFields = {}) {
    const formData = new FormData();
    formData.append('image', blob, `capture_${Date.now()}.jpg`);

    Object.entries(extraFields).forEach(([key, val]) => {
      formData.append(key, val);
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
      headers: {
        'X-Requested-With': 'XMLHttpRequest'
      }
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Upload failed (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  /* ── 1f. Capture + Upload in one call ── */
  async function captureAndUpload(endpoint = '/analyze', extraFields = {}) {
    const uiBtn = document.getElementById('btn-capture');
    _setButtonLoading(uiBtn, true);

    try {
      const blob = await capture();
      const result = await uploadCapture(blob, endpoint, extraFields);
      _showMessage('Image captured and uploaded!', 'success');
      return result;
    } catch (err) {
      _showMessage(err.message, 'error');
      throw err;
    } finally {
      _setButtonLoading(uiBtn, false);
    }
  }

  /* ── 1g. Register post-capture callback ── */
  function onCapture(cb) { onCaptureCb = cb; }

  /* ── Helpers ── */
  function _setStatus(state) {
    const wrapper = document.querySelector('.camera-feed-wrapper');
    const dot     = document.querySelector('.camera-status .status-dot');
    const label   = document.querySelector('.camera-status .status-label');

    if (wrapper) {
      wrapper.classList.toggle('active', state === 'live');
    }
    if (dot) {
      dot.style.background = state === 'live'
        ? 'var(--success)'
        : 'var(--danger)';
    }
    if (label) {
      label.textContent = state === 'live' ? 'LIVE' : 'OFF';
    }
  }

  function _handleError(err) {
    let msg;

    switch (err.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        msg = 'Camera access denied. Please allow camera permission in your browser settings and reload.';
        break;
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        msg = 'No camera device found. Please connect a camera and try again.';
        break;
      case 'NotReadableError':
      case 'TrackStartError':
        msg = 'Camera is already in use by another application. Please close it and try again.';
        break;
      case 'OverconstrainedError':
      case 'ConstraintNotSatisfiedError':
        msg = 'Camera does not support the requested resolution. Trying fallback settings…';
        // Retry without ideal resolution constraints
        if (videoEl) start(videoEl, { facingMode: 'environment' }).catch(() => {});
        break;
      case 'NotSupportedError':
        msg = 'Your browser does not support camera access. Please try Chrome or Firefox.';
        break;
      case 'AbortError':
        msg = 'Camera startup was interrupted. Please try again.';
        break;
      default:
        msg = `Camera error: ${err.message || err.name}`;
    }

    _showMessage(msg, 'error');
    console.error('[Camera]', err.name, err.message);
  }

  function _showMessage(text, type = 'info') {
    Flash.show(text, type);
  }

  function _setButtonLoading(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    btn.classList.toggle('loading', loading);
    if (!loading) btn.disabled = false;
  }

  /* ── Public API ── */
  return { start, stop, switchCamera, capture, uploadCapture, captureAndUpload, onCapture };
})();


/* ─────────────────────────────────────────
   2. FLASH / TOAST NOTIFICATIONS
   ───────────────────────────────────────── */
const Flash = (() => {
  function show(message, type = 'info', duration = 4500) {
    let container = document.querySelector('.flash-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'flash-container';
      document.body.appendChild(container);
    }

    const icons = {
      success: '✓',
      error:   '✕',
      warning: '⚠',
      info:    'ℹ'
    };

    const toast = document.createElement('div');
    toast.className = `flash ${type}`;
    toast.innerHTML = `
      <span class="flash-icon">${icons[type] || icons.info}</span>
      <span class="flash-text">${message}</span>
      <button class="flash-close" aria-label="Dismiss">✕</button>
    `;

    toast.querySelector('.flash-close').addEventListener('click', () => dismiss(toast));
    container.appendChild(toast);

    // Auto-dismiss
    const timer = setTimeout(() => dismiss(toast), duration);
    toast._timer = timer;

    return toast;
  }

  function dismiss(toast) {
    if (!toast || toast._dismissed) return;
    toast._dismissed = true;
    clearTimeout(toast._timer);
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    toast.style.opacity    = '0';
    toast.style.transform  = 'translateX(24px)';
    setTimeout(() => toast.remove(), 320);
  }

  return { show, dismiss };
})();


/* ─────────────────────────────────────────
   3. LIVE AR CAMERA PAGE INIT
   ───────────────────────────────────────── */
function initLiveARCamera() {
  const videoEl     = document.getElementById('camera-video');
  const startBtn    = document.getElementById('btn-start-camera');
  const stopBtn     = document.getElementById('btn-stop-camera');
  const captureBtn  = document.getElementById('btn-capture');
  const switchBtn   = document.getElementById('btn-switch-camera');

  if (!videoEl) return;  // not on the AR camera page

  // Start camera on button click
  startBtn?.addEventListener('click', async () => {
    try {
      await Camera.start(videoEl);
      startBtn.style.display  = 'none';
      stopBtn.style.display   = 'inline-flex';
      captureBtn.disabled     = false;
      switchBtn && (switchBtn.disabled = false);
    } catch (_) { /* already handled inside Camera */ }
  });

  // Stop camera
  stopBtn?.addEventListener('click', () => {
    Camera.stop();
    startBtn.style.display  = 'inline-flex';
    stopBtn.style.display   = 'none';
    captureBtn.disabled     = true;
    switchBtn && (switchBtn.disabled = true);
  });

  // Switch front/back
  switchBtn?.addEventListener('click', () => {
    Camera.switchCamera();
  });

  // Capture & upload
  captureBtn?.addEventListener('click', async () => {
    const roomType = document.getElementById('room-type-select')?.value || 'living_room';

    try {
      const result = await Camera.captureAndUpload('/analyze_camera', { room_type: roomType });

      // Redirect to analysis results or update UI
      if (result?.redirect) {
        window.location.href = result.redirect;
      } else if (result?.analysis) {
        renderAnalysisResults(result.analysis);
      }
    } catch (_) { /* errors already handled */ }
  });

  // Cleanup when leaving the page
  window.addEventListener('beforeunload', () => Camera.stop());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') Camera.stop();
  });
}


/* ─────────────────────────────────────────
   4. ROOM ANALYSIS UPLOAD (file input)
   ───────────────────────────────────────── */
function initRoomAnalyzer() {
  const dropzone  = document.getElementById('room-dropzone');
  const fileInput = document.getElementById('room-image-input');
  const preview   = document.getElementById('room-preview-img');
  const changeBtn = document.getElementById('btn-change-image');
  const analyzeBtn = document.getElementById('btn-analyze');

  if (!dropzone && !fileInput) return;

  // Drag-and-drop
  dropzone?.addEventListener('dragover', e => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });

  dropzone?.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-over');
  });

  dropzone?.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleImageFile(file);
  });

  dropzone?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) handleImageFile(file);
  });

  changeBtn?.addEventListener('click', () => fileInput?.click());

  function handleImageFile(file) {
    // Validate type
    if (!file.type.startsWith('image/')) {
      Flash.show('Please select a valid image file (JPG, PNG, WEBP).', 'error');
      return;
    }

    // Validate size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      Flash.show('Image size must be under 10MB.', 'warning');
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = e => {
      if (preview) {
        preview.src = e.target.result;
        preview.style.display = 'block';
      }
      // Show the "Change Image" button, hide dropzone prompt
      dropzone?.classList.add('has-image');
      analyzeBtn && (analyzeBtn.disabled = false);
    };
    reader.readAsDataURL(file);
  }
}


/* ─────────────────────────────────────────
   5. DESIGN STUDIO — TAB NAVIGATION
   ───────────────────────────────────────── */
function initDesignStudioTabs() {
  const tabBtns  = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  if (!tabBtns.length) return;

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;

      // Update buttons
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update panes with fade animation
      tabPanes.forEach(pane => {
        if (pane.id === target) {
          pane.style.display = 'block';
          pane.style.animation = 'cardFadeIn 0.3s ease both';
        } else {
          pane.style.display = 'none';
        }
      });
    });
  });
}


/* ─────────────────────────────────────────
   6. BUDGET RANGE SLIDER — live value sync
   ───────────────────────────────────────── */
function initBudgetSlider() {
  const slider  = document.getElementById('budget-slider');
  const display = document.getElementById('budget-display');
  const input   = document.getElementById('budget-input');

  if (!slider) return;

  function updateBudget(val) {
    const formatted = new Intl.NumberFormat('en-US').format(val);
    if (display) display.textContent = `$${formatted}`;
    if (input)   input.value = val;

    // Animate the filled track
    const pct = ((val - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.background = `linear-gradient(to right, var(--accent-primary) ${pct}%, var(--bg-elevated) ${pct}%)`;
  }

  slider.addEventListener('input', () => updateBudget(slider.value));
  input?.addEventListener('input', () => {
    const val = Math.min(Math.max(Number(input.value) || 0, slider.min), slider.max);
    slider.value = val;
    updateBudget(val);
  });

  // Init on load
  updateBudget(slider.value);
}


/* ─────────────────────────────────────────
   7. STYLE SELECTOR CARDS
   ───────────────────────────────────────── */
function initStyleSelector() {
  const cards = document.querySelectorAll('.style-card');
  const input = document.getElementById('selected-style-input');

  if (!cards.length) return;

  cards.forEach(card => {
    card.addEventListener('click', () => {
      // Deselect all
      cards.forEach(c => c.classList.remove('selected'));
      // Select clicked
      card.classList.add('selected');

      const styleValue = card.dataset.style;
      if (input) input.value = styleValue;

      // Visual feedback
      const label = card.querySelector('.style-label')?.textContent || styleValue;
      Flash.show(`Style selected: ${label}`, 'success', 2500);
    });

    // Keyboard accessibility
    card.setAttribute('tabindex', '0');
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
  });
}


/* ─────────────────────────────────────────
   8. NAVIGATION — mobile hamburger
   ───────────────────────────────────────── */
function initNavigation() {
  const toggle   = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');

  toggle?.addEventListener('click', () => {
    navLinks?.classList.toggle('open');
    toggle.setAttribute(
      'aria-expanded',
      navLinks?.classList.contains('open') ? 'true' : 'false'
    );
  });

  // Close menu on nav link click (mobile)
  document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', () => navLinks?.classList.remove('open'));
  });

  // Highlight active nav link based on current path
  const currentPath = window.location.pathname.replace(/\/$/, '');
  document.querySelectorAll('.nav-links a').forEach(link => {
    const linkPath = new URL(link.href, window.location.origin).pathname.replace(/\/$/, '');
    if (linkPath === currentPath) link.classList.add('active');
  });
}


/* ─────────────────────────────────────────
   9. PROGRESS BAR — animate on scroll
   ───────────────────────────────────────── */
function initProgressBars() {
  const bars = document.querySelectorAll('.progress-bar[data-value]');
  if (!bars.length) return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const bar = entry.target;
        const val = parseFloat(bar.dataset.value) || 0;
        bar.style.transition = 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
        bar.style.width      = `${Math.min(val, 100)}%`;
        observer.unobserve(bar);
      }
    });
  }, { threshold: 0.2 });

  bars.forEach(bar => {
    bar.style.width = '0%';   // start from 0 for animation
    observer.observe(bar);
  });
}


/* ─────────────────────────────────────────
   10. CATALOG — filter & sort
   ───────────────────────────────────────── */
function initCatalogFilters() {
  const styleFilter = document.getElementById('filter-style');
  const roomFilter  = document.getElementById('filter-room');
  const sortSelect  = document.getElementById('sort-by');
  const items       = document.querySelectorAll('.catalog-item[data-style][data-room]');

  if (!items.length) return;

  function applyFilters() {
    const styleVal = styleFilter?.value || 'all';
    const roomVal  = roomFilter?.value  || 'all';
    const sortVal  = sortSelect?.value  || 'newest';

    let visible = Array.from(items).filter(item => {
      const matchStyle = styleVal === 'all' || item.dataset.style === styleVal;
      const matchRoom  = roomVal  === 'all' || item.dataset.room  === roomVal;
      return matchStyle && matchRoom;
    });

    // Sort
    visible.sort((a, b) => {
      const dateA = new Date(a.dataset.created || 0);
      const dateB = new Date(b.dataset.created || 0);
      if (sortVal === 'newest') return dateB - dateA;
      if (sortVal === 'oldest') return dateA - dateB;
      // budget sort
      const budA = parseFloat(a.dataset.budget || 0);
      const budB = parseFloat(b.dataset.budget || 0);
      if (sortVal === 'budget-asc')  return budA - budB;
      if (sortVal === 'budget-desc') return budB - budA;
      return 0;
    });

    // Show/hide with animation
    items.forEach(item => {
      item.style.display = 'none';
      item.style.animation = '';
    });

    visible.forEach((item, i) => {
      item.style.display    = 'block';
      item.style.animation  = `cardFadeIn 0.35s ease ${i * 0.05}s both`;
    });
  }

  styleFilter?.addEventListener('change', applyFilters);
  roomFilter?.addEventListener('change', applyFilters);
  sortSelect?.addEventListener('change', applyFilters);
}


/* ─────────────────────────────────────────
   11. RENDER ANALYSIS RESULTS (dynamic)
   ───────────────────────────────────────── */
function renderAnalysisResults(analysis) {
  // Dimensions card
  const dimCard = document.getElementById('result-dimensions');
  if (dimCard && analysis.dimensions) {
    const d = analysis.dimensions;
    dimCard.innerHTML = `
      <p><strong>Width:</strong> ${d.width} feet</p>
      <p><strong>Length:</strong> ${d.length} feet</p>
      <p><strong>Height:</strong> ${d.height} feet</p>
      <p><strong>Area:</strong> ${d.area} sq feet</p>
    `;
  }

  // Lighting card
  const lightCard = document.getElementById('result-lighting');
  if (lightCard && analysis.lighting) {
    const l = analysis.lighting;
    lightCard.innerHTML = `
      <p><strong>Quality:</strong> ${l.quality}</p>
      <p><strong>Brightness:</strong> ${l.brightness}/255</p>
      <p class="mt-2 text-secondary">${l.recommendation}</p>
    `;
  }

  // Color palette swatches
  const swatchContainer = document.getElementById('result-palette');
  if (swatchContainer && analysis.palette) {
    swatchContainer.innerHTML = analysis.palette
      .map(color => `
        <div class="color-swatch"
             style="background:${color}"
             title="${color}"
             data-color="${color}">
        </div>
      `).join('');

    // Copy color on click
    swatchContainer.querySelectorAll('.color-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        navigator.clipboard?.writeText(sw.dataset.color)
          .then(() => Flash.show(`Copied ${sw.dataset.color}`, 'success', 2000));
      });
    });
  }

  // Scroll results into view
  const resultsSection = document.getElementById('analysis-results');
  resultsSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


/* ─────────────────────────────────────────
   12. GENERATE DESIGN — loading state
   ───────────────────────────────────────── */
function initGenerateDesign() {
  const form = document.getElementById('design-form');
  const btn  = document.getElementById('btn-generate-design');

  if (!btn) return;

  btn.addEventListener('click', async (e) => {
    if (!form) return;

    btn.classList.add('loading');
    btn.disabled  = true;
    btn.innerHTML = '<span></span> Generating…';

    // If not using AJAX, let the form submit naturally after brief delay
    if (!btn.dataset.ajax) {
      setTimeout(() => form.submit(), 200);
      return;
    }

    e.preventDefault();

    try {
      const formData = new FormData(form);
      const response = await fetch(form.action || '/design', {
        method: 'POST',
        body: formData,
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const data = await response.json();
      if (data.redirect) window.location.href = data.redirect;

    } catch (err) {
      Flash.show('Design generation failed. Please try again.', 'error');
      console.error('[GenerateDesign]', err);
    } finally {
      btn.classList.remove('loading');
      btn.disabled  = false;
      btn.innerHTML = '✏ Generate Design';
    }
  });
}


/* ─────────────────────────────────────────
   13. SAVE TO CATALOG
   ───────────────────────────────────────── */
function initSaveToCatalog() {
  const btn = document.getElementById('btn-save-catalog');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.classList.add('loading');
    btn.disabled = true;

    try {
      const designId = btn.dataset.designId;
      const response = await fetch('/catalog/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ design_id: designId })
      });

      if (!response.ok) throw new Error(`Save failed: ${response.status}`);

      const data = await response.json();
      Flash.show(data.message || 'Design saved to catalog!', 'success');

      btn.textContent = '✓ Saved';
      btn.disabled    = true;

    } catch (err) {
      Flash.show('Could not save design. Please try again.', 'error');
      console.error('[SaveCatalog]', err);
    } finally {
      btn.classList.remove('loading');
      if (btn.textContent !== '✓ Saved') btn.disabled = false;
    }
  });
}


/* ─────────────────────────────────────────
   14. EXPORT PDF
   ───────────────────────────────────────── */
function initExportPDF() {
  const btn = document.getElementById('btn-export-pdf');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.classList.add('loading');
    btn.disabled = true;

    try {
      const designId = btn.dataset.designId;
      const response = await fetch(`/export/pdf?design_id=${designId}`, {
        method: 'GET',
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });

      if (!response.ok) throw new Error(`Export failed: ${response.status}`);

      const blob = await response.blob();
      const url  = URL.createObjectURL(blob);

      // Trigger browser download
      const a = document.createElement('a');
      a.href     = url;
      a.download = `gruha_alankara_design_${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      Flash.show('PDF exported successfully!', 'success');

    } catch (err) {
      Flash.show('PDF export failed. Please try again.', 'error');
      console.error('[ExportPDF]', err);
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  });
}


/* ─────────────────────────────────────────
   15. SHARE DESIGN
   ───────────────────────────────────────── */
function initShare() {
  const btn = document.getElementById('btn-share');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const shareUrl   = btn.dataset.url   || window.location.href;
    const shareTitle = btn.dataset.title || 'My Gruha Alankara Design';

    // Use native Web Share API if available (mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text:  'Check out my interior design created with Gruha Alankara!',
          url:   shareUrl
        });
        return;
      } catch (_) { /* user cancelled or unsupported */ }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(shareUrl);
      Flash.show('Link copied to clipboard!', 'success', 2500);
    } catch (_) {
      Flash.show(`Share this link: ${shareUrl}`, 'info', 6000);
    }
  });
}


/* ─────────────────────────────────────────
   16. DISMISS EXISTING FLASH MESSAGES (Jinja-rendered)
   ───────────────────────────────────────── */
function initFlashDismiss() {
  document.querySelectorAll('.flash-close').forEach(btn => {
    btn.addEventListener('click', () => {
      Flash.dismiss(btn.closest('.flash'));
    });
  });

  // Auto-dismiss after 5s
  document.querySelectorAll('.flash').forEach(toast => {
    setTimeout(() => Flash.dismiss(toast), 5000);
  });
}


/* ─────────────────────────────────────────
   17. INTERSECTION OBSERVER — scroll animations
   ───────────────────────────────────────── */
function initScrollAnimations() {
  const elements = document.querySelectorAll(
    '.card, .analysis-card, .catalog-item, .style-card, .section-header'
  );

  if (!elements.length || !window.IntersectionObserver) return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.animationPlayState = 'running';
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  elements.forEach(el => {
    el.style.animationPlayState = 'paused';
    observer.observe(el);
  });
}


/* ─────────────────────────────────────────
   18. INIT — run everything on DOM ready
   ───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initFlashDismiss();
  initScrollAnimations();
  initProgressBars();
  initBudgetSlider();
  initStyleSelector();
  initDesignStudioTabs();
  initRoomAnalyzer();
  initLiveARCamera();
  initGenerateDesign();
  initSaveToCatalog();
  initExportPDF();
  initShare();
  initCatalogFilters();
});

/* Expose Camera module globally for inline HTML handlers if needed */
window.GruhaCamera = Camera;
window.GruhaFlash  = Flash;