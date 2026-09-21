// ===== 設定區 =====
// 把下面換成你部署 Code.gs 後拿到的 Web App 網址（結尾是 /exec）
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxFuQEWscNJNyA1qmzs0G967Z2954-6dWtwBn60plrklUqOX8MUIVvG0wGFkoCGVGWJZA/exec';

// ===== 業務分類收斂表（前端規則，不動 GAS / Sheet / 索引） =====
const CATEGORY_GROUPS = [
  { name: '場地與設備',     values: ['場地借用','場地租借','教室設備','會議展演空間','圖書館場地借用服務','拍攝申請','設備借用','消防安全設備'],
                            keywords: ['場地','教室','空間','借用','租借','設備','拍攝','會議室'] },
  { name: '經費與核銷',     values: ['系所核銷業務','社團核銷','經費報支','財務','主計','核銷','經費動支','所得稅'],
                            keywords: ['核銷','經費','報支','財務','主計','出納','請購','動支','所得稅'] },
  { name: '選課與學程',     values: ['通識教育','選課認抵','雙主修制度','校學士申請','學程申請','微學程','選課操作說明','教育學院學程事務'],
                            keywords: ['選課','學程','通識','雙主修','輔系','抵免','認抵'] },
  { name: '修業與學位',     values: ['論文輔導','學位考試','論文口試','修業問題','考試與畢業流程','博士班系務','入學'],
                            keywords: ['論文','學位','口試','畢業','修業','入學','博士','碩士'] },
  { name: '國際與兩岸',     values: ['校級中國大陸交換甄試','來校大陸交換生指引','兩岸交流','入臺證申辦','兩岸學術交流','學生交換業務','出國交換'],
                            keywords: ['國際','交換','兩岸','大陸','入臺','境外','僑生','外籍'] },
  { name: '學務與校園生活', values: ['學生事務','新生活動','導師制業務','宿舍','新生入住','停車'],
                            keywords: ['宿舍','住宿','社團','學生事務','新生','導師','停車'] },
  { name: '教學與學習支援', values: ['學術寫作','數位教學','教學影片拍攝製作協助','圖書館服務'],
                            keywords: ['教學','寫作','圖書','數位學習','教材'] },
  { name: '資訊服務',       values: ['資訊服務','資訊設備'],
                            keywords: ['資訊','網路','帳號','系統','電算'] },
  { name: '獎助與職涯',     values: ['獎助學金業務','獎勵申請','職涯資源'],
                            keywords: ['獎助','獎學金','獎勵','職涯','就業','實習'] },
];
const OTHER_GROUP = '其他';

let allBots = [];
let currentAudience = 'all';
let currentCategory = 'all';
let hasAutoScrolledToResults = false;

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

function isDebugMode() {
  return new URLSearchParams(location.search).has('debug');
}

// 精確映射優先於關鍵字兜底；都不中歸「其他」
function groupOfRaw(raw) {
  const value = String(raw || '').trim();
  if (!value) return OTHER_GROUP;

  for (const group of CATEGORY_GROUPS) {
    if (group.values.includes(value)) return group.name;
  }
  for (const group of CATEGORY_GROUPS) {
    if (group.keywords.some(kw => value.includes(kw))) return group.name;
  }
  return OTHER_GROUP;
}

function groupsOfBot(bot) {
  return [...new Set(splitText(bot.category).map(groupOfRaw))];
}

function buildCategoryFilters() {
  const box = document.getElementById('categoryFilters');

  const counts = new Map();
  allBots.forEach(bot => {
    groupsOfBot(bot).forEach(group => {
      counts.set(group, (counts.get(group) || 0) + 1);
    });
  });

  if (isDebugMode()) {
    const others = [];
    allBots.forEach(bot => {
      splitText(bot.category).forEach(raw => {
        if (groupOfRaw(raw) === OTHER_GROUP) others.push({ raw, name: bot.name });
      });
    });
    if (others.length) console.log('[確吧宇宙] 落入「其他」分類的原始值：', others);
  }

  const groupNames = CATEGORY_GROUPS.map(g => g.name).concat(OTHER_GROUP);
  const sorted = groupNames
    .filter(name => counts.get(name) > 0)
    .sort((a, b) => {
      if (a === OTHER_GROUP) return 1;
      if (b === OTHER_GROUP) return -1;
      return counts.get(b) - counts.get(a);
    });

  sorted.forEach(name => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.dataset.value = name;
    btn.textContent = `${name} ${counts.get(name)}`;
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

const searchInput = document.getElementById('search');
const floatingSearchInput = document.getElementById('searchFloating');

function syncSearch(value) {
  searchInput.value = value;
  if (floatingSearchInput) floatingSearchInput.value = value;
  render();
}

searchInput.addEventListener('input', () => syncSearch(searchInput.value));
if (floatingSearchInput) {
  floatingSearchInput.addEventListener('input', () => syncSearch(floatingSearchInput.value));
}

const heroSearchWrap = document.querySelector('.search-wrap');
const floatingSearch = document.getElementById('floatingSearch');
if (heroSearchWrap && floatingSearch && 'IntersectionObserver' in window) {
  new IntersectionObserver(([entry]) => {
    floatingSearch.hidden = entry.isIntersecting;
  }, { threshold: 0 }).observe(heroSearchWrap);
}

const floatingBotBtn = document.getElementById('floatingBotBtn');
const floatingBotChat = document.getElementById('floatingBotChat');
const floatingBotClose = document.getElementById('floatingBotClose');
const floatingBotIframe = document.getElementById('floatingBotIframe');

function openFloatingBot() {
  if (floatingBotIframe && !floatingBotIframe.getAttribute('src')) {
    floatingBotIframe.setAttribute('src', floatingBotIframe.dataset.src);
  }
  floatingBotChat.hidden = false;
}

function closeFloatingBot() {
  floatingBotChat.hidden = true;
}

if (floatingBotBtn) {
  floatingBotBtn.addEventListener('click', () => {
    if (floatingBotChat.hidden) openFloatingBot();
    else closeFloatingBot();
  });
}
if (floatingBotClose) {
  floatingBotClose.addEventListener('click', closeFloatingBot);
}

function isFiltering() {
  const keyword = document.getElementById('search').value.trim();
  return keyword !== '' || currentAudience !== 'all' || currentCategory !== 'all';
}

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
      groupsOfBot(bot).includes(currentCategory);

    return matchKeyword && matchAudience && matchCategory;
  });

  const verifiedBots = filtered.filter(bot => isVerified(bot.status));
  const betaBots = filtered.filter(bot => !isVerified(bot.status));

  // 驗證星系（瀏覽態）
  verifiedGrid.innerHTML = '';
  verifiedEmpty.style.display = verifiedBots.length ? 'none' : 'block';
  verifiedCount.textContent = verifiedBots.length ? `· ${verifiedBots.length} 個確吧已升級` : '';
  verifiedBots.forEach(bot => verifiedGrid.appendChild(buildPod(bot)));

  // Beta 星系（瀏覽態）
  grid.innerHTML = '';
  empty.style.display = betaBots.length ? 'none' : 'block';
  betaCount.textContent = betaBots.length ? `· ${betaBots.length} 個確吧` : '';
  betaBots.forEach(bot => grid.appendChild(buildPod(bot)));

  // 篩選態合併結果區
  const filtering = isFiltering();
  document.getElementById('verified').hidden = filtering;
  document.getElementById('beta').hidden = filtering;
  document.getElementById('results').hidden = !filtering;

  if (filtering) {
    const resultsVerifiedGrid = document.getElementById('resultsVerifiedGrid');
    const resultsBetaGrid = document.getElementById('resultsBetaGrid');
    const resultsDivider = document.getElementById('resultsDivider');
    const resultsEmpty = document.getElementById('resultsEmpty');

    resultsVerifiedGrid.innerHTML = '';
    resultsBetaGrid.innerHTML = '';
    verifiedBots.forEach(bot => resultsVerifiedGrid.appendChild(buildPod(bot)));
    betaBots.forEach(bot => resultsBetaGrid.appendChild(buildPod(bot)));

    resultsDivider.hidden = !(verifiedBots.length && betaBots.length);
    resultsEmpty.hidden = (verifiedBots.length + betaBots.length) > 0;
  }

  updateSearchFeedback(filtering, verifiedBots.length, betaBots.length);
  maybeAutoScrollToResults(filtering);
}

function updateSearchFeedback(filtering, verifiedCount, betaCount) {
  const feedback = document.getElementById('searchFeedback');
  const feedbackFloating = document.getElementById('searchFeedbackFloating');
  if (!filtering) {
    feedback.hidden = true;
    feedbackFloating.hidden = true;
    return;
  }
  const total = verifiedCount + betaCount;
  const text = total ? `找到 ${total} 個確吧 · 驗證 ${verifiedCount} / Beta ${betaCount}` : '找到 0 個確吧';
  feedback.textContent = text;
  feedback.hidden = false;
  feedbackFloating.textContent = text;
  feedbackFloating.hidden = false;
}

function maybeAutoScrollToResults(filtering) {
  if (!filtering) {
    hasAutoScrolledToResults = false;
    return;
  }
  if (hasAutoScrolledToResults) return;
  hasAutoScrolledToResults = true;
  const results = document.getElementById('results');
  if (results) results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearFilters() {
  currentAudience = 'all';
  currentCategory = 'all';
  document.querySelectorAll('#audienceFilters .chip').forEach(b => b.classList.toggle('active', b.dataset.value === 'all'));
  document.querySelectorAll('#categoryFilters .chip').forEach(b => b.classList.toggle('active', b.dataset.value === 'all'));
  syncSearch('');
}

const clearFiltersBtn = document.getElementById('clearFiltersBtn');
if (clearFiltersBtn) clearFiltersBtn.addEventListener('click', clearFilters);

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
      ${splitText(bot.category).map(tag).join('')}
    </div>

    <a class="launch${needsGoogleLogin(bot.platform) ? ' has-tooltip' : ''}" ${needsGoogleLogin(bot.platform) ? 'data-tooltip="🔑 可能需登入 Google 帳號才能使用"' : ''} href="${escapeAttr(bot.url)}" target="_blank">🚀 Launch</a>

    <details class="detail">
      <summary>查看詳細資訊</summary>
      <div><strong>可以協助：</strong>${escapeHtml(bot.help || '未填寫')}</div>
      <div><strong>適用情境：</strong>${escapeHtml(bot.scenario || '未填寫')}</div>
      <div><strong>服務對象：</strong>${escapeHtml(bot.audience || '未填寫')}</div>
      <div><strong>🛰 Mission Control：</strong>${escapeHtml(bot.unit || '未填寫')}</div>
      <div><strong>🧑‍🚀 Crew：</strong>${escapeHtml(bot.crew || '未填寫')}</div>
      ${bot.number ? `<div class="mission-link-row"><a class="mission-link" href="bots/${escapeAttr(bot.number)}.html">📡 任務詳情</a></div>` : ''}
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
  clearFilters();
  const verified = document.getElementById('verified');
  if (!verified) return;
  verified.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function scrollToBeta() {
  clearFilters();
  const beta = document.getElementById('beta');
  if (!beta) return;
  beta.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const navLinksByTarget = {};
document.querySelectorAll('nav a[data-nav-target]').forEach(a => {
  const key = a.dataset.navTarget;
  (navLinksByTarget[key] ||= []).push(a);
});

function setActiveNavSection(key) {
  document.querySelectorAll('nav a[data-nav-target]').forEach(a => a.classList.remove('active'));
  (navLinksByTarget[key] || []).forEach(a => a.classList.add('active'));
}

if ('IntersectionObserver' in window) {
  const navSectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) setActiveNavSection(entry.target.id);
    });
  }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

  ['home', 'verified', 'beta', 'about'].forEach(id => {
    const el = document.getElementById(id);
    if (el) navSectionObserver.observe(el);
  });
}
