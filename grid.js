let allRows = [];

function renderGrid(category) {
  const filtered = category === 'all'
    ? allRows
    : allRows.filter(d => d.category === category);

  const sel = d3.select('#grid')
    .selectAll('.swatch')
    .data(filtered, d => d.filename);

  sel.enter()
    .append('div')
    .attr('class', 'swatch')
    .attr('title', d => `${d.filename} — ${d.dominant_hex}`)
    .style('background-color', d => d.dominant_hex)
    .style('cursor', 'pointer')
    .on('click', (event, d) => openViewer(d));

  sel.exit().remove();
}

d3.csv('grid_data.csv').then(rows => {
  console.log('Loaded rows:', rows.length);
  allRows = rows;
  renderGrid('all');
}).catch(err => {
  console.error('Failed to load grid_data.csv', err);
});

document.querySelectorAll('#filters button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#filters button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderGrid(btn.dataset.category);
  });
});

function openViewer(d) {
  closeViewer(); // remove any existing viewer first, just in case

  const overlay = document.createElement('div');
  overlay.id = 'viewer-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    background: 'rgba(0, 0, 0, 0.9)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '1000',
    cursor: 'zoom-out',
  });

  const mediaWrap = document.createElement('div');
  Object.assign(mediaWrap.style, {
    maxWidth: '90vw',
    maxHeight: '85vh',
    cursor: 'default',
  });

  if (d.media_type === 'video') {
    const video = document.createElement('video');
    video.src = d.source_path;
    video.controls = true;
    video.autoplay = true;
    Object.assign(video.style, { maxWidth: '90vw', maxHeight: '85vh' });
    mediaWrap.appendChild(video);
  } else {
    const img = document.createElement('img');
    img.src = d.source_path;
    img.onerror = () => { img.src = d.thumbnail_path; }; // fallback if the browser can't render the original (e.g. HEIC)
    Object.assign(img.style, {
      maxWidth: '90vw',
      maxHeight: '85vh',
      imageOrientation: 'from-image', // respect the original file's EXIF rotation tag
    });
    mediaWrap.appendChild(img);
  }

  const caption = document.createElement('p');
  caption.textContent = `${d.filename} — ${d.category}`;
  Object.assign(caption.style, {
    color: '#fff',
    fontFamily: 'sans-serif',
    fontSize: '13px',
    marginTop: '12px',
  });

  overlay.appendChild(mediaWrap);
  overlay.appendChild(caption);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeViewer();
  });

  document.body.appendChild(overlay);
  document.addEventListener('keydown', escHandler);
}

function escHandler(e) {
  if (e.key === 'Escape') closeViewer();
}

function closeViewer() {
  const existing = document.getElementById('viewer-overlay');
  if (existing) {
    existing.querySelectorAll('video').forEach(v => v.pause());
    existing.remove();
  }
  document.removeEventListener('keydown', escHandler);
}