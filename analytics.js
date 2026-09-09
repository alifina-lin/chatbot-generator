// analytics.js
document.addEventListener('DOMContentLoaded', () => {

  // 1. 搜尋相關事件：打字停下 800ms 才送，且忽略注音/拼音組字中間態
  //    （compositionstart~compositionend 之間的 input 事件不是使用者「打完的字」，
  //    是 IME 選字前的組字過程，之前沒擋，GA 撈到的一半是這種半成品）。
  //    畫面渲染（render()/renderRecommend()）完全不受這裡影響，那邊本來就是每個按鍵都跑、零延遲；
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

      // §6 的四個事件之二三四，讀 app.js 每個按鍵都在更新的 window.__searchState，
      // 但只在這裡（settle 之後）才真的送出，避免中間態污染。
      const state = window.__searchState;
      if (!state || state.query !== term) return; // 狀態跟目前 settle 的字串對不上就不送，寧可漏送不要送錯

      gtag('event', 'search_query', {
        query: state.query,
        hit_count: state.hitCount,
        top_score: state.topScore,
      });

      if (state.hitCount > 0) {
        gtag('event', 'recommend_shown', { query: state.query, count: state.hitCount });
      } else if (!state.substringHasResults) {
        // 只有子字串篩選也沒東西時才算「真的查無」，跟畫面上的顯示邏輯一致
        gtag('event', 'recommend_no_result', { query: state.query });
      }
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

    // 4. 「確吧頭子的建議」卡片被點擊（跟上面 launch_click 是疊加關係，不是取代）
    const recommendBtn = e.target.closest('a.recommend-launch');
    if (recommendBtn) {
      const card = recommendBtn.closest('.recommend-card');
      const chatbotName = card?.querySelector('.pod-title')?.textContent?.trim() || '未知';
      gtag('event', 'recommend_click', {
        bot_id: recommendBtn.dataset.botId,
        chatbot_name: chatbotName,
        destination_url: recommendBtn.href
      });
    }
  });

});
