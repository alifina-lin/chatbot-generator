// ===== 設定區 =====
// 把下面換成你部署 Code.gs 後拿到的 Web App 網址（結尾是 /exec）
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbyYEHXDmUmvmqPPXPwdfH4L2BIwXn_yDkOdQEIy53D4kdqFwjpwL0JyzqeSkp_RSOWgNQ/exec';

let allBots = [];
let currentAudience = 'all';
let currentCategory = 'all';

fetchChatbots();

function fetchChatbots() {
  fetch(`${GAS_API_URL}?action=data`)
    .then(res => res.json())
    .then(payload => {
      if (!payload.ok) throw new Error(payload.error || '讀取資料失敗');
      init(payload.data || []);
    })
    .catch(err => {
      const empty = document.getElementById('empty');
      empty.style.display = 'block';
      empty.textContent = '讀取資料失敗：' + err.message;
    });
}

function init(data) {
  allBots = data || [];
  buildCategoryFilters();
  render();
}

function buildCategoryFilters() {
  const box = document.getElementById('categoryFilters');
  const categories = [...new Set(
    allBots
      .flatMap(bot => splitText(bot.category))
      .filter(Boolean)
  )];

  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.dataset.value = cat;
    btn.textContent = cat;
    box.appendChild(btn);
  });

  box.addEventListener('click', e => {
    if (!e.target.classList.contains('chip')) return;
    box.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentCategory = e.target.dataset.value;
    render();
  });
}

document.getElementById('audienceFilters').addEventListener('click', e => {
  if (!e.target.classList.contains('chip')) return;
  document.querySelectorAll('#audienceFilters .chip').forEach(b => b.classList.remove('active'));
  e.target.classList.add('active');
  currentAudience = e.target.dataset.value;
  render();
});

document.getElementById('search').addEventListener('input', render);

function render() {
  const keyword = document.getElementById('search').value.trim().toLowerCase();
  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty');

  const filtered = allBots.filter(bot => {
    const text = [
      bot.name,
      bot.brief,
      bot.help,
      bot.scenario,
      bot.unit,
      bot.category,
      bot.audience,
      bot.platform
    ].join(' ').toLowerCase();

    const matchKeyword = !keyword || text.includes(keyword);

    const matchAudience =
      currentAudience === 'all' ||
      splitText(bot.audience).some(a => a.includes(currentAudience) || currentAudience.includes(a));

    const matchCategory =
      currentCategory === 'all' ||
      splitText(bot.category).some(c => c.includes(currentCategory) || currentCategory.includes(c));

    return matchKeyword && matchAudience && matchCategory;
  });

  grid.innerHTML = '';
  empty.style.display = filtered.length ? 'none' : 'block';

  filtered.forEach(bot => {
    const pod = document.createElement('article');
    pod.className = 'pod' + (isVerified(bot.status) ? ' verified' : '');

    pod.innerHTML = `
      <div class="platform">${escapeHtml(bot.platform)}</div>
      <div class="pod-title">${escapeHtml(bot.name)}</div>
      <div class="brief">${escapeHtml(bot.brief)}</div>

      <div class="tags">
        ${tag(bot.unit)}
        ${splitText(bot.audience).map(tag).join('')}
      </div>

      <a class="launch" href="${escapeAttr(bot.url)}" target="_blank">🚀 Launch</a>

      <details class="detail">
        <summary>查看詳細資訊</summary>
        <div><strong>可以協助：</strong>${escapeHtml(bot.help || '未填寫')}</div>
        <div><strong>適用情境：</strong>${escapeHtml(bot.scenario || '未填寫')}</div>
        <div><strong>🛰 Mission Control：</strong>${escapeHtml(bot.unit || '未填寫')}</div>
        <div><strong>🧑‍🚀 Crew：</strong>${escapeHtml(bot.crew || '未填寫')}</div>
      </details>
    `;

    grid.appendChild(pod);
  });
}

function splitText(value) {
  if (!value) return [];
  return String(value)
    .split(/[,，、;；、\n]/)
    .map(v => v.trim())
    .filter(Boolean);
}

function tag(text) {
  if (!text) return '';
  return `<span class="tag">${escapeHtml(text)}</span>`;
}

function isVerified(status) {
  return String(status || '').toLowerCase().includes('verified') ||
         String(status || '').includes('驗證');
}

function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(text) {
  return escapeHtml(text);
}

function scrollToAbout() {
  const about = document.getElementById('about');
  if (!about) return;
  about.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
