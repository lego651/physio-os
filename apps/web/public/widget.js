/* apps/web/public/widget.js — V-Health chatbot widget loader */
(function () {
  var script = document.currentScript;
  var clinicId = script && script.getAttribute('data-clinic-id');
  if (!clinicId) { console.error('[physio-widget] data-clinic-id is required'); return; }
  var host = script && script.getAttribute('data-host') || 'https://YOUR-VERCEL-DOMAIN.vercel.app';

  var btn = document.createElement('button');
  btn.setAttribute('aria-label', 'Open chat');
  btn.style.cssText = 'position:fixed;right:16px;bottom:16px;width:56px;height:56px;border-radius:50%;background:#2563eb;color:#fff;border:0;font-size:28px;cursor:pointer;z-index:2147483647;box-shadow:0 4px 12px rgba(0,0,0,.2)';
  btn.textContent = '💬';
  document.body.appendChild(btn);

  var iframe;
  btn.addEventListener('click', function () {
    if (iframe) { iframe.style.display = iframe.style.display === 'none' ? 'block' : 'none'; return; }
    iframe = document.createElement('iframe');
    iframe.src = host + '/widget/' + encodeURIComponent(clinicId);
    iframe.style.cssText = 'position:fixed;right:16px;bottom:84px;width:380px;height:560px;border:0;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.25);z-index:2147483647;background:#fff';
    iframe.title = 'Chat with clinic';
    iframe.allow = 'clipboard-write';
    document.body.appendChild(iframe);
  });
})();
