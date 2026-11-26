// 手绘波浪线：滚动到屏幕里时，从左到右"画"出来一次
(() => {
  const lines = document.querySelectorAll('.wave-rule, .list li');
  const draw = (el) => el.classList.add('is-drawn');
  if (!('IntersectionObserver' in window)) {
    lines.forEach(draw);
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      draw(entry.target);
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  lines.forEach((el) => io.observe(el));
})();
