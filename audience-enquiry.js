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
  button.disabled = false;
  var pending = false;
  var enquiry = null;
  var signature = '';
  var webhook = 'https://hook.eu2.make.com/9pzl7mmay9bxzym5c1oyrdo2pb65kdjf';
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (pending || !form.checkValidity()) { form.reportValidity(); return; }
    var fields = new FormData(form);
    if (fields.get('botcheck')) return;
    var audience = String(fields.get('audience') || '');
    if (audience !== 'agent-broker-introducer' && audience !== 'owner-vendor') {
      message.textContent = 'Please email your enquiry to admin@kestrelsourcing.co.uk.';
      message.classList.add('show', 'error');
      return;
    }
    var values = {
      triggerEvent: audience === 'owner-vendor' ? 'OWNER_ENQUIRY' : 'PARTNER_ENQUIRY',
      formMarker: 'KS-AUDIENCE-v1',
      name: String(fields.get('name') || '').trim(),
      email: String(fields.get('email') || '').trim().toLowerCase(),
      phone: String(fields.get('phone') || '').trim(),
      investmentType: String(fields.get('role') || '').trim(),
      additionalRequirements: String(fields.get('opportunity_outline') || '').trim(),
      consent: fields.get('consent') ? 'yes' : 'no',
      sourceUrl: window.location.href.split('#')[0]
    };
    var emailPattern = /^[A-Za-z0-9.!#$%&'*+/=?^_{}|~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
    if (!values.name || !values.additionalRequirements || !emailPattern.test(values.email)) {
      message.textContent = 'Please enter your name, a valid email address and a short enquiry outline.';
      message.classList.add('show', 'error');
      return;
    }
    // Keep the same identifier on a network retry of the same enquiry.
    var nextSignature = JSON.stringify(values);
    if (!enquiry || signature !== nextSignature) {
      var random = window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
      enquiry = Object.assign({}, values, {
        leadId: 'WEB-' + (audience === 'owner-vendor' ? 'OWNER' : 'PARTNER') + '-' + random,
        submittedAt: new Date().toISOString()
      });
      signature = nextSignature;
    }
    pending = true;
    button.disabled = true;
    button.textContent = 'Sending…';
    message.classList.remove('show', 'error');
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 20000);
    try {
      var response = await fetch(webhook, {method: 'POST', body: new URLSearchParams(enquiry), signal: controller.signal});
      var result = await response.text();
      if (!response.ok || result.trim() !== 'OK') throw new Error('Submission rejected');
      message.textContent = form.dataset.success;
      message.classList.add('show');
      button.textContent = 'Enquiry sent ✓';
      form.reset();
      enquiry = null;
      signature = '';
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
