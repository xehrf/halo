// Плавная прокрутка для якорных ссылок уже через scroll-behavior: smooth в CSS
// Здесь можно добавить: фильтры каталога, корзину, форму обратной связи и т.д.

document.addEventListener('DOMContentLoaded', function () {
  console.log('Сайт ювелирного магазина загружен.');

  const productImages = document.querySelectorAll('.product-image');

  productImages.forEach((wrapper) => {
    wrapper.addEventListener('click', () => {
      const detail = wrapper.dataset.detail;
      if (detail) {
        window.location.href = detail;
        return;
      }
      const img = wrapper.querySelector('img');
      const src = img ? img.src : null;
      const alt = img ? img.alt : '';
      openLightbox(src, alt);
    });
  });

  // Галерея и зум на странице товара
  const gallery = document.querySelector('.product-detail-gallery');
  if (gallery) {
    const zoomImage = gallery.querySelector('.zoom-image');
    const thumbs = gallery.querySelectorAll('.thumb');

    thumbs.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!zoomImage) return;

        // Берём путь либо из data-image, либо прямо из миниатюры
        const thumbImg = btn.querySelector('img');
        const imgSrc = btn.dataset.image || (thumbImg && thumbImg.src);
        if (!imgSrc) return;

        zoomImage.src = imgSrc;
        // сбрасываем зум при переключении фото
        zoomImage.classList.remove('is-zoomed');
        zoomImage.style.transformOrigin = '50% 50%';

        thumbs.forEach((t) => t.classList.remove('is-active'));
        btn.classList.add('is-active');
      });
    });

    if (zoomImage) {
      let isZoomed = false;

      zoomImage.addEventListener('mouseenter', () => {
        isZoomed = true;
        zoomImage.classList.add('is-zoomed');
      });

      zoomImage.addEventListener('mouseleave', () => {
        isZoomed = false;
        zoomImage.classList.remove('is-zoomed');
      });

      zoomImage.addEventListener('mousemove', (e) => {
        if (!isZoomed) return;
        const rect = zoomImage.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        zoomImage.style.transformOrigin = `${x}% ${y}%`;
      });

      // Дополнительно: клик включает/выключает режим зума
      zoomImage.addEventListener('click', () => {
        isZoomed = !isZoomed;
        zoomImage.classList.toggle('is-zoomed', isZoomed);
      });
    }
  }
});

function openLightbox(imgSrc, imgAlt) {
  if (!imgSrc) return;

  const backdrop = document.createElement('div');
  backdrop.className = 'lightbox-backdrop';

  const content = document.createElement('div');
  content.className = 'lightbox-content';

  const closeBtn = document.createElement('div');
  closeBtn.className = 'lightbox-close';
  closeBtn.textContent = '×';

  closeBtn.addEventListener('click', () => document.body.removeChild(backdrop));
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      document.body.removeChild(backdrop);
    }
  });

  const bigImg = document.createElement('img');
  bigImg.className = 'lightbox-main-image';
  bigImg.src = imgSrc;
  bigImg.alt = imgAlt || '';
  content.appendChild(bigImg);

  content.appendChild(closeBtn);
  backdrop.appendChild(content);
  document.body.appendChild(backdrop);
}

// ── Эффект исчезновения фоновой картинки при скролле ──
const heroBg = document.getElementById('heroBg');
const header = document.querySelector('.header');

if (heroBg && header) {
  window.addEventListener('scroll', () => {
    const opacity = 1 - (window.scrollY / (header.offsetHeight * 0.3));
    heroBg.style.opacity = Math.max(0, Math.min(1, opacity));
  }, { passive: true });
}
