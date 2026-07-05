// analytics.js
document.addEventListener('DOMContentLoaded', () => {

  // 1. 搜尋事件（打字停下 600ms 才送，避免每敲一個字就送一次）
  const searchInput = document.querySelector('#search');
  let searchTimer;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      const term = e.target.value.trim();
      searchTimer = setTimeout(() => {
        if (term) {
          gtag('event', 'search', { search_term: term });
        }
      }, 600);
    });
  }

  // 2. 人員分類 / 業務分類 chip 點擊（用事件代理抓）
  document.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) {
      const group = chip.closest('.filter-group');
      const groupLabel = group?.querySelector('.filter-title')?.textContent?.trim() || '未知分類';
      // 服務對象 => 人員分類, 業務分類 => 業務分類
      gtag('event', 'filter_click', {
        filter_group: groupLabel,      // "服務對象" 或 "業務分類"
        filter_value: chip.textContent.trim()  // "學生" / "資訊服務" 等
      });
    }

    // 3. Launch 點擊，每個卡片各記一筆
    const launchBtn = e.target.closest('a.launch');
    if (launchBtn) {
      const card = launchBtn.closest('article.pod');
      const chatbotName = card?.querySelector('.pod-title')?.textContent?.trim() || '未知';
      gtag('event', 'launch_click', {
        chatbot_name: chatbotName,
        destination_url: launchBtn.href
      });
    }
  });

});
