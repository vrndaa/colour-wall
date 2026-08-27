// Called once the CSV has actually loaded (see the d3.csv().then() in
// grid.js) -- cover.js itself has no data of its own anymore.
function renderCover(rows) {
  const cover = document.getElementById('cover');
  const palette = rows.map(d => d.dominant_hex);

  const cellSize = 40; // target px -- actual cells stretch slightly to
                        // fill the viewport exactly, no partial row/column
  const cols = Math.ceil(window.innerWidth / cellSize);
  const rowCount = Math.ceil(window.innerHeight / cellSize);

  const grid = document.createElement('div');
  grid.id = 'cover-grid';
  Object.assign(grid.style, {
    position: 'absolute',
    inset: '0',
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gridTemplateRows: `repeat(${rowCount}, 1fr)`,
  });

  // 2D lookup so mousemove can find the right cell with simple math,
  // instead of hit-testing the DOM on every event.
  const cellGrid = [];
  for (let r = 0; r < rowCount; r++) {
    const rowArr = [];
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement('div');
      cell.className = 'cover-cell';
      grid.appendChild(cell);
      rowArr.push(cell);
    }
    cellGrid.push(rowArr);
  }

  // Goes in behind the title box, which is already sitting in #cover
  // with a higher z-index.
  cover.insertBefore(grid, cover.firstChild);

  const cellWidthPx = window.innerWidth / cols;
  const cellHeightPx = window.innerHeight / rowCount;

  cover.addEventListener('mousemove', (e) => {
    const col = Math.floor(e.clientX / cellWidthPx);
    const row = Math.floor(e.clientY / cellHeightPx);
    if (row < 0 || row >= rowCount || col < 0 || col >= cols) return;

    const cell = cellGrid[row][col];
    if (cell && !cell.dataset.filled) {
      cell.style.backgroundColor = palette[Math.floor(Math.random() * palette.length)];
      cell.dataset.filled = 'true';
    }
  });
}