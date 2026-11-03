/**
 * 象棋打譜系統 Pro — 介面、對局流程、存檔
 * 規則與 AI 都在 js/engine.js 的 XiangqiEngineFactory() 內；AI 搜尋在 Web Worker 中執行。
 */
'use strict';

const ENGINE = XiangqiEngineFactory();
const {
  PRESETS, AI_PROFILES, PIECE_NAMES,
  initBoard, cloneBoard, getLegalMoves, evaluateGameState, getNotation
} = ENGINE;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const CELL = 56, OX = 46, OY = 48;
const STORAGE_KEY = 'XIANGQI_SAVED_GAMES_V2';
const STATS_STORAGE_KEY = 'XIANGQI_AI_STATS_V1';
const MAX_STEPS = 500;
const AUTO_PLAY_MS = 950;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
let flipped = false;
let selected = null;
let validMoves = [];
let history = [];
let curStep = 0;
let aiMode = 'B';
let aiLevel = 4;
let aiThinking = false;
let aiSessionId = 0;
let hintMove = null;
let autoPlayTimer = null;

// ==================== AI 用戶端：Web Worker（失敗時退回主執行緒） ====================
const AiClient = {
  worker: null,
  local: null,          // 退回主執行緒時使用的引擎實例
  pending: new Map(),   // id -> { cb, req }
  nextId: 1,
  workerUrl: null,

  init() {
    try {
      const src = "'use strict';\nconst E = (" + XiangqiEngineFactory.toString() + ")();\n(" +
        XiangqiWorkerMain.toString() + ")(E);\n";
      this.workerUrl = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const w = new Worker(this.workerUrl);
      w.onmessage = e => this.onMessage(w, e.data);
      w.onerror = ev => {
        if (ev && ev.preventDefault) ev.preventDefault();
        this.fallbackToLocal(w);
      };
      this.worker = w;
    } catch (err) {
      this.fallbackToLocal(null);
    }
  },

  onMessage(w, msg) {
    if (w !== this.worker || !msg || typeof msg !== 'object') return;
    if (msg.type === 'ready') {
      if (this.workerUrl) { URL.revokeObjectURL(this.workerUrl); this.workerUrl = null; }
      return;
    }
    const entry = this.pending.get(msg.id);
    if (!entry) return;
    this.pending.delete(msg.id);
    entry.cb(msg.type === 'result' ? msg.move : null);
  },

  fallbackToLocal(w) {
    if (w && w !== this.worker) return;
    if (this.worker) { try { this.worker.terminate(); } catch (e) { /* ignore */ } }
    this.worker = null;
    if (this.workerUrl) { URL.revokeObjectURL(this.workerUrl); this.workerUrl = null; }
    if (!this.local) this.local = XiangqiEngineFactory();
    // 把尚未完成的請求改在主執行緒重算
    const waiting = [...this.pending.values()];
    this.pending.clear();
    waiting.forEach(({ cb, req }) => this.runLocal(req, cb));
  },

  runLocal(req, cb) {
    setTimeout(() => {
      let move = null;
      try {
        this.local.stopPonder(true);
        this.local.setGameContext(req.ctx);
        move = this.local.computeBestMove(req.board, req.side, req.level);
      } catch (e) { move = null; }
      cb(move);
    }, 60);
  },

  /** 請 AI 算出最佳著法；cb(move | null) */
  think(req, cb) {
    const full = { type: 'think', ...req };
    if (this.worker) {
      const id = this.nextId++;
      this.pending.set(id, { cb, req: full });
      this.worker.postMessage({ ...full, id });
    } else {
      this.runLocal(full, cb);
    }
  },

  /** 取消所有進行中的思考。Worker 正在同步運算時無法插話，只能重啟它（置換表會清空） */
  cancel() {
    if (this.pending.size === 0) return;
    this.pending.clear();
    if (this.worker) {
      try { this.worker.terminate(); } catch (e) { /* ignore */ }
      this.worker = null;
      this.init();
    }
  },

  ponder(req) {
    const full = { type: 'ponder', ...req };
    if (this.worker) {
      this.worker.postMessage({ ...full, id: 0 });
    } else if (this.local) {
      this.local.setGameContext(req.ctx);
      this.local.startPonder(req.board, req.side, req.aiSide, req.level, 18);
    }
  },

  stopPonder() {
    if (this.worker) this.worker.postMessage({ type: 'stopPonder', id: 0 });
    else if (this.local) this.local.stopPonder(false);
  }
};

/** 目前對局給引擎的上下文：步數、過去的走法與局面（用於開局庫與重複局面偵測） */
function buildGameContext() {
  return {
    step: curStep,
    moves: history.slice(1, curStep + 1).map(h => h.lastMove),
    positions: history.slice(0, curStep).map(h => ({ board: h.board, turn: h.turn }))
  };
}

// ==================== 思考計時顯示 ====================
let thinkStartAt = 0;
let thinkTimer = null;
let thinkLevel = 4;

function thinkingLabel() {
  const prof = AI_PROFILES[thinkLevel] || AI_PROFILES[4];
  const sec = Math.floor((performance.now() - thinkStartAt) / 1000);
  const limit = Math.round(prof.timeMs / 1000);
  return `🤖 ${prof.name} (${prof.title}) 思考中… ${sec} 秒` + (limit >= 3 ? `（上限 ${limit} 秒）` : '');
}

function startThinkingClock(level) {
  thinkStartAt = performance.now();
  thinkLevel = level;
  if (thinkTimer === null) {
    thinkTimer = setInterval(() => {
      if (!aiThinking) { clearInterval(thinkTimer); thinkTimer = null; return; }
      document.getElementById('turnText').textContent = thinkingLabel();
    }, 500);
  }
}

function stopPondering() {
  AiClient.stopPonder();
}

function getEffectiveGameState(cur) {
  if (!cur) return { over: false, inCheck: false, winner: null, reason: '' };
  if (cur.resigned === 'R' || cur.resigned === 'B') {
    const winner = cur.resigned === 'R' ? 'B' : 'R';
    const reason = cur.resigned === 'R' ? '紅方投子認輸，黑方獲勝！' : '黑方投子認輸，紅方獲勝！';
    return { over: true, inCheck: false, winner, reason };
  }
  return evaluateGameState(cur.board, cur.turn);
}

// ==================== 對戰戰績統計（存於 localStorage） ====================
function getAiStats() {
  const safe = Object.create(null);
  for (let lv = 1; lv <= 5; lv++) safe[lv] = { wins: 0, losses: 0 };
  try {
    const raw = JSON.parse(localStorage.getItem(STATS_STORAGE_KEY) || '{}');
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (let lv = 1; lv <= 5; lv++) {
        const key = String(lv);
        if (FORBIDDEN_KEYS.has(key)) continue;
        const item = raw[key];
        if (item && typeof item === 'object') {
          const w = Number.isInteger(item.wins) && item.wins >= 0 && item.wins <= 1000000 ? item.wins : 0;
          const l = Number.isInteger(item.losses) && item.losses >= 0 && item.losses <= 1000000 ? item.losses : 0;
          safe[lv] = { wins: w, losses: l };
        }
      }
    }
  } catch (e) { /* ignore */ }
  return safe;
}

function recordAiGameResult(level, isPlayerWin) {
  if (![1, 2, 3, 4, 5].includes(level)) return;
  const stats = getAiStats();
  if (isPlayerWin) stats[level].wins += 1;
  else stats[level].losses += 1;
  try {
    localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
  } catch (e) { /* ignore */ }
}

function formatAiStatsText(level) {
  const stats = getAiStats();
  const rec = stats[level] || { wins: 0, losses: 0 };
  const total = rec.wins + rec.losses;
  if (total === 0) return '對戰戰績：尚無紀錄';
  const rate = Math.round((rec.wins / total) * 100);
  return `對戰戰績：${rec.wins} 勝 ${rec.losses} 負（勝率 ${rate}%）`;
}

// ==================== 自動播放控制 ====================
function updateAutoPlayButton() {
  const btn = document.getElementById('navPlay');
  if (!btn) return;
  if (autoPlayTimer !== null) {
    btn.textContent = '⏸ 暫停';
    btn.classList.add('playing');
  } else {
    btn.textContent = '▶ 播放';
    btn.classList.remove('playing');
  }
}

function stopAutoPlay() {
  if (autoPlayTimer !== null) {
    clearInterval(autoPlayTimer);
    autoPlayTimer = null;
    updateAutoPlayButton();
  }
}

function toggleAutoPlay() {
  if (autoPlayTimer !== null) {
    stopAutoPlay();
    return;
  }
  if (history.length <= 1) return;
  stopPondering();
  AiClient.cancel();
  aiSessionId++;
  aiThinking = false;
  if (curStep >= history.length - 1) {
    curStep = 0;
    renderAll();
  }
  autoPlayTimer = setInterval(() => {
    if (curStep < history.length - 1) {
      curStep++;
      selected = null;
      validMoves = [];
      hintMove = null;
      renderAll();
    } else {
      stopAutoPlay();
    }
  }, AUTO_PLAY_MS);
  updateAutoPlayButton();
}

function startPonderingIfNeeded() {
  if (aiMode === 'off' || aiThinking || autoPlayTimer !== null) return;
  const cur = history[curStep];
  if (!cur || cur.turn === aiMode) return;
  if (getEffectiveGameState(cur).over) return;
  AiClient.ponder({ board: cur.board, side: cur.turn, aiSide: aiMode, level: aiLevel, ctx: buildGameContext() });
}

function validateAllPresets() {
  let totalSteps = 0;
  for (const [key, preset] of Object.entries(PRESETS)) {
    let b = initBoard();
    let turn = 'R';
    preset.moves.forEach((m, idx) => {
      const [fr, fc] = m.f, [tr, tc] = m.t;
      const p = b[fr][fc];
      if (!p || p.s !== turn) throw new Error(`棋譜 [${preset.title}] 第 ${idx+1} 步無子或輪次錯誤`);
      const legal = getLegalMoves(b, fr, fc);
      if (!legal.some(([lr, lc]) => lr === tr && lc === tc)) {
        throw new Error(`棋譜 [${preset.title}] 第 ${idx+1} 步 (${m.c}) 違反行棋規則！`);
      }
      b[tr][tc] = b[fr][fc];
      b[fr][fc] = null;
      turn = turn === 'R' ? 'B' : 'R';
      totalSteps++;
    });
  }
  const badge = document.getElementById('verifyBadge');
  badge.textContent = `9局 / ${totalSteps}步 規則檢驗通過`;
}

function resetGame(skipAiTrigger = false) {
  stopAutoPlay();
  stopPondering();
  AiClient.cancel();
  aiSessionId++;
  aiThinking = false;
  hintMove = null;
  history = [{ board: initBoard(), turn: 'R', notation: '開局', comment: '初始盤面，紅方先行。', lastMove: null }];
  curStep = 0;
  selected = null;
  validMoves = [];
  renderAll();
  if (!skipAiTrigger) maybeTriggerAi();
}

function makeMove(fr, fc, tr, tc, comment = "", skipAiTrigger = false) {
  stopAutoPlay();
  const cur = history[curStep];
  const nextB = cloneBoard(cur.board);
  const notation = getNotation(cur.board, fr, fc, tr, tc);
  nextB[tr][tc] = nextB[fr][fc];
  nextB[fr][fc] = null;
  history = history.slice(0, curStep + 1);
  history.push({
    board: nextB,
    turn: cur.turn === 'R' ? 'B' : 'R',
    notation,
    comment,
    lastMove: {fr, fc, tr, tc}
  });
  curStep++;
  selected = null;
  validMoves = [];
  hintMove = null;
  if (!skipAiTrigger) autoSaveFinishedGame();
  renderAll();
  if (!skipAiTrigger) maybeTriggerAi();
}

// ==================== 終局自動存檔（僅存於使用者自己瀏覽器的 localStorage） ====================
const MAX_AUTO_SAVES = 100;

function formatAutoSaveTime(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function autoSaveFinishedGame() {
  const cur = history[curStep];
  if (!cur || curStep < 1) return;
  const state = getEffectiveGameState(cur);
  if (!state.over || (state.winner !== 'R' && state.winner !== 'B')) return;

  const prof = AI_PROFILES[aiLevel] || AI_PROFILES[4];
  let resultTag, opponent;
  if (aiMode === 'R' || aiMode === 'B') {
    const playerSide = aiMode === 'R' ? 'B' : 'R';
    const isPlayerWin = state.winner === playerSide;
    resultTag = isPlayerWin ? '勝' : '負';
    opponent = `Lv.${aiLevel}${prof.name}`;
    if (!cur.statsRecorded) {
      cur.statsRecorded = true;
      recordAiGameResult(aiLevel, isPlayerWin);
    }
  } else {
    resultTag = state.winner === 'R' ? '紅勝' : '黑勝';
    opponent = '雙人';
  }
  const now = new Date();
  const title = `[自動][${resultTag}] ${opponent} ${formatAutoSaveTime(now)}`.slice(0, 60);
  if (FORBIDDEN_KEYS.has(title)) return;

  const steps = history.slice(1, curStep + 1).map(h => ({
    f: [h.lastMove.fr, h.lastMove.fc],
    t: [h.lastMove.tr, h.lastMove.tc],
    c: typeof h.comment === 'string' ? h.comment.slice(0, 2000) : ''
  }));
  if (steps.length === 0 || steps.length > MAX_STEPS) return;

  const records = getSavedRecords();
  records[title] = {
    title,
    updatedAt: now.toISOString(),
    auto: true,
    result: resultTag,
    opponent,
    reason: state.reason,
    steps
  };

  // 自動存檔最多保留 MAX_AUTO_SAVES 筆，超過時刪除最舊的自動存檔（手動存檔永不刪除）
  const autoKeys = Object.keys(records)
    .filter(k => records[k] && records[k].auto === true)
    .sort((a, b) => String(records[a].updatedAt || '').localeCompare(String(records[b].updatedAt || '')));
  while (autoKeys.length > MAX_AUTO_SAVES) {
    delete records[autoKeys.shift()];
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (err) {
    cur.autoSaveFailed = true;
    return;
  }
  cur.autoSavedTitle = title;
  refreshSavedSelect(title);
}

function b2s(r, c) {
  const rr = flipped ? 9 - r : r;
  const cc = flipped ? 8 - c : c;
  return [OX + cc * CELL, OY + rr * CELL];
}

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#4a2e14';
  ctx.lineWidth = 1.6;
  ctx.strokeRect(OX - 6, OY - 6, CELL * 8 + 12, CELL * 9 + 12);

  for (let r = 0; r < 10; r++) {
    ctx.beginPath();
    ctx.moveTo(OX, OY + r * CELL);
    ctx.lineTo(OX + 8 * CELL, OY + r * CELL);
    ctx.stroke();
  }
  for (let c = 0; c < 9; c++) {
    ctx.beginPath();
    ctx.moveTo(OX + c * CELL, OY);
    ctx.lineTo(OX + c * CELL, OY + 4 * CELL);
    ctx.moveTo(OX + c * CELL, OY + 5 * CELL);
    ctx.lineTo(OX + c * CELL, OY + 9 * CELL);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(OX, OY + 4 * CELL); ctx.lineTo(OX, OY + 5 * CELL);
  ctx.moveTo(OX + 8 * CELL, OY + 4 * CELL); ctx.lineTo(OX + 8 * CELL, OY + 5 * CELL);
  ctx.moveTo(OX + 3 * CELL, OY); ctx.lineTo(OX + 5 * CELL, OY + 2 * CELL);
  ctx.moveTo(OX + 5 * CELL, OY); ctx.lineTo(OX + 3 * CELL, OY + 2 * CELL);
  ctx.moveTo(OX + 3 * CELL, OY + 7 * CELL); ctx.lineTo(OX + 5 * CELL, OY + 9 * CELL);
  ctx.moveTo(OX + 5 * CELL, OY + 7 * CELL); ctx.lineTo(OX + 3 * CELL, OY + 9 * CELL);
  ctx.stroke();

  ctx.fillStyle = '#4a2e14';
  ctx.font = 'bold 22px "Kaiti TC", "STKaiti", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('楚 河', OX + 2 * CELL, OY + 4.5 * CELL);
  ctx.fillText('漢 界', OX + 6 * CELL, OY + 4.5 * CELL);

  const cur = history[curStep];
  if (cur.lastMove) {
    const {fr, fc, tr, tc} = cur.lastMove;
    [[fr,fc],[tr,tc]].forEach(([r,c]) => {
      const [x, y] = b2s(r, c);
      ctx.strokeStyle = 'rgba(217, 119, 6, 0.85)';
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 24, y - 24, 48, 48);
    });
  }

  if (hintMove) {
    const [fx, fy] = b2s(hintMove.fr, hintMove.fc);
    const [tx, ty] = b2s(hintMove.tr, hintMove.tc);
    ctx.save();
    ctx.strokeStyle = 'rgba(14, 165, 233, 0.95)';
    ctx.lineWidth = 3.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(fx - 26, fy - 26, 52, 52);
    ctx.strokeRect(tx - 26, ty - 26, 52, 52);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.restore();
  }

  validMoves.forEach(([r, c]) => {
    const [x, y] = b2s(r, c);
    ctx.fillStyle = 'rgba(22, 163, 74, 0.8)';
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
  });

  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = cur.board[r][c];
      if (!p) continue;
      const [x, y] = b2s(r, c);
      const isSel = selected && selected[0] === r && selected[1] === c;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, isSel ? 25 : 23, 0, Math.PI * 2);
      ctx.fillStyle = '#f7dfba';
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = isSel ? 10 : 4;
      ctx.shadowOffsetY = 3;
      ctx.fill();
      ctx.lineWidth = isSel ? 3 : 2;
      ctx.strokeStyle = isSel ? '#f59e0b' : (p.s === 'R' ? '#b91c1c' : '#1f2937');
      ctx.stroke();
      ctx.fillStyle = p.s === 'R' ? '#b91c1c' : '#111827';
      ctx.font = 'bold 23px "Kaiti TC", "Microsoft JhengHei", serif';
      ctx.fillText(PIECE_NAMES[p.s][p.t], x, y + 1);
      ctx.restore();
    }
  }
}

function updateAiProfileUI() {
  const prof = AI_PROFILES[aiLevel] || AI_PROFILES[4];
  const nameEl = document.getElementById('aiProfileName');
  const badgeEl = document.getElementById('aiProfileBadge');
  const bioEl = document.getElementById('aiProfileBio');
  const statsEl = document.getElementById('aiProfileStats');
  if (nameEl) nameEl.textContent = `對手：${prof.name}（${prof.title}）`;
  if (badgeEl) badgeEl.textContent = prof.badge;
  if (bioEl) bioEl.textContent = prof.bio;
  if (statsEl) statsEl.textContent = formatAiStatsText(aiLevel);
}

function renderAll() {
  drawBoard();
  updateAiProfileUI();
  updateAutoPlayButton();
  const cur = history[curStep];
  const state = getEffectiveGameState(cur);
  const statusBar = document.getElementById('statusBar');
  const turnText = document.getElementById('turnText');
  const prof = AI_PROFILES[aiLevel] || AI_PROFILES[4];

  if (state.over) {
    statusBar.classList.remove('thinking');
    statusBar.classList.add('gameover');
    const saveNote = cur.autoSavedTitle ? '（已自動存檔）' : (cur.autoSaveFailed ? '（自動存檔失敗：空間不足）' : '');
    turnText.textContent = `終局：${state.reason}${saveNote}`;
  } else if (aiThinking) {
    statusBar.classList.remove('gameover');
    statusBar.classList.add('thinking');
    turnText.textContent = thinkingLabel();
  } else {
    statusBar.classList.remove('gameover', 'thinking');
    if (hintMove) {
      turnText.textContent = `💡 ${prof.name} 建議：${hintMove.notation} (再按支招代走)`;
    } else {
      const roleTag = (aiMode === cur.turn) ? ` (${prof.name})` : '';
      turnText.textContent = (cur.turn === 'R' ? '紅方行棋' : '黑方行棋') + roleTag + (state.inCheck ? ' (將軍!)' : '');
    }
  }

  document.getElementById('stepCount').textContent = `第 ${curStep} / ${history.length - 1} 步`;
  document.getElementById('commentInput').value = cur.comment || '';

  const list = document.getElementById('moveList');
  list.replaceChildren();
  for (let i = 1; i < history.length; i += 2) {
    const round = Math.ceil(i / 2);
    const numEl = document.createElement('div');
    numEl.className = 'move-num';
    numEl.textContent = round + '.';
    list.appendChild(numEl);

    const rEl = document.createElement('div');
    rEl.className = 'move-item' + (curStep === i ? ' active' : '');
    rEl.textContent = history[i].notation;
    rEl.onclick = () => goStep(i);
    list.appendChild(rEl);

    const bEl = document.createElement('div');
    bEl.className = 'move-item' + (curStep === i + 1 ? ' active' : '');
    if (history[i + 1]) {
      bEl.textContent = history[i + 1].notation;
      bEl.onclick = () => goStep(i + 1);
    }
    list.appendChild(bEl);
  }
}

canvas.addEventListener('click', e => {
  if (aiThinking) return;
  stopAutoPlay();
  const cur = history[curStep];
  if (aiMode === cur.turn) return;
  const state = getEffectiveGameState(cur);
  if (state.over) return;

  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  let c = Math.round((x - OX) / CELL);
  let r = Math.round((y - OY) / CELL);
  if (c < 0 || c > 8 || r < 0 || r > 9) return;
  if (flipped) { r = 9 - r; c = 8 - c; }

  if (selected) {
    if (validMoves.some(([vr, vc]) => vr === r && vc === c)) {
      makeMove(selected[0], selected[1], r, c);
      return;
    }
  }
  const p = cur.board[r][c];
  if (p && p.s === cur.turn) {
    selected = [r, c];
    validMoves = getLegalMoves(cur.board, r, c);
  } else {
    selected = null;
    validMoves = [];
  }
  drawBoard();
});

function goStep(s) {
  if (s < 0 || s >= history.length) return;
  stopAutoPlay();
  stopPondering();
  AiClient.cancel();
  aiSessionId++;
  aiThinking = false;
  hintMove = null;
  curStep = s;
  selected = null;
  validMoves = [];
  renderAll();
  startPonderingIfNeeded();
}
function undoMove() {
  if (curStep <= 0) return;
  stopAutoPlay();
  stopPondering();
  AiClient.cancel();
  aiSessionId++;
  aiThinking = false;
  hintMove = null;
  const cur = history[curStep];
  if (aiMode !== 'off' && cur.turn !== aiMode && curStep >= 2) {
    goStep(curStep - 2);
  } else {
    goStep(curStep - 1);
  }
}
function flipBoard() { flipped = !flipped; drawBoard(); }
function saveComment() { history[curStep].comment = document.getElementById('commentInput').value.slice(0, 2000); }

function resignGame() {
  stopAutoPlay();
  const cur = history[curStep];
  if (!cur) return;
  if (curStep < 1) {
    alert('尚未落子，無須認輸！');
    return;
  }
  if (getEffectiveGameState(cur).over) {
    alert('本局已經結束！');
    return;
  }
  if (!confirm('確定要投子認輸嗎？（本局將自動存入您的棋譜庫）')) return;
  stopPondering();
  AiClient.cancel();
  aiSessionId++;
  aiThinking = false;
  hintMove = null;
  selected = null;
  validMoves = [];
  const resignSide = (aiMode === 'R') ? 'B' : (aiMode === 'B' ? 'R' : cur.turn);
  cur.resigned = resignSide;
  autoSaveFinishedGame();
  renderAll();
}

function takeoverFromCurrentPosition() {
  stopAutoPlay();
  stopPondering();
  AiClient.cancel();
  aiSessionId++;
  aiThinking = false;
  hintMove = null;
  selected = null;
  validMoves = [];
  const cur = history[curStep];
  if (!cur) return;
  if (evaluateGameState(cur.board, cur.turn).over) {
    alert('此盤面已是終局，請先切換到先前的步數再點擊「從此續戰」！');
    return;
  }
  delete cur.resigned;
  delete cur.autoSavedTitle;
  delete cur.autoSaveFailed;
  delete cur.statsRecorded;
  history = history.slice(0, curStep + 1);
  if (aiMode === 'off') {
    aiMode = cur.turn === 'R' ? 'B' : 'R';
    const modeSel = document.getElementById('aiModeSelect');
    if (modeSel) modeSel.value = aiMode;
  }
  renderAll();
  maybeTriggerAi();
}

function onAiConfigChange() {
  stopAutoPlay();
  stopPondering();
  AiClient.cancel();
  const modeVal = document.getElementById('aiModeSelect').value;
  const lvVal = parseInt(document.getElementById('aiLevelSelect').value, 10);
  aiMode = ['off', 'B', 'R'].includes(modeVal) ? modeVal : 'off';
  aiLevel = [1, 2, 3, 4, 5].includes(lvVal) ? lvVal : 4;
  aiSessionId++;
  aiThinking = false;
  hintMove = null;
  renderAll();
  maybeTriggerAi();
}

/** 驗證 AI 回傳的著法在目前盤面合法 */
function isLegalAiMove(board, side, m) {
  if (!m || typeof m !== 'object') return false;
  const ok = [m.fr, m.tr].every(v => Number.isInteger(v) && v >= 0 && v <= 9) &&
    [m.fc, m.tc].every(v => Number.isInteger(v) && v >= 0 && v <= 8);
  if (!ok) return false;
  const p = board[m.fr][m.fc];
  if (!p || p.s !== side) return false;
  return getLegalMoves(board, m.fr, m.fc).some(([lr, lc]) => lr === m.tr && lc === m.tc);
}

function safeComment(m) {
  return typeof m.comment === 'string' ? m.comment.slice(0, 2000) : '';
}

function maybeTriggerAi() {
  if (aiMode === 'off') {
    stopPondering();
    return;
  }
  const cur = history[curStep];
  if (!cur) return;
  const state = getEffectiveGameState(cur);
  if (state.over) {
    stopPondering();
    return;
  }
  // 輪到玩家行棋時，讓 AI 在背景靜默預思考
  if (cur.turn !== aiMode) {
    startPonderingIfNeeded();
    return;
  }

  const session = ++aiSessionId;
  const stepAtRequest = curStep;
  aiThinking = true;
  startThinkingClock(aiLevel);
  renderAll();

  AiClient.think({ board: cur.board, side: cur.turn, level: aiLevel, ctx: buildGameContext() }, best => {
    if (session !== aiSessionId || curStep !== stepAtRequest) return;
    aiThinking = false;
    const latest = history[curStep];
    if (latest && latest.turn === aiMode && isLegalAiMove(latest.board, latest.turn, best)) {
      makeMove(best.fr, best.fc, best.tr, best.tc, safeComment(best));
    } else {
      renderAll();
    }
  });
}

function requestAiHint() {
  if (aiThinking) return;
  stopAutoPlay();
  const cur = history[curStep];
  const state = getEffectiveGameState(cur);
  if (state.over) return;

  if (hintMove) {
    const { fr, fc, tr, tc, comment } = hintMove;
    const legal = getLegalMoves(cur.board, fr, fc);
    if (legal.some(([lr, lc]) => lr === tr && lc === tc)) {
      makeMove(fr, fc, tr, tc, comment || '採納 AI 支招建議。');
      return;
    }
  }

  // 不先停止預思考：Worker 收到 think 時會自行停止並保留預思考成果
  // 支招固定用 Lv.3 的算力（每步最多 6 秒），避免玩家等太久
  const HINT_LEVEL = 3;
  const session = ++aiSessionId;
  const stepAtRequest = curStep;
  aiThinking = true;
  startThinkingClock(HINT_LEVEL);
  renderAll();
  AiClient.think({ board: cur.board, side: cur.turn, level: HINT_LEVEL, ctx: buildGameContext() }, best => {
    if (session !== aiSessionId || curStep !== stepAtRequest) return;
    aiThinking = false;
    const latest = history[curStep];
    if (!latest || !isLegalAiMove(latest.board, latest.turn, best)) {
      renderAll();
      return;
    }
    const notation = getNotation(latest.board, best.fr, best.fc, best.tr, best.tc);
    hintMove = { fr: best.fr, fc: best.fc, tr: best.tr, tc: best.tc, comment: safeComment(best), notation };
    selected = [best.fr, best.fc];
    validMoves = getLegalMoves(latest.board, best.fr, best.fc);
    renderAll();
    startPonderingIfNeeded();
  });
}

document.getElementById('presetSelect').addEventListener('change', e => {
  const key = e.target.value;
  if (!key || !Object.prototype.hasOwnProperty.call(PRESETS, key)) return;
  if (loadAndVerifySteps(PRESETS[key].title, PRESETS[key].moves)) {
    goStep(0);
  }
});

function isValidCoordPair(pair) {
  return Array.isArray(pair) &&
    pair.length === 2 &&
    Number.isInteger(pair[0]) && pair[0] >= 0 && pair[0] <= 9 &&
    Number.isInteger(pair[1]) && pair[1] >= 0 && pair[1] <= 8;
}

function getSavedRecords() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const safe = Object.create(null);
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const k of Object.keys(raw)) {
        if (!FORBIDDEN_KEYS.has(k)) safe[k] = raw[k];
      }
    }
    return safe;
  } catch {
    return Object.create(null);
  }
}

function refreshSavedSelect(selectedTitle = '') {
  const records = getSavedRecords();
  const keys = Object.keys(records);
  const sel = document.getElementById('savedSelect');
  sel.replaceChildren();
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = `-- 我的存檔棋譜庫 (${keys.length}) --`;
  sel.appendChild(defaultOpt);

  keys.forEach(k => {
    const opt = document.createElement('option');
    opt.value = k;
    const stepLen = (records[k] && Array.isArray(records[k].steps)) ? records[k].steps.length : 0;
    opt.textContent = `${k} (${stepLen}步)`;
    if (k === selectedTitle) opt.selected = true;
    sel.appendChild(opt);
  });
}

function saveCurrentRecord() {
  const defaultName = history[0].comment !== '初始盤面，紅方先行。' ? history[0].comment : `自訂打譜_${new Date().toLocaleDateString()}`;
  const rawTitle = prompt('請輸入要儲存的棋譜名稱（最多 60 字元）：', defaultName);
  if (!rawTitle) return;
  const title = rawTitle.trim();
  if (!title) return;
  if (title.length > 60) {
    alert('棋譜名稱不可超過 60 個字元！');
    return;
  }
  if (FORBIDDEN_KEYS.has(title)) {
    alert('此名稱為系統保留字，請使用其他名稱！');
    return;
  }
  const records = getSavedRecords();
  records[title] = {
    title,
    updatedAt: new Date().toISOString(),
    steps: history.slice(1).map(h => ({ f: [h.lastMove.fr, h.lastMove.fc], t: [h.lastMove.tr, h.lastMove.tc], c: h.comment }))
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (err) {
    alert('瀏覽器儲存空間不足，無法儲存棋譜！');
    return;
  }
  history[0].comment = title;
  refreshSavedSelect(title);
  renderAll();
  alert(`已成功儲存棋譜：「${title}」！`);
}

function loadAndVerifySteps(title, steps) {
  if (!Array.isArray(steps)) {
    alert('棋譜格式錯誤：steps 必須為陣列！');
    return false;
  }
  if (steps.length > MAX_STEPS) {
    alert(`棋譜步數超過上限（最多 ${MAX_STEPS} 步），已中止載入！`);
    return false;
  }

  const prevHistory = history;
  const prevStep = curStep;
  resetGame(true);
  if (typeof title === 'string' && title.trim()) {
    history[0].comment = title.trim().slice(0, 60);
  }

  for (let i = 0; i < steps.length; i++) {
    const m = steps[i];
    if (!m || typeof m !== 'object' || !isValidCoordPair(m.f) || !isValidCoordPair(m.t)) {
      history = prevHistory;
      curStep = prevStep;
      renderAll();
      alert(`載入失敗：第 ${i + 1} 步座標格式不合法或超出棋盤範圍！`);
      return false;
    }
    const [fr, fc] = m.f;
    const [tr, tc] = m.t;
    const cur = history[curStep];
    if (evaluateGameState(cur.board, cur.turn).over) {
      history = prevHistory;
      curStep = prevStep;
      renderAll();
      alert(`載入失敗：第 ${i + 1} 步前牌局已終局，不可繼續行棋！`);
      return false;
    }
    const piece = cur.board[fr][fc];
    if (!piece || piece.s !== cur.turn) {
      history = prevHistory;
      curStep = prevStep;
      renderAll();
      alert(`載入失敗：第 ${i + 1} 步不合法（起點無子或非該方輪次）！`);
      return false;
    }
    const legalMoves = getLegalMoves(cur.board, fr, fc);
    if (!legalMoves.some(([lr, lc]) => lr === tr && lc === tc)) {
      history = prevHistory;
      curStep = prevStep;
      renderAll();
      alert(`載入失敗：第 ${i + 1} 步違反象棋規則或導致將帥受威脅！`);
      return false;
    }
    const comment = typeof m.c === 'string' ? m.c.slice(0, 2000) : '';
    makeMove(fr, fc, tr, tc, comment, true);
  }
  return true;
}

function loadSavedRecord() {
  const title = document.getElementById('savedSelect').value;
  if (!title || FORBIDDEN_KEYS.has(title)) return;
  const records = getSavedRecords();
  const rec = records[title];
  if (!rec) return;
  if (loadAndVerifySteps(rec.title || title, rec.steps || [])) {
    goStep(0);
  }
}

function deleteSavedRecord() {
  const title = document.getElementById('savedSelect').value;
  if (!title || FORBIDDEN_KEYS.has(title)) { alert('請先從下拉選單選擇要刪除的存檔棋譜！'); return; }
  if (!confirm(`確定要刪除存檔棋譜「${title}」嗎？`)) return;
  const records = getSavedRecords();
  delete records[title];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (err) {
    alert('更新存檔庫失敗！');
    return;
  }
  refreshSavedSelect();
}

function openModal() {
  const data = {
    title: history[0].comment,
    steps: history.slice(1).map(h => ({ f: [h.lastMove.fr, h.lastMove.fc], t: [h.lastMove.tr, h.lastMove.tc], c: h.comment }))
  };
  document.getElementById('ioTextarea').value = JSON.stringify(data, null, 2);
  document.getElementById('ioModal').classList.add('open');
}
function closeModal() { document.getElementById('ioModal').classList.remove('open'); }
function copyIO() {
  const ta = document.getElementById('ioTextarea');
  ta.select();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(ta.value).catch(() => document.execCommand('copy'));
  } else {
    document.execCommand('copy');
  }
}
function importJSON() {
  let data;
  try {
    data = JSON.parse(document.getElementById('ioTextarea').value);
  } catch (err) {
    alert('棋譜 JSON 格式錯誤，請確認貼上的內容是否完整！');
    return;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    alert('棋譜 JSON 結構不正確！');
    return;
  }
  if (loadAndVerifySteps(data.title || '', data.steps || [])) {
    closeModal();
  }
}

window.addEventListener('keydown', e => {
  if (['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement.tagName)) return;
  if (e.key === 'ArrowLeft') goStep(curStep - 1);
  else if (e.key === 'ArrowRight') goStep(curStep + 1);
  else if (e.key === 'Home') { e.preventDefault(); goStep(0); }
  else if (e.key === 'End') { e.preventDefault(); goStep(history.length - 1); }
  else if (e.key === ' ') { e.preventDefault(); toggleAutoPlay(); }
});

// ==================== 事件綁定（取代 HTML 內嵌 onclick，以符合嚴格 CSP） ====================
function bind(id, eventName, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(eventName, () => handler());
}
bind('btnReset', 'click', () => resetGame());
bind('btnFlip', 'click', flipBoard);
bind('btnUndo', 'click', undoMove);
bind('btnResign', 'click', resignGame);
bind('btnSave', 'click', saveCurrentRecord);
bind('btnIO', 'click', openModal);
bind('aiModeSelect', 'change', onAiConfigChange);
bind('aiLevelSelect', 'change', onAiConfigChange);
bind('aiHintBtn', 'click', requestAiHint);
bind('btnTakeover', 'click', takeoverFromCurrentPosition);
bind('savedSelect', 'change', loadSavedRecord);
bind('btnDeleteSave', 'click', deleteSavedRecord);
bind('navFirst', 'click', () => goStep(0));
bind('navPrev', 'click', () => goStep(curStep - 1));
bind('navPlay', 'click', toggleAutoPlay);
bind('navNext', 'click', () => goStep(curStep + 1));
bind('navLast', 'click', () => goStep(history.length - 1));
bind('commentInput', 'input', saveComment);
bind('btnCopyIO', 'click', copyIO);
bind('btnImport', 'click', importJSON);
bind('btnCloseModal', 'click', closeModal);

AiClient.init();
resetGame();
refreshSavedSelect();
try {
  validateAllPresets();
} catch (err) {
  console.error(err);
  document.getElementById('verifyBadge').textContent = err.message;
}
