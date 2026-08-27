const coverPage = document.getElementById('cover');

coverPage.addEventListener('click', () => {
  coverPage.classList.toggle('turned');
});

const introPage = document.getElementById('intro');
const exploreBtn = document.getElementById('explore-btn');

if (exploreBtn && introPage) {
  exploreBtn.addEventListener('click', (e) => {
    // Stop the click from bubbling in case a future page-level handler
    // gets added to #intro -- explore should only ever be triggered by
    // the button itself, not a click anywhere on the page.
    e.stopPropagation();

    // Open the split view straight away. The intro page is left exactly
    // as it is underneath (no more flip-away -- there's no gallery page
    // behind it anymore), so closing the split view lands back on intro
    // automatically, with no extra bookkeeping needed.
    if (typeof openSplitBlank === 'function') {
      openSplitBlank();
    }
  });
}