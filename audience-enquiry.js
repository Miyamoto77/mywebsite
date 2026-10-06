(function () {
  'use strict';
  var toggle = document.getElementById('navtoggle');
  var links = document.getElementById('navlinks');
  toggle.addEventListener('click', function () {
    toggle.setAttribute('aria-expanded', String(links.classList.toggle('open')));
  });
  links.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () {
      links.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
  document.getElementById('year').textContent = new Date().getFullYear();
  var form = document.getElementById('audienceform');
  var button = document.getElementById('submit');
  var message = document.getElementById('formmsg');
  var pending = false;
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (pending || !form.checkValidity()) { form.reportValidity(); return; }
    pending = true;
    button.disabled = true;
    button.textContent = 'Sending…';
    message.classList.remove('show', 'error');
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 20000);
    try {
      var response = await fetch(form.action, {method: 'POST', body: new FormData(form), signal: controller.signal});
      var result = await response.json();
      if (!response.ok || result.success !== true) throw new Error('Submission rejected');
      message.textContent = form.dataset.success;
      message.classList.add('show');
      button.textContent = 'Enquiry sent ✓';
      form.reset();
    } catch (error) {
      message.textContent = 'Your enquiry could not be confirmed. Please try again or email admin@kestrelsourcing.co.uk.';
      message.classList.add('show', 'error');
      button.disabled = false;
      button.textContent = 'Send my enquiry';
    } finally {
      clearTimeout(timer);
      pending = false;
    }
  });
})();
