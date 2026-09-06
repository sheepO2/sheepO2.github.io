(function () {
  function setupAlbum(album) {
    var pages = Array.prototype.slice.call(album.querySelectorAll('[data-album-page]'));
    var prev = album.querySelector('[data-album-prev]');
    var next = album.querySelector('[data-album-next]');
    var current = 0;
    var lock = false;

    function render() {
      pages.forEach(function (page, index) {
        var distance = Math.abs(index - current);

        page.classList.toggle('is-before', index < current);
        page.classList.toggle('is-current', index === current);
        page.classList.toggle('is-after', index > current);
        page.setAttribute('aria-hidden', index === current ? 'false' : 'true');
        page.style.setProperty('--distance', distance);
        page.style.setProperty('--stack-shift', Math.min(distance, 5));
        page.style.setProperty('--stack-scale', Math.max(0.88, 1 - distance * 0.025));
      });

      if (prev) {
        prev.disabled = current === 0;
      }

      if (next) {
        next.disabled = current === pages.length - 1;
      }
    }

    function turn(direction) {
      if (lock) {
        return;
      }

      var target = current + direction;
      if (target < 0 || target >= pages.length) {
        return;
      }

      lock = true;
      pages[current].classList.add(direction > 0 ? 'is-extracting-next' : 'is-extracting-prev');
      pages[target].classList.add(direction > 0 ? 'is-entering-next' : 'is-entering-prev');
      album.classList.add(direction > 0 ? 'is-extract-next' : 'is-extract-prev');

      window.setTimeout(function () {
        current = target;
        album.classList.remove('is-extract-next', 'is-extract-prev');
        pages.forEach(function (page) {
          page.classList.remove('is-extracting-next', 'is-extracting-prev', 'is-entering-next', 'is-entering-prev');
        });
        render();
      }, 520);

      window.setTimeout(function () {
        lock = false;
      }, 820);
    }

    if (prev) {
      prev.addEventListener('click', function () {
        turn(-1);
      });
    }

    if (next) {
      next.addEventListener('click', function () {
        turn(1);
      });
    }

    render();
  }

  document.addEventListener('DOMContentLoaded', function () {
    Array.prototype.forEach.call(document.querySelectorAll('[data-unity-album]'), setupAlbum);
  });
})();