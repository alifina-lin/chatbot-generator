// 部署時只需要改這個檔
window.QUEBA_CONFIG = {
  // Cloudflare Worker 網址（wrangler deploy 後會印出），不含結尾斜線
  WORKER_URL: 'https://queba-web-proxy.alifina.workers.dev',
  // 額度用完或服務異常時，引導使用者去的備援入口（Copilot 版網址）。留空則不顯示
  COPILOT_URL: 'https://alifina-lin.github.io/chatbot-generator/',
  // 單一附件文字量上限（字元），超過會截斷並提醒
  MAX_ATTACH_CHARS: 30000,
  // 單一檔案大小上限（MB）
  MAX_FILE_MB: 5,
};
