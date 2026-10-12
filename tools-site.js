(function () {
  'use strict';
  const toggle = document.getElementById('navtoggle'), links = document.getElementById('navlinks');
  const close = () => { links.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Open menu'); };
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    links.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && links.classList.contains('open')) { close(); toggle.focus(); } });
  }
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
  const resourceList = document.getElementById('resource-list');
  if (!resourceList) return;
  fetch('resources.json').then(r => { if (!r.ok) throw new Error('Resources unavailable'); return r.json(); }).then(manifest => {
    if (!Array.isArray(manifest.items) || !manifest.items.length) return;
    const fragment = document.createDocumentFragment();
    manifest.items.forEach(item => {
      // Downloads are same-site files; metadata is inserted as text, never HTML.
      if (typeof item.file !== 'string' || !/^downloads\/[a-zA-Z0-9_/-]+\.pdf$/.test(item.file) || item.file.split('/').includes('..')) return;
      const card = document.createElement('article'); card.className = 'tool-card';
      const badge = document.createElement('span'); badge.className = 'eyebrow'; badge.textContent = item.category || 'Free guide';
      const title = document.createElement('h2'); title.textContent = item.title || 'Property guide';
      const description = document.createElement('p'); description.textContent = item.description || '';
      const link = document.createElement('a'); link.href = item.file; link.download = ''; link.className = 'btn btn--primary'; link.textContent = 'Download free PDF';
      card.append(badge, title, description, link); fragment.append(card);
    });
    if (fragment.childElementCount) {
      document.getElementById('resources-empty').hidden = true;
      resourceList.append(fragment);
    }
  }).catch(() => { document.getElementById('resources-empty').querySelector('p').textContent = 'Our free resources are being prepared. Please check back soon.'; });
})();
