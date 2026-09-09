// 純靜態 BM25（bigram token）語意檢索。零網路請求、零金鑰、零延遲。
// 中文沒有空白斷詞：連續中日韓字元切 bigram，連續英數字元當一個 token。
// 例如「投影機」→「投影」／「影機」兩個 bigram；「iHouse」→ 一個 token。
// 這份檔案同時被瀏覽器（<script src="bm25-search.js">，掛在 window.BM25Search）
// 與離線校準腳本（Node 用 import 讀 CommonJS 匯出）共用，避免兩邊邏輯漂移。
(function (global) {
  function isAsciiAlnum(ch) { return /[A-Za-z0-9]/.test(ch); }
  function isIgnorable(ch) {
    return /[\s，。！？、,\.!?;；:：""''「」『』()（）\/\-⚡]/.test(ch);
  }

  function tokenize(text) {
    const tokens = [];
    let ascii = '';
    let cjk = '';
    const flushAscii = () => { if (ascii) { tokens.push(ascii.toLowerCase()); ascii = ''; } };
    const flushCjk = () => {
      if (cjk.length === 1) tokens.push(cjk);
      else if (cjk.length > 1) {
        for (let i = 0; i < cjk.length - 1; i++) tokens.push(cjk.slice(i, i + 2));
      }
      cjk = '';
    };
    for (const ch of String(text || '')) {
      if (isAsciiAlnum(ch)) { flushCjk(); ascii += ch; }
      else if (isIgnorable(ch)) { flushCjk(); flushAscii(); }
      else { flushAscii(); cjk += ch; }
    }
    flushCjk();
    flushAscii();
    return tokens;
  }

  // name 加回來：真實使用者常常直接打 bot 名字（「政大支出小幫手」），
  // 2026-09-09 用 GA4 真實 query 重測過，加了 name 分數會變，門檻也跟著重校過。
  const DEFAULT_FIELDS = ['name', 'questions', 'keywords', 'situations'];

  function buildIndex(bots, fields) {
    fields = fields || DEFAULT_FIELDS;
    const docs = bots.map(bot => {
      const parts = [];
      for (const f of fields) {
        if (f === 'name') parts.push(bot.name);
        else if (Array.isArray(bot[f])) parts.push.apply(parts, bot[f]);
        else if (bot[f]) parts.push(bot[f]);
      }
      return { bot_id: bot.bot_id, tokens: tokenize(parts.join(' ')) };
    });
    const N = docs.length;
    const avgdl = N ? docs.reduce((s, d) => s + d.tokens.length, 0) / N : 0;
    const df = new Map();
    for (const d of docs) {
      for (const t of new Set(d.tokens)) df.set(t, (df.get(t) || 0) + 1);
    }
    return { docs, N, avgdl, df };
  }

  function idf(index, term) {
    const dfN = index.df.get(term) || 0;
    return Math.log((index.N - dfN + 0.5) / (dfN + 0.5) + 1);
  }

  // 回傳依分數由高到低排序的 [{bot_id, score, normalizedScore}, ...]，涵蓋索引裡的全部 bot。
  // score 是原始 BM25 分數（排序、Top-3 選取都用這個，除以常數不影響同一個 query 內的相對順序）。
  //
  // normalizedScore = score / Σ idf(query token)，門檻比較一律用這個。
  // 一開始試過「除以 query token 數」，結果排名最低的正向案例（直接打 bot 全名「政大支出
  // 小幫手」）反而比對不上的「外籍人士工作證」分數還低——因為 bot 名字裡的「政大」「小幫」
  // 「幫手」這類每支 bot 都有的字眼 idf 趨近 0，用「token 數」當分母等於把這些沒有訊息量
  // 的 token 也算進稀釋，公平地對「剛好全名裡有很多菜市場字」的查詢不利。
  // 改成除以 idf 總和之後：低 idf 的通用字在分子分母都趨近 0，不會被拿來稀釋或膨脹；
  // 反過來，「外籍人士工作證」裡「士工」「工作」「作證」這三個在 45 支索引裡完全沒出現過
  // 的 token，idf 依 BM25 公式反而會很高（越沒出現在任何文件裡，idf 越大），但因為 tf=0
  // 對分子（score）貢獻是 0，卻會把分母（idf 總和）撐大，比例自然被拉低——這正是我們要的：
  // 一個查詢裡有好幾個「查無此字」的重要詞，就該被視為不夠match，不是靠運氣沾到一兩個字就過關。
  function search(index, query, opts) {
    opts = opts || {};
    const k1 = opts.k1 != null ? opts.k1 : 1.5;
    const b = opts.b != null ? opts.b : 0.75;
    const qTokens = tokenize(query);
    const qIdf = qTokens.map(qt => idf(index, qt));
    const idfSum = qIdf.reduce((s, w) => s + w, 0);
    const results = index.docs.map(d => {
      const tf = new Map();
      for (const t of d.tokens) tf.set(t, (tf.get(t) || 0) + 1);
      let score = 0;
      qTokens.forEach((qt, i) => {
        const f = tf.get(qt) || 0;
        if (!f) return;
        score += qIdf[i] * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.tokens.length / index.avgdl));
      });
      return { bot_id: d.bot_id, score, normalizedScore: idfSum > 0 ? score / idfSum : 0 };
    });
    results.sort((a, b2) => b2.score - a.score);
    return results;
  }

  // 校準得出，見 data/threshold-calibration.json（2026-09-09 用 GA4 真實 query 重校，
  // 11條真實正向 + 10條負向/無對應bot）。門檻比對的是 normalizedScore
  // （score / Σ idf(query token)），不是原始 score。低於這個分數一律視為「查無」。
  //
  // 正向最低分 1.356（入台證辦理）、負向/無需求最高分 0.974（「政大身心健康中心小幫手」
  // ——查起來完全像個真bot名字，但45支裡沒有這支，是這批測試裡最難擋的一條）。
  // 1.15 落在區間內，兩邊都留了安全邊界。
  const NO_RESULT_THRESHOLD = 1.15;

  const api = { tokenize, buildIndex, search, DEFAULT_FIELDS, NO_RESULT_THRESHOLD };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.BM25Search = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
