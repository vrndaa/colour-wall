let allRows = [];
let selectedCategories = new Set(); // empty set = "all"
let selectedFilename = null;

// A reusable SVG grain filter, injected once. Any element, SVG shape or
// plain HTML div, can pick it up with filter: url(#grain-filter).
(function injectGrainFilter() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'grain-filter-defs';
  Object.assign(svg.style, { position: 'absolute', width: '0', height: '0' });
  svg.innerHTML = `
    <filter id="grain-filter" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" result="noise"/>
      <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.15 0" result="grain"/>
      <feComposite in="grain" in2="SourceGraphic" operator="over"/>
    </filter>
  `;
  document.body.appendChild(svg);
})();

function getFilteredRows() {
  return selectedCategories.size === 0
    ? allRows
    : allRows.filter(d => selectedCategories.has(d.category));
}

// Marks whichever swatch matches selectedFilename, in any grid currently
// on the page. Instead of drawing a border, it empties the tile's color
// out to blank -- that color has effectively "moved" to become the
// zigzag border's fill instead (see updateSplitLeft).
function syncSelectedTile() {
  document.querySelectorAll('.swatch').forEach(el => {
    el.classList.toggle('selected', el.dataset.filename === selectedFilename);
  });
}

// Deterministic pseudo-random generator seeded from a string, so a given
// photo's scattered hues land in the same spots every time it's opened
// instead of jumping around on re-render.
function seededRandom(seedStr) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = (h << 5) - h + seedStr.charCodeAt(i);
    h |= 0;
  }
  let s = (h % 2147483647 + 2147483647) % 2147483647 || 1;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Pulls this row's N_CLUSTERS colors (color1_hex/weight ... color6_hex/weight)
// out into a plain array, skipping any that are missing.
function getClusterColors(d) {
  const colors = [];
  for (let i = 1; i <= 6; i++) {
    const hex = d[`color${i}_hex`];
    if (!hex) continue;
    colors.push({ hex, weight: parseFloat(d[`color${i}_weight`]) || 0 });
  }
  return colors;
}

d3.csv('grid_data.csv').then(rows => {
  console.log('Loaded rows:', rows.length);
  allRows = rows;
  renderCover(rows);
  renderIntroScatter(rows);
}).catch(err => {
  console.error('Could not load grid_data.csv', err);
});

// ---- Intro page scatter ----

// Renders the pixel-dissolve field on the intro page's right side, using
// every real extracted cluster color across all photos (not just one
// photo's palette, like the split-left scatter does). Squares are denser
// and slightly larger near the top, thinning out toward the bottom.
function renderIntroScatter(rows) {
  const container = document.getElementById('intro-right');
  if (!container) return;
  container.innerHTML = '';

  const palette = [];
  rows.forEach(d => {
    for (let i = 1; i <= 6; i++) {
      const hex = d[`color${i}_hex`];
      if (hex) palette.push(hex);
    }
  });
  if (palette.length === 0) return;

  const rand = seededRandom('intro-scatter');
  const count = 140;

  for (let i = 0; i < count; i++) {
    // Squaring a 0-1 random value skews results toward 0, so most tiles
    // land near the top and the field tapers off going down.
    const t = Math.pow(rand(), 2.2);
    const size = 8 + rand() * 46;

    const tile = document.createElement('div');
    tile.className = 'intro-scatter-tile';
    Object.assign(tile.style, {
      width: size + 'px',
      height: size + 'px',
      left: (rand() * 92) + '%',
      top: (t * 92) + '%',
      backgroundColor: palette[Math.floor(rand() * palette.length)],
    });
    container.appendChild(tile);
  }
}

const CATEGORIES = ['all', 'sky', 'mountain', 'water', 'forest'];

function buildFilterBar() {
  const bar = document.createElement('div');
  bar.className = 'filters-bar';

  CATEGORIES.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.category = cat;
    btn.textContent = cat;
    btn.addEventListener('click', () => toggleCategory(cat));
    bar.appendChild(btn);
  });

  return bar;
}

function toggleCategory(category) {
  if (category === 'all') {
    selectedCategories.clear();
  } else if (selectedCategories.has(category)) {
    selectedCategories.delete(category);
  } else {
    selectedCategories.add(category);
  }

  syncFilterButtons();
  if (document.getElementById('split-view')) {
    renderSplitGrid();
  }
}

function syncFilterButtons() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    const cat = btn.dataset.category;
    const isActive = cat === 'all'
      ? selectedCategories.size === 0
      : selectedCategories.has(cat);
    btn.classList.toggle('active', isActive);
  });
}

// ---- Split view ----

// Opens the split view with nothing selected yet -- just the fully-colored
// grid on the right. Used by the intro page's "explore" button, so people
// land on the grid itself and pick a photo rather than being dropped into
// one automatically.
function openSplitBlank() {
  if (!document.getElementById('split-view')) {
    buildSplitView();
  }
  renderSplitGrid();
}

function buildSplitView() {
  const overlay = document.createElement('div');
  overlay.id = 'split-view';
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    background: '#fff',
    zIndex: '1000',
    display: 'flex',
    flexDirection: 'row',
  });

  const left = document.createElement('div');
  left.id = 'split-left';
  Object.assign(left.style, {
    flexBasis: '50%',
    flexGrow: '0',
    flexShrink: '0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px',
    boxSizing: 'border-box',
    overflow: 'visible',
    position: 'relative',
  });

  // Grainy color layer, sitting behind everything else in this panel.
  // It's a separate element (not a background-color + filter on `left`
  // itself) specifically so the grain filter doesn't also distort the
  // photo and text sitting on top of it.
  const bgLayer = document.createElement('div');
  bgLayer.id = 'split-left-bg';
  Object.assign(bgLayer.style, {
    position: 'absolute',
    inset: '0',
    filter: 'url(#grain-filter)',
  });
  left.appendChild(bgLayer);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'close';
  Object.assign(closeBtn.style, {
    position: 'absolute',
    top: '16px',
    left: '16px',
    padding: '6px 12px',
    border: '1px solid #ccc',
    background: '#fff',
    cursor: 'pointer',
  });
  closeBtn.addEventListener('click', closeSplit);
  left.appendChild(closeBtn);

  const divider = document.createElement('div');
  divider.id = 'split-divider';
  Object.assign(divider.style, {
    flexBasis: '6px',
    flexGrow: '0',
    flexShrink: '0',
    background: '#ddd',
    cursor: 'col-resize',
  });
  divider.addEventListener('mousedown', startDrag);

  const right = document.createElement('div');
  right.id = 'split-right';
  Object.assign(right.style, {
    flex: '1',
    overflowY: 'auto',
    padding: '16px',
    boxSizing: 'border-box',
  });

  right.appendChild(buildFilterBar());

  const gridContainer = document.createElement('div');
  gridContainer.id = 'split-grid-container';
  right.appendChild(gridContainer);

  overlay.appendChild(left);
  overlay.appendChild(divider);
  overlay.appendChild(right);
  document.body.appendChild(overlay);

  syncFilterButtons();
  document.addEventListener('keydown', splitEscHandler);
}

function startDrag(e) {
  e.preventDefault();
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
}

function onDrag(e) {
  const overlay = document.getElementById('split-view');
  if (!overlay) return;
  const rect = overlay.getBoundingClientRect();
  let pct = ((e.clientX - rect.left) / rect.width) * 100;
  pct = Math.max(20, Math.min(80, pct));
  document.getElementById('split-left').style.flexBasis = pct + '%';
}

function stopDrag() {
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
}

function titleFromFilename(filename) {
  return filename.replace(/\.[^/.]+$/, '');
}

// Picks black or white text depending on how light or dark a background
// color is, so titles stay readable no matter which photo is open.
function getContrastTextColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#111' : '#fff';
}

// Splits a title like "Chennai, India" into ["Chennai", "India"] at the
// comma. Falls back to splitting on the first space if there's no comma,
// and if there's neither, the whole thing goes in the first piece.
function splitTitle(filename) {
  const full = titleFromFilename(filename);
  const commaIndex = full.indexOf(',');
  if (commaIndex !== -1) {
    return [full.slice(0, commaIndex).trim(), full.slice(commaIndex + 1).trim()];
  }
  const spaceIndex = full.indexOf(' ');
  if (spaceIndex !== -1) {
    return [full.slice(0, spaceIndex).trim(), full.slice(spaceIndex + 1).trim()];
  }
  return [full, ''];
}

// Fills a container (meant to be the full left panel) with a continuous,
// gapless grid of small cells, each colored with a real average color
// sampled from the photo -- cropped and scaled the way CSS
// background-size:cover would, so the color layout echoes the photo
// stretched across the whole panel rather than squeezed into its own
// aspect ratio. Colors are painted at partial opacity so the grid reads
// as a soft, continuous color field rather than a mosaic of the photo.
function renderPhotoColorField(imgSrc, naturalWidth, naturalHeight, panelWidth, panelHeight, container) {
  const cellSize = 20;
  const cols = Math.max(1, Math.round(panelWidth / cellSize));
  const rows = Math.max(1, Math.round(panelHeight / cellSize));

  const sampleImg = new Image();
  sampleImg.onload = () => {
    const srcAspect = naturalWidth / naturalHeight;
    const dstAspect = panelWidth / panelHeight;
    let sx, sy, sw, sh;
    if (srcAspect > dstAspect) {
      sh = naturalHeight;
      sw = sh * dstAspect;
      sx = (naturalWidth - sw) / 2;
      sy = 0;
    } else {
      sw = naturalWidth;
      sh = sw / dstAspect;
      sx = 0;
      sy = (naturalHeight - sh) / 2;
    }

    const canvas = document.createElement('canvas');
    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sampleImg, sx, sy, sw, sh, 0, 0, cols, rows);

    const grid = document.createElement('div');
    grid.className = 'split-color-field';
    Object.assign(grid.style, {
      width: '100%',
      height: '100%',
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gridTemplateRows: `repeat(${rows}, 1fr)`,
    });

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = document.createElement('div');
        const px = ctx.getImageData(c, r, 1, 1).data;
        cell.style.backgroundColor = `rgba(${px[0]}, ${px[1]}, ${px[2]}, 0.45)`;
        grid.appendChild(cell);
      }
    }

    container.appendChild(grid);
  };
  sampleImg.src = imgSrc;
}

function updateSplitLeft(d) {
  selectedFilename = d.filename;

  const left = document.getElementById('split-left');
  const bgLayer = document.getElementById('split-left-bg');
  if (bgLayer) {
    bgLayer.innerHTML = '';
    bgLayer.style.backgroundColor = '#fff';
  }
  const textColor = getContrastTextColor('#ffffff');

  left.querySelectorAll('.split-title, .split-media, .split-description').forEach(el => el.remove());

  const [titlePart1, titlePart2] = splitTitle(d.filename);

  const titleWrap = document.createElement('div');
  titleWrap.className = 'split-title';
  Object.assign(titleWrap.style, {
    position: 'absolute',
    top: '16px',
    right: '16px',
    textAlign: 'right',
    color: textColor,
  });

  const titleLine1 = document.createElement('div');
  titleLine1.textContent = titlePart1;
  Object.assign(titleLine1.style, {
    fontFamily: "'Ithaca', sans-serif",
    fontSize: '38px',
    fontWeight: '400',
    lineHeight: '1.15',
    whiteSpace: 'nowrap',
  });

  const titleLine2 = document.createElement('div');
  titleLine2.textContent = titlePart2;
  Object.assign(titleLine2.style, {
    fontFamily: "'Ithaca', sans-serif",
    fontSize: '22px',
    fontWeight: '400',
    lineHeight: '1.15',
    whiteSpace: 'nowrap',
  });

  titleWrap.appendChild(titleLine1);
  titleWrap.appendChild(titleLine2);

  const mediaWrap = document.createElement('div');
  mediaWrap.className = 'split-media';
  Object.assign(mediaWrap.style, { maxWidth: '100%', maxHeight: '65%', position: 'relative' });

  if (d.media_type === 'video') {
    const video = document.createElement('video');
    video.src = d.source_path;
    video.controls = true;
    video.autoplay = true;
    Object.assign(video.style, { maxWidth: '100%', maxHeight: '100%' });
    mediaWrap.appendChild(video);
  } else {
    const img = document.createElement('img');
    img.src = d.source_path;
    img.onerror = () => { img.src = d.thumbnail_path; };
    Object.assign(img.style, {
      maxWidth: '100%',
      maxHeight: '100%',
      imageOrientation: 'from-image',
    });
    mediaWrap.appendChild(img);

    // Sample the same photo into the full-panel color field behind it.
    // Uses the panel's own size (not the photo's displayed size), since
    // the field is meant to cover the whole background continuously.
    const probe = new Image();
    const buildField = () => {
      if (bgLayer) {
        renderPhotoColorField(probe.src, probe.naturalWidth, probe.naturalHeight, left.clientWidth, left.clientHeight, bgLayer);
      }
    };
    probe.onload = buildField;
    probe.onerror = () => {
      probe.onload = buildField;
      probe.src = d.thumbnail_path;
    };
    probe.src = d.source_path;
  }

  mediaWrap.appendChild(titleWrap);
  left.appendChild(mediaWrap);

  if (d.description && d.description.trim() !== '') {
    const description = document.createElement('p');
    description.className = 'split-description';
    description.textContent = d.description;
    Object.assign(description.style, {
      fontSize: '14px',
      color: textColor,
      marginTop: '16px',
      maxWidth: '440px',
      textAlign: 'center',
      lineHeight: '1.5',
    });
    left.appendChild(description);
  }

  syncSelectedTile();
}

function renderSplitGrid() {
  const gridContainer = document.getElementById('split-grid-container');
  if (!gridContainer) return;
  gridContainer.innerHTML = '';

  const filtered = getFilteredRows();

  const container = document.createElement('div');
  container.className = 'split-grid';

  filtered.forEach(d => {
    const tile = document.createElement('div');
    tile.className = 'swatch';
    tile.dataset.filename = d.filename;
    tile.title = `${d.filename} — ${d.dominant_hex}`;
    tile.style.cursor = 'pointer';
    tile.addEventListener('click', () => updateSplitLeft(d));

    const fill = document.createElement('div');
    fill.className = 'swatch-fill';
    fill.style.backgroundColor = d.dominant_hex;

    tile.appendChild(fill);
    container.appendChild(tile);
  });

  gridContainer.appendChild(container);
  syncSelectedTile();
}

function closeSplit() {
  const overlay = document.getElementById('split-view');
  if (overlay) {
    overlay.querySelectorAll('video').forEach(v => v.pause());
    overlay.remove();
  }
  document.removeEventListener('keydown', splitEscHandler);
}

function splitEscHandler(e) {
  if (e.key === 'Escape') closeSplit();
}