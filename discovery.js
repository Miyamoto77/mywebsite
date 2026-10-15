(function () {
  'use strict';
  const form = document.getElementById('discovery-form');
  const button = document.getElementById('discovery-submit');
  const message = document.getElementById('discovery-message');
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  if (!/^[a-f0-9]{32,48}$/.test(token)) return;
  form.hidden = false;
  message.textContent = '';
  let pending = false;
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (pending || !form.reportValidity()) return;
    const data = new FormData(form);
    const body = new URLSearchParams({triggerEvent:'DISCOVERY_RESPONSE',formMarker:'KS-DISCOVERY-v1',discoveryToken:token});
    let anyAnswer = false;
    for (let i = 1; i <= 8; i++) {
      const value = String(data.get('q' + i) || '').trim();
      body.set('q' + i, value);
      if (value) anyAnswer = true;
    }
    if (!anyAnswer) { message.textContent = 'Please answer at least one question before sending.'; return; }
    pending = true; button.disabled = true; button.textContent = 'Sending…';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch('https://hook.eu2.make.com/9pzl7mmay9bxzym5c1oyrdo2pb65kdjf', {method:'POST',body,signal:controller.signal});
      const acknowledgement = (await response.text()).trim();
      if (!response.ok || !['OK','Accepted'].includes(acknowledgement)) throw new Error('Not accepted');
      message.textContent = 'Your answers have been received for processing. We will review them and contact you about your consultation. If you need to add anything, please reply to your invitation email.';
      form.hidden = true;
    } catch (error) {
      message.textContent = 'We could not confirm receipt. Your answers are still here. Please try again or reply to your invitation email.';
      button.disabled = false; button.textContent = 'Send my answers';
    } finally { clearTimeout(timer); pending = false; }
  });
})();