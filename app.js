// ===== 設定區 =====
// 把下面換成你部署 Code.gs 後拿到的 Web App 網址（結尾是 /exec）
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxFuQEWscNJNyA1qmzs0G967Z2954-6dWtwBn60plrklUqOX8MUIVvG0wGFkoCGVGWJZA/exec';

let allBots = [];
let currentAudience = 'all';
let currentCategory = 'all';
let bm25Index = null; // 語意推薦用的 BM25 倒排索引，載入 bots-index.json 後才會有
let lastSubstringHasResults = true; // render() 每次都更新；決定 renderRecommend() 查無時是隱藏還是顯示引導文字

// 每次 renderRecommend() 都更新這個全域狀態（零延遲、每個按鍵都跑），
// 但實際送 GA4 事件是 analytics.js 用 debounce + IME 組字保護後才讀這裡送出，
// 避免搜尋沒打完（尤其注音/拼音組字中間態）就把半成品 query 記進日誌。
window.__searchState = null;

fetchChatbots();
loadBotsIndex();

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

// 語意推薦是額外一塊，不是主資料流程的一部分：載入失敗只是沒有推薦區塊，
// 子字串篩選（render()）完全不受影響，這是刻意設計的降級路徑。
function loadBotsIndex() {
  fetch('bots-index.json')
    .then(res => res.json())
    .then(data => {
      bm25Index = BM25Search.buildIndex(data);
      renderRecommend(); // 索引可能在使用者已經打完字之後才載完，補跑一次
    })
    .catch(err => {
      console.error('語意推薦索引載入失敗，僅使用子字串篩選：', err);
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

document.getElementById('search').addEventListener('input', () => {
  render();
  renderRecommend(); // 零延遲的 BM25 檢索，不需要 debounce
});

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

  lastSubstringHasResults = filtered.length > 0;

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

// 「確吧頭子的建議」：純靜態 BM25 語意檢索，跟上面的子字串篩選是兩條獨立路徑，
// 子字串篩選永遠先跑、永遠可用；這裡失敗或沒結果都不影響上面的清單。
// 這個函式只管畫面（每個按鍵都跑，零延遲），GA4 事件交給 analytics.js 用 debounce 另外處理。
function renderRecommend() {
  const section = document.getElementById('recommend');
  const grid = document.getElementById('recommendGrid');
  const empty = document.getElementById('recommendEmpty');
  const query = document.getElementById('search').value.trim();

  // 索引還沒載入完成，或輸入還不到 2 字：不顯示這個區塊，不留一半空白的區塊
  if (!bm25Index || query.length < 2) {
    section.style.display = 'none';
    window.__searchState = null;
    return;
  }

  const ranked = BM25Search.search(bm25Index, query);
  const topScore = ranked.length ? ranked[0].normalizedScore : 0;
  const candidates = ranked
    .filter(r => r.normalizedScore >= BM25Search.NO_RESULT_THRESHOLD)
    .slice(0, 3)
    // 前端層再驗證一次 bot_id 存在於目前的 allBots：索引檔跟 GAS 現況之間可能有時間差
    // （例如某支剛下架，索引還沒重生成），寧可少推薦一支也不能推薦到死連結。
    .map(r => ({ ...r, bot: allBots.find(b => String(b.number) === String(r.bot_id)) }))
    .filter(r => r.bot);

  window.__searchState = {
    query,
    hitCount: candidates.length,
    topScore: Number(topScore.toFixed(3)),
    substringHasResults: lastSubstringHasResults,
  };

  if (candidates.length === 0) {
    grid.innerHTML = '';
    // 子字串篩選那條路已經有結果了：這個區塊整個藏起來，不要疊一句「查無」在一份已有結果的畫面上。
    // 只有兩條路都沒東西時，才用這個區塊講清楚「真的沒有」。
    if (lastSubstringHasResults) {
      section.style.display = 'none';
      empty.style.display = 'none';
      return;
    }
    section.style.display = 'block';
    empty.style.display = 'block';
    empty.textContent = '🤖 目前沒有對應的確吧，建議直接洽詢相關單位窗口，或到下方瀏覽全部確吧。';
    return;
  }

  section.style.display = 'block';
  empty.style.display = 'none';
  grid.innerHTML = '';
  candidates.forEach(({ bot }) => grid.appendChild(buildRecommendCard(bot)));
}

function buildRecommendCard(bot) {
  const card = document.createElement('article');
  card.className = 'pod recommend-card';

  card.innerHTML = `
    <div class="platform">${escapeHtml(bot.platform)}</div>
    <div class="pod-title">${escapeHtml(bot.name)}</div>
    <div class="brief">${escapeHtml(bot.brief)}</div>
    <a class="launch recommend-launch${needsGoogleLogin(bot.platform) ? ' has-tooltip' : ''}" ${needsGoogleLogin(bot.platform) ? 'data-tooltip="🔑 可能需登入 Google 帳號才能使用"' : ''} data-bot-id="${escapeAttr(bot.number)}" href="${escapeAttr(bot.url)}" target="_blank">🚀 Launch</a>
  `;

  return card;
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
