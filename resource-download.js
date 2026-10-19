(function () {
  'use strict';
  const form = document.getElementById('resource-signup');
  const button = document.getElementById('resource-submit');
  const message = document.getElementById('resource-response');
  const notice = document.getElementById('resource-notice');
  const id = new URLSearchParams(location.search).get('resource') || '';
  let resource = null, pending = false, requestId = '', signature = '';
  const validId = value => /^[a-z0-9][a-z0-9-]{0,79}$/.test(value || '');
  const published = item => item && item.status === 'published' && typeof item.file === 'string'
    && /^downloads\/[A-Za-z0-9_/-]+\.pdf$/.test(item.file) && !item.file.split('/').includes('..');
  if (validId(id)) {
    fetch('resources.json', {cache:'no-store'}).then(r => {if (!r.ok) throw new Error('Unavailable'); return r.json();}).then(data => {
      const matches = Array.isArray(data.items) ? data.items.filter(item => item.id === id) : [];
      if (matches.length !== 1) throw new Error('Resource not found');
      const item = matches[0];
      if (!published(item) && item.status !== 'coming-soon') throw new Error('Unavailable');
      document.getElementById('resource-title').textContent = item.title || 'Your free resource';
      document.getElementById('resource-category').textContent = item.category || 'Free resource';
      document.getElementById('resource-description').textContent = published(item)
        ? 'Enter your details below and we’ll email you the download link.'
        : 'Coming soon. Preview the signup form below while this resource is being prepared.';
      if (published(item)) {
        resource = item; notice.hidden = true; button.disabled = false; button.textContent = 'Email my free resource';
      } else {
        notice.textContent = 'This is a placeholder. Requests will open when the resource is published; this preview does not send your details.';
      }
    }).catch(() => {notice.textContent = 'This resource is not currently available. Please return to Resources to choose another.';});
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || !resource || !form.reportValidity()) return;
    const fields = new FormData(form);
    const values = {triggerEvent:'RESOURCE_REQUEST',formMarker:'KS-RESOURCE-v1',resourceId:resource.id,
      firstName:String(fields.get('firstName') || '').trim(),surname:String(fields.get('surname') || '').trim(),
      email:String(fields.get('email') || '').trim().toLowerCase()};
    const emailPattern = /^[A-Za-z0-9.!#$%&'*+/=?^_{}|~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
    if (!values.firstName || !values.surname || !emailPattern.test(values.email)) {
      message.textContent = 'Please enter your first name, surname and a valid email address.'; return;
    }
    const nextSignature = JSON.stringify(values);
    if (!requestId || signature !== nextSignature) {
      requestId = 'RESOURCE-' + crypto.randomUUID().replace(/-/g,''); signature = nextSignature;
    }
    pending = true; button.disabled = true; button.textContent = 'Requesting…'; message.textContent = '';
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(),20000);
    try {
      const response = await fetch('https://hook.eu2.make.com/9pzl7mmay9bxzym5c1oyrdo2pb65kdjf',
        {method:'POST',body:new URLSearchParams(Object.assign({},values,{requestId})),signal:controller.signal});
      const result = (await response.text()).trim();
      if (!response.ok || !['OK','Accepted'].includes(result)) throw new Error('Not confirmed');
      form.hidden = true; message.textContent = 'Thank you — your request has been received. Your resource will be emailed to the address you entered. Please check your inbox and spam folder.';
    } catch(error) {
      button.disabled = false; button.textContent = 'Email my free resource';
      message.textContent = 'We could not confirm your request. Please try again or email admin@kestrelsourcing.co.uk.';
    } finally {clearTimeout(timer); pending = false;}
  });
})();