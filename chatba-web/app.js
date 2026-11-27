(() => {
  'use strict';
  const CFG = window.QUEBA_CONFIG || {};
  const WORKER = String(CFG.WORKER_URL || '').replace(/\/$/, '');
  const $ = (s) => document.querySelector(s);

  const el = {
    gate: $('#gate'), gateForm: $('#gate-form'), gateInput: $('#gate-input'), gateErr: $('#gate-err'), gateBtn: $('#gate-btn'),
    app: $('#app'), chat: $('#chat'), welcome: $('#welcome'), input: $('#input'), send: $('#send'), stop: $('#stop'),
    attachBtn: $('#attach-btn'), file: $('#file'), attachList: $('#attach-list'),
    quick: $('#quick'), copyFinal: $('#copy-final'), error: $('#error'),
    progress: $('#progress'), progressLabel: $('#progress-label'), progressFill: $('#progress-fill'),
    newChat: $('#new-chat'), lenHint: $('#len-hint'),
    startUpload: $('#start-upload'), startGo: $('#start-go'),
  };

  const state = {
    pass: '', messages: [], busy: false, ctrl: null, attach: [],
    limits: { maxChars: 60000, maxMessages: 40 }, confirmNew: false,
  };

  /* ---------- 儲存（可能不可用，全部包 try/catch） ---------- */
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
    del(k) { try { sessionStorage.removeItem(k); } catch {} },
  };
  const persist = () => store.set('queba_msgs', JSON.stringify(state.messages));

  /* ---------- 小工具 ---------- */
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const totalChars = (extra = 0) => state.messages.reduce((n, m) => n + m.content.length, extra);
  const loadScript = (src) => new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src));
    document.head.appendChild(s);
  });

  /* ---------- 極簡 Markdown ---------- */
  function inline(s) {
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return s;
  }
  const isHr = (l) => /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l);
  const isUl = (l) => /^\s*[-*•]\s+/.test(l);
  const isOl = (l) => /^\s*\d+[.)]\s+/.test(l);
  const isQuote = (l) => /^\s*&gt;/.test(l);
  const isHead = (l) => /^#{1,4}\s+/.test(l);
  const isTableSep = (l) => !!l && /^\s*\|?[\s:-]+(\|[\s:-]+)+\|?\s*$/.test(l) && l.includes('-');
  const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => inline(c.trim()));

  function blocks(text) {
    const lines = esc(text).split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) { i++; continue; }
      let m;
      if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { const n = m[1].length + 2; out.push(`<h${n}>${inline(m[2])}</h${n}>`); i++; continue; }
      if (isHr(l)) { out.push('<hr>'); i++; continue; }
      if (isQuote(l)) {
        const buf = [];
        while (i < lines.length && isQuote(lines[i])) { buf.push(inline(lines[i].replace(/^\s*&gt;\s?/, ''))); i++; }
        out.push(`<blockquote>${buf.join('<br>')}</blockquote>`); continue;
      }
      if (isUl(l)) {
        const buf = [];
        while (i < lines.length && isUl(lines[i])) { buf.push(`<li>${inline(lines[i].replace(/^\s*[-*•]\s+/, ''))}</li>`); i++; }
        out.push(`<ul>${buf.join('')}</ul>`); continue;
      }
      if (isOl(l)) {
        const buf = [];
        while (i < lines.length && isOl(lines[i])) { buf.push(`<li>${inline(lines[i].replace(/^\s*\d+[.)]\s+/, ''))}</li>`); i++; }
        out.push(`<ol>${buf.join('')}</ol>`); continue;
      }
      if (isTableRow(l) && isTableSep(lines[i + 1])) {
        const head = cells(l); i += 2;
        const rows = [];
        while (i < lines.length && isTableRow(lines[i])) { rows.push(cells(lines[i])); i++; }
        out.push('<table><thead><tr>' + head.map((c) => `<th>${c}</th>`).join('') + '</tr></thead><tbody>'
          + rows.map((r) => '<tr>' + r.map((c) => `<td>${c}</td>`).join('') + '</tr>').join('') + '</tbody></table>');
        continue;
      }
      const buf = [];
      while (i < lines.length && lines[i].trim() && !isHead(lines[i]) && !isHr(lines[i]) && !isUl(lines[i])
        && !isOl(lines[i]) && !isQuote(lines[i]) && !(isTableRow(lines[i]) && isTableSep(lines[i + 1]))) {
        buf.push(inline(lines[i])); i++;
      }
      out.push(`<p>${buf.join('<br>')}</p>`);
    }
    return out.join('');
  }

  function renderMd(src) {
    return src.split(/(```[\s\S]*?(?:```|$))/g).map((p) => {
      if (p.startsWith('```')) {
        const m = p.match(/^```([^\n]*)\n?([\s\S]*?)(?:```)?$/);
        const lang = (m && m[1] || '').trim();
        const code = (m && m[2] || '').replace(/\n$/, '');
        return `<div class="code"><div class="code-bar"><span>${esc(lang) || '文字'}</span><button type="button" data-copy>複製</button></div><pre><code>${esc(code)}</code></pre></div>`;
      }
      return blocks(p);
    }).join('');
  }

  /* ---------- 畫面 ---------- */
  function msgNode(m) {
    const d = document.createElement('div');
    d.className = 'msg ' + m.role;
    if (m.role === 'user') {
      d.textContent = m.display !== undefined ? m.display : m.content;
      (m.files || []).forEach((f) => { const c = document.createElement('span'); c.className = 'chip'; c.textContent = '📎 ' + f; d.appendChild(document.createElement('br')); d.appendChild(c); });
    } else {
      d.innerHTML = renderMd(m.content);
    }
    return d;
  }

  function renderAll() {
    [...el.chat.querySelectorAll('.msg')].forEach((n) => n.remove());
    el.welcome.hidden = state.messages.length > 0;
    state.messages.forEach((m) => el.chat.appendChild(msgNode(m)));
    updateChrome();
    scrollDown();
  }

  const scrollDown = () => { el.chat.scrollTop = el.chat.scrollHeight; };

  function lastAssistant() {
    const m = state.messages[state.messages.length - 1];
    return m && m.role === 'assistant' ? m : null;
  }

  function largestCode(text) {
    let best = '';
    const re = /```[^\n]*\n([\s\S]*?)```/g; let m;
    while ((m = re.exec(text))) if (m[1].length > best.length) best = m[1].replace(/\n$/, '');
    return best;
  }

  function updateChrome() {
    // 進度條：取最後一則帶有「📍 進度 n／m」的助理訊息
    let prog = null;
    for (let i = state.messages.length - 1; i >= 0 && !prog; i--) {
      const m = state.messages[i];
      if (m.role !== 'assistant') continue;
      const all = [...m.content.matchAll(/📍\s*進度\s*(\d+)\s*[／/]\s*(\d+)/g)];
      if (all.length) prog = all[all.length - 1];
    }
    if (prog) {
      const n = +prog[1], t = +prog[2] || 1;
      el.progress.hidden = false;
      el.progressLabel.textContent = `進度 ${n}／${t}`;
      el.progressFill.style.width = Math.min(100, Math.round((n / t) * 100)) + '%';
    } else el.progress.hidden = true;

    // 快速回覆
    const la = lastAssistant();
    // 最終輸出：有長 code block，或很長且在談系統 prompt（有的模型不用 code block）
    const isFinal = !!la && (largestCode(la.content).length >= 800 || (la.content.length > 1500 && /系統\s*(Prompt|提示)/i.test(la.content)));
    el.quick.hidden = !(la && !state.busy);
    // 最終輸出後，「對／請繼續」沒有意義，還可能誘使模型多做沒被要求的產出，所以隱藏
    el.quick.querySelectorAll('button[data-send], button[data-fill]').forEach((b) => { b.hidden = isFinal; });
    el.copyFinal.hidden = !isFinal;

    // 對話長度提示
    const used = totalChars() / state.limits.maxChars;
    const turns = state.messages.length / state.limits.maxMessages;
    const r = Math.max(used, turns);
    el.lenHint.hidden = r < 0.8;
    if (r >= 0.8) el.lenHint.textContent = '對話接近長度上限';
    el.newChat.textContent = state.confirmNew ? '再按一次確認' : '新對話';
  }

  function setBusy(b) {
    state.busy = b;
    el.send.hidden = b; el.stop.hidden = !b;
    el.input.disabled = false;
    el.quick.hidden = b || el.quick.hidden;
  }

  /* ---------- 錯誤 ---------- */
  function showError(e) {
    const code = e && e.code;
    const http = e && e.http;
    let msg = '發生問題，請稍後再試。';
    let retry = true;
    let alt = false;
    if (http === 401 || code === 'passcode') { backToGate('通行碼已失效，請重新輸入。'); return; }
    if (code === 'quota') { msg = '今天的額度已用完，明天（台北時間 00:00 後）會恢復。'; retry = false; alt = true; }
    else if (code === 'rate' || http === 429) msg = '操作太頻繁，請等一分鐘再試。';
    else if (code === 'too_long' || http === 413) { msg = '這段對話太長了。請按「新對話」重新開始，或減少附件的字數。'; retry = false; }
    else if (code === 'empty') msg = '這次沒有收到回覆，請重試。';
    else if (['cap_not_set', 'prompt_missing', 'upstream_auth', 'upstream_credits', 'server', 'origin'].includes(code)) { msg = `服務暫時無法使用（${code}）。`; retry = false; alt = true; }
    else if (code === 'upstream' || code === 'upstream_stream' || (http && http >= 500)) { msg = 'AI 服務暫時連不上，請稍後重試。'; alt = true; }
    else if (e instanceof TypeError) { msg = '連不上伺服器，請檢查網路後重試。'; }

    el.error.innerHTML = '';
    const span = document.createElement('span'); span.textContent = msg; el.error.appendChild(span);
    if (retry) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = '重試';
      b.onclick = () => { clearError(); streamReply(); };
      el.error.appendChild(b);
    }
    if (alt && CFG.COPILOT_URL) {
      const a = document.createElement('a'); a.href = CFG.COPILOT_URL; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = '改用 Copilot 版';
      el.error.appendChild(a);
    }
    el.error.hidden = false;
  }
  const clearError = () => { el.error.hidden = true; el.error.innerHTML = ''; };

  /* ---------- 串流 ---------- */
  let renderQueued = false;
  function scheduleRender(node, text) {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      node.innerHTML = renderMd(text);
      node.classList.add('cursor');
      scrollDown();
    });
  }

  async function streamReply() {
    setBusy(true); clearError(); el.quick.hidden = true;
    const node = document.createElement('div');
    node.className = 'msg assistant cursor';
    node.textContent = '…';
    el.chat.appendChild(node); scrollDown();
    let acc = '';
    state.ctrl = new AbortController();
    try {
      const res = await fetch(WORKER + '/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Passcode': state.pass },
        body: JSON.stringify({ messages: state.messages.map((m) => ({ role: m.role, content: m.content })) }),
        signal: state.ctrl.signal,
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw { http: res.status, code: j.error }; }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const line = chunk.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          let o; try { o = JSON.parse(line.slice(5)); } catch { continue; }
          if (o.t) { acc += o.t; scheduleRender(node, acc); }
          else if (o.error) throw { http: 200, code: o.error };
        }
      }
      if (!acc.trim()) throw { code: 'empty' };
      state.messages.push({ role: 'assistant', content: acc });
      persist();
    } catch (e) {
      if (e && e.name === 'AbortError') {
        if (acc.trim()) { state.messages.push({ role: 'assistant', content: acc + '\n\n（已中止）' }); persist(); }
      } else showError(e);
    } finally {
      state.ctrl = null; setBusy(false); renderAll();
    }
  }

  /* ---------- 送出 ---------- */
  async function send(text) {
    if (state.busy) return;
    text = (text || '').trim();
    if (!text && !state.attach.length) return;
    if (!text) text = '請讀這份資料。';
    let content = text;
    if (state.attach.length) {
      content += '\n\n' + state.attach.map((a) => `【附件：${a.name}】\n${a.text}\n【附件結束】`).join('\n\n');
    }
    if (totalChars(content.length) > state.limits.maxChars || state.messages.length + 1 > state.limits.maxMessages) {
      showError({ code: 'too_long' }); return;
    }
    const files = state.attach.map((a) => a.name);
    const last = state.messages[state.messages.length - 1];
    if (last && last.role === 'user') {
      last.content += '\n\n' + content;
      last.display = (last.display || '') + '\n\n' + text;
      last.files = [...(last.files || []), ...files];
    } else state.messages.push({ role: 'user', content, display: text, files });
    state.attach = []; renderAttach();
    el.input.value = ''; autosize();
    clearError(); persist(); renderAll();
    await streamReply();
  }

  /* ---------- 附件 ---------- */
  function renderAttach() {
    el.attachList.innerHTML = '';
    state.attach.forEach((a, i) => {
      const c = document.createElement('span'); c.className = 'chip';
      c.textContent = `📎 ${a.name}（${a.text.length.toLocaleString()} 字）`;
      const x = document.createElement('button'); x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', '移除 ' + a.name);
      x.onclick = () => { state.attach.splice(i, 1); renderAttach(); };
      c.appendChild(x); el.attachList.appendChild(c);
    });
  }

  async function readFileText(f) {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (['txt', 'md', 'csv', 'json'].includes(ext)) return f.text();
    if (ext === 'docx') {
      if (!window.mammoth) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js');
      const r = await window.mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() });
      return r.value;
    }
    if (ext === 'pdf') {
      if (!window.pdfjsLib) {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
      const pdf = await window.pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise;
      let t = '';
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const c = await page.getTextContent();
        t += c.items.map((i) => i.str).join(' ') + '\n\n';
      }
      return t;
    }
    throw new Error('unsupported');
  }

  async function handleFiles(fileList) {
    const maxMB = CFG.MAX_FILE_MB || 5;
    const maxChars = CFG.MAX_ATTACH_CHARS || 30000;
    for (const f of fileList) {
      try {
        if (f.size > maxMB * 1024 * 1024) { flash(`「${f.name}」超過 ${maxMB} MB，請縮小後再上傳。`); continue; }
        let text = (await readFileText(f)).replace(/\u0000/g, '').trim();
        if (!text) { flash(`「${f.name}」讀不到文字（掃描檔或圖片 PDF 無法處理）。`); continue; }
        let note = '';
        if (text.length > maxChars) { text = text.slice(0, maxChars); note = `「${f.name}」過長，只取前 ${maxChars.toLocaleString()} 字。`; }
        state.attach.push({ name: f.name, text });
        if (note) flash(note);
      } catch (e) {
        flash(e.message === 'unsupported' ? `「${f.name}」格式不支援，請轉成 txt、docx 或 pdf，或直接貼上文字。` : `「${f.name}」讀取失敗。`);
      }
    }
    renderAttach();
  }

  function flash(msg) {
    el.error.innerHTML = ''; const s = document.createElement('span'); s.textContent = msg; el.error.appendChild(s); el.error.hidden = false;
  }

  /* ---------- 輸入框 ---------- */
  function autosize() { el.input.style.height = 'auto'; el.input.style.height = Math.min(el.input.scrollHeight, 220) + 'px'; }

  /* ---------- 通行碼 ---------- */
  function backToGate(msg) {
    store.del('queba_pass'); state.pass = '';
    el.app.hidden = true; el.gate.hidden = false; el.gateErr.textContent = msg || '';
    el.gateInput.value = ''; el.gateInput.focus();
  }

  async function auth(code) {
    const res = await fetch(WORKER + '/auth', { method: 'POST', headers: { 'X-Passcode': code } });
    if (res.status === 401) return { ok: false, msg: '通行碼不正確。' };
    if (res.status === 429) return { ok: false, msg: '嘗試太多次，請等一分鐘再試。' };
    if (!res.ok) return { ok: false, msg: '伺服器暫時無法使用，請稍後再試。' };
    const j = await res.json();
    return { ok: true, limits: j.limits };
  }

  function enter(limits) {
    if (limits) state.limits = limits;
    el.gate.hidden = true; el.app.hidden = false;
    try { state.messages = JSON.parse(store.get('queba_msgs') || '[]'); } catch { state.messages = []; }
    renderAll();
    el.input.focus();
  }

  /* ---------- 事件 ---------- */
  el.gateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = el.gateInput.value.trim();
    if (!code) return;
    el.gateBtn.disabled = true; el.gateErr.textContent = '';
    try {
      const r = await auth(code);
      if (!r.ok) { el.gateErr.textContent = r.msg; return; }
      state.pass = code; store.set('queba_pass', code); enter(r.limits);
    } catch { el.gateErr.textContent = '連不上伺服器，請檢查網路。'; }
    finally { el.gateBtn.disabled = false; }
  });

  el.send.addEventListener('click', () => send(el.input.value));
  el.stop.addEventListener('click', () => { if (state.ctrl) state.ctrl.abort(); });
  el.input.addEventListener('input', autosize);
  el.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); send(el.input.value); }
  });
  el.attachBtn.addEventListener('click', () => el.file.click());
  el.startUpload.addEventListener('click', () => el.file.click());
  el.startGo.addEventListener('click', () => send('開始'));
  el.file.addEventListener('change', async () => { await handleFiles([...el.file.files]); el.file.value = ''; });
  el.input.addEventListener('paste', (e) => {
    const fs = e.clipboardData && e.clipboardData.files;
    if (fs && fs.length) { e.preventDefault(); handleFiles([...fs]); }
  });

  el.quick.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.send) send(b.dataset.send);
    else if (b.dataset.fill) { el.input.value = b.dataset.fill; autosize(); el.input.focus(); }
  });
  el.copyFinal.addEventListener('click', async () => {
    const la = lastAssistant(); if (!la) return;
    await copyText(largestCode(la.content) || la.content);
    el.copyFinal.textContent = '已複製'; setTimeout(() => { el.copyFinal.textContent = '複製完整 prompt'; }, 1500);
  });

  el.chat.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copy]'); if (!b) return;
    const pre = b.closest('.code').querySelector('pre');
    await copyText(pre.textContent);
    b.textContent = '已複製'; setTimeout(() => { b.textContent = '複製'; }, 1500);
  });

  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); }
    catch {
      const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch {} ta.remove();
    }
  }

  el.newChat.addEventListener('click', () => {
    if (state.busy && state.ctrl) state.ctrl.abort();
    if (state.messages.length && !state.confirmNew) {
      state.confirmNew = true; updateChrome();
      setTimeout(() => { state.confirmNew = false; updateChrome(); }, 3000);
      return;
    }
    state.confirmNew = false; state.messages = []; state.attach = [];
    store.del('queba_msgs'); renderAttach(); clearError(); renderAll();
  });

  /* ---------- 啟動 ---------- */
  (async function boot() {
    const saved = store.get('queba_pass');
    if (saved) {
      try {
        const r = await auth(saved);
        if (r.ok) { state.pass = saved; enter(r.limits); return; }
      } catch {}
    }
    el.gate.hidden = false; el.gateInput.focus();
  })();
})();
