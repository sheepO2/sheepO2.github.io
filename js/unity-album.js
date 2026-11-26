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

      if (direction < 0) {
        lock = true;
        // Animate the earlier page independently of its hidden `is-before`
        // state, so it visibly lifts from the stack and covers the current
        // page instead of jumping straight to the final position.
        var coverAnimation = pages[target].animate([
          {
            transform: 'translate3d(-70%, -10%, 58px) rotate(-8deg) scale(1.03)',
            opacity: 1,
            filter: 'none',
            boxShadow: '0 28px 48px rgba(32, 42, 52, 0.2)'
          },
          {
            transform: 'translate3d(0, 0, 8px) rotate(0deg) scale(1)',
            opacity: 1,
            filter: 'none',
            boxShadow: '0 18px 34px rgba(32, 42, 52, 0.18)'
          }
        ], {
          duration: 620,
          easing: 'cubic-bezier(0.18, 0.78, 0.2, 1)',
          fill: 'both'
        });
        pages[target].style.zIndex = '38';

        window.setTimeout(function () {
          coverAnimation.cancel();
          current = target;
          pages.forEach(function (page) {
            page.style.removeProperty('z-index');
          });
          render();
        }, 620);

        window.setTimeout(function () {
          lock = false;
        }, 820);
        return;
      }

      lock = true;
      pages[current].classList.add('is-extracting-next');
      pages[target].classList.add('is-entering-next');
      album.classList.add('is-extract-next');

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
