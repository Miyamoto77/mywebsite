(function () {
  'use strict';

  var WEBHOOK_URL = 'https://hook.eu2.make.com/9pzl7mmay9bxzym5c1oyrdo2pb65kdjf';
  var FORM_MARKER = 'KS-WEB-v1';

  var form = document.getElementById('leadform');
  var submitButton = document.getElementById('submit');
  if (!form || !submitButton) return;

  var pendingLead = null;
  var sent = false;

  function makeLeadId() {
    var stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    var random = Math.random().toString(36).slice(2, 7).toUpperCase();
    return 'WEB-' + stamp + '-' + random;
  }

  // Capture the values before the existing Web3Forms handler resets the form.
  form.addEventListener('submit', function () {
    var data = new FormData(form);
    pendingLead = {
      triggerEvent: 'WEBSITE_ENQUIRY',
      formMarker: FORM_MARKER,
      leadId: makeLeadId(),
      name: String(data.get('name') || '').trim(),
      phone: String(data.get('phone') || '').trim(),
      email: String(data.get('email') || '').trim(),
      budget: String(data.get('budget') || '').trim(),
      investorStatus: String(data.get('investor-status') || '').trim(),
      consent: data.get('consent') ? 'yes' : 'no',
      sourceUrl: window.location.href,
      submittedAt: new Date().toISOString()
    };
    sent = false;
  }, true);

  // The existing form handler changes the button text only after Web3Forms
  // returns success. At that point, send the same lead to Make/Airtable.
  var observer = new MutationObserver(function () {
    if (!pendingLead || sent) return;
    if (submitButton.textContent.indexOf('Details sent') === -1) return;

    sent = true;
    var body = new URLSearchParams(pendingLead);

    fetch(WEBHOOK_URL, {
      method: 'POST',
      body: body,
      keepalive: true,
      mode: 'no-cors'
    }).catch(function () {
      // Web3Forms remains the source of the visitor-facing success state.
      // Make failures are handled operationally rather than exposing internals.
    });

    pendingLead = null;
  });

  observer.observe(submitButton, {
    childList: true,
    subtree: true,
    characterData: true
  });
})();
