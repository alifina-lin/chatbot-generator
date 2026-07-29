// ===== 設定區 =====
// 把下面換成你部署 Code.gs 後拿到的 Web App 網址（結尾是 /exec）
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxFuQEWscNJNyA1qmzs0G967Z2954-6dWtwBn60plrklUqOX8MUIVvG0wGFkoCGVGWJZA/exec';

let allBots = [];
let currentAudience = 'all';
let currentCategory = 'all';

fetchChatbots();

function fetchChatbots() {
  showSkeleton();

  fetch(`${GAS_API_URL}?action=data`)
    .then(res => res.json())
    .then(payload => {
      if (!payload.ok) throw new Error(payload.error || '讀取資料失敗');
      init(payload.data || []);
    })
    .catch(err => {
      const grid = document.getElementById('grid');
      const empty = document.getElementById('empty');
      const verifiedGrid = document.getElementById('verifiedGrid');
      const verifiedEmpty = document.getElementById('verifiedEmpty');
      grid.innerHTML = '';
      verifiedGrid.innerHTML = '';
      empty.style.display = 'block';
      empty.textContent = '讀取資料失敗：' + err.message;
      verifiedEmpty.style.display = 'block';
      verifiedEmpty.textContent = '讀取資料失敗：' + err.message;
    });
}

// 資料還在載入時，先顯示骨架卡片，避免畫面空白造成「沒有確吧」的錯覺
function showSkeleton(count = 6) {
  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty');
  const verifiedGrid = document.getElementById('verifiedGrid');
  const verifiedEmpty = document.getElementById('verifiedEmpty');
  empty.style.display = 'none';
  verifiedEmpty.style.display = 'none';

  const skeletonHtml = Array.from({ length: count }).map(() => `
    <article class="pod skeleton" aria-hidden="true">
      <div class="skeleton-badge"></div>
      <div class="skeleton-line skeleton-title"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line short"></div>
      <div class="skeleton-tags">
        <span class="skeleton-tag"></span>
        <span class="skeleton-tag"></span>
      </div>
      <div class="skeleton-btn"></div>
    </article>
  `).join('');

  grid.innerHTML = skeletonHtml;
  verifiedGrid.innerHTML = '';
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
  const verifiedGrid = document.getElementById('verifiedGrid');
  const verifiedEmpty = document.getElementById('verifiedEmpty');
  const verifiedCount = document.getElementById('verifiedCount');
  const betaCount = document.getElementById('betaCount');

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

  const verifiedBots = filtered.filter(bot => isVerified(bot.status));
  const betaBots = filtered.filter(bot => !isVerified(bot.status));

  // 驗證星系
  verifiedGrid.innerHTML = '';
  verifiedEmpty.style.display = verifiedBots.length ? 'none' : 'block';
  verifiedCount.textContent = verifiedBots.length ? `· ${verifiedBots.length} 個確吧已升級` : '';
  verifiedBots.forEach(bot => verifiedGrid.appendChild(buildPod(bot)));

  // Beta 星系
  grid.innerHTML = '';
  empty.style.display = betaBots.length ? 'none' : 'block';
  betaCount.textContent = betaBots.length ? `· ${betaBots.length} 個確吧` : '';
  betaBots.forEach(bot => grid.appendChild(buildPod(bot)));
}

function buildPod(bot) {
  const pod = document.createElement('article');
  pod.className = 'pod' + (isVerified(bot.status) ? ' verified' : '');
  const numberLabel = formatNumber(bot.number);

  pod.innerHTML = `
    ${numberLabel ? `<div class="pod-number">No.${numberLabel}</div>` : ''}
    ${isVerified(bot.status) ? '<div class="verified-badge">✅ 已驗證</div>' : ''}
    <div class="platform">${escapeHtml(bot.platform)}</div>
    <div class="pod-title">${escapeHtml(bot.name)}</div>
    <div class="brief">${escapeHtml(bot.brief)}</div>

    <div class="tags">
      ${tag(bot.unit)}
      ${splitText(bot.audience).map(tag).join('')}
    </div>

    <a class="launch${needsGoogleLogin(bot.platform) ? ' has-tooltip' : ''}" ${needsGoogleLogin(bot.platform) ? 'data-tooltip="🔑 可能需登入 Google 帳號才能使用"' : ''} href="${escapeAttr(bot.url)}" target="_blank">🚀 Launch</a>

    <details class="detail">
      <summary>查看詳細資訊</summary>
      <div><strong>可以協助：</strong>${escapeHtml(bot.help || '未填寫')}</div>
      <div><strong>適用情境：</strong>${escapeHtml(bot.scenario || '未填寫')}</div>
      <div><strong>🛰 Mission Control：</strong>${escapeHtml(bot.unit || '未填寫')}</div>
      <div><strong>🧑‍🚀 Crew：</strong>${escapeHtml(bot.crew || '未填寫')}</div>
    </details>

    ${bot.updatedAt ? `<div class="updated-line">${escapeHtml(bot.updatedAt)} updated</div>` : ''}
  `;

  return pod;
}

function formatNumber(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  const n = Number(s);
  return Number.isFinite(n) ? String(n).padStart(2, '0') : s;
}

function needsGoogleLogin(platform) {
  const p = String(platform || '').toLowerCase();
  return p.includes('gemini') || p.includes('gem');
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

function scrollToVerified() {
  const verified = document.getElementById('verified');
  if (!verified) return;
  verified.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function scrollToBeta() {
  const beta = document.getElementById('beta');
  if (!beta) return;
  beta.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
