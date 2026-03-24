// ─── Broker Popup Script ──────────────────────────────────────────────────────

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function render(statusMap) {
  const list  = document.getElementById('list');
  const empty = document.getElementById('empty');
  const count = document.getElementById('count');
  const footer = document.getElementById('footer');
  const dot   = document.getElementById('dot');

  const entries = Object.entries(statusMap || {});
  count.textContent = `${entries.length} รายการ`;

  if (entries.length === 0) {
    empty.style.display = 'block';
    footer.style.display = 'none';
    dot.style.background = '#16a34a';
    dot.style.boxShadow  = '0 0 6px #16a34a';
    return;
  }

  empty.style.display = 'none';
  footer.style.display = 'flex';

  // Sort newest first
  entries.sort((a, b) => new Date(b[1].at) - new Date(a[1].at));

  // Check if any pending
  const anyPending = entries.some(([, v]) => v.status === 'pending');
  if (anyPending) {
    dot.style.background = '#f59e0b';
    dot.style.boxShadow  = '0 0 6px #f59e0b';
  } else {
    dot.style.background = '#16a34a';
    dot.style.boxShadow  = '0 0 6px #16a34a';
  }

  // Build HTML
  list.innerHTML = entries.map(([sessionId, v]) => {
    const badgeClass = `badge badge-${v.status}`;
    const label = v.status === 'pending' ? '⏳ กำลังส่ง' : v.status === 'done' ? '✓ สำเร็จ' : '✗ ล้มเหลว';
    const errHtml = v.error ? `<span style="color:#ef4444;font-size:9px;display:block;margin-top:2px">${v.error.substring(0, 60)}</span>` : '';
    return `<div class="entry">
      <span class="${badgeClass}">${label}</span>
      <span class="session-id" title="${sessionId}">${sessionId}</span>
      <span class="at">${formatTime(v.at)}</span>
      ${errHtml ? `</div><div style="padding:0 0 6px 0;border-bottom:1px solid #1e1e1e">${errHtml}` : ''}
    </div>`;
  }).join('');
}

// Load status from background
chrome.runtime.sendMessage({ type: 'LC_GET_STATUS' }, (response) => {
  render(response || {});
});

// Clear button
document.getElementById('clearBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'LC_CLEAR_STATUS' }, () => {
    render({});
  });
});
