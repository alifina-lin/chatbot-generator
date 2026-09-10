// analytics.js
document.addEventListener('DOMContentLoaded', () => {

  // 1. 搜尋事件：打字停下 800ms 才送，且忽略注音/拼音組字中間態
  //    （compositionstart~compositionend 之間的 input 事件不是使用者「打完的字」，
  //    是 IME 選字前的組字過程，之前沒擋，GA 撈到的一半是這種半成品）。
  //    畫面渲染（render()）完全不受這裡影響，那邊本來就是每個按鍵都跑；
  //    這裡只管「送去 GA4 記錄」這件事的時機。
  const searchInput = document.querySelector('#search');
  let searchTimer;
  let isComposing = false;

  function scheduleSearchLog() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      if (isComposing) return; // 保險：萬一計時器觸發時剛好又進了組字狀態
      const term = searchInput.value.trim();
      if (!term) return;
      gtag('event', 'search', { search_term: term });
    }, 800);
  }

  if (searchInput) {
    searchInput.addEventListener('compositionstart', () => { isComposing = true; });
    searchInput.addEventListener('compositionend', () => {
      isComposing = false;
      scheduleSearchLog(); // 組字剛結束的最終值，當作一次正常輸入來排程
    });
    searchInput.addEventListener('input', () => {
      if (isComposing) return; // 組字中間態，不排程也不送
      scheduleSearchLog();
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
