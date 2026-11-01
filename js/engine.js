/**
 * 象棋打譜系統 Pro — 規則與 AI 引擎
 *
 * 整個引擎封裝在 XiangqiEngineFactory() 內，不引用任何外部變數（不碰 DOM），
 * 因此主執行緒可直接呼叫（規則判斷），也能以 Function.prototype.toString()
 * 組成 Blob 交給 Web Worker 在背景執行 AI（以 file:// 直接開啟也可用）。
 *
 * 棋盤：board[row][col]，row 0–9（0 為黑方底線），col 0–8；棋子為 { s: 'R'|'B', t: 'K'|'A'|'B'|'N'|'R'|'C'|'P' }。
 */
function XiangqiEngineFactory() {
  'use strict';

  const PIECE_NAMES = {
    R: { K:'帥', A:'仕', B:'相', N:'傌', R:'俥', C:'炮', P:'兵' },
    B: { K:'將', A:'士', B:'象', N:'馬', R:'車', C:'包', P:'卒' }
  };
  const NUM_CN = ['','一','二','三','四','五','六','七','八','九'];
  const NUM_FW = ['','１','２','３','４','５','６','７','８','９'];

  const PRESETS = {
    tiehuache: {
      title: "《橘中秘》棄馬十三著（鐵滑車・修正完整版）",
      moves: [
        {f:[7,7],t:[7,4],c:"炮二平五，當頭炮進攻中路。"},
        {f:[2,7],t:[2,5],c:"包８平６，先架士角炮（修正原譜先跳馬導致包８平６被馬擋住之誤）！"},
        {f:[9,7],t:[7,6],c:"傌二進三，紅跳右正馬。"},
        {f:[0,7],t:[2,6],c:"馬８進７，黑再跳右馬護中卒，子力協調暢通。"},
        {f:[9,8],t:[9,7],c:"俥一平二，紅出直車。"},
        {f:[0,8],t:[0,7],c:"車９平８，黑出右直車。"},
        {f:[6,6],t:[5,6],c:"兵三進一，紅挺三兵活通馬路。"},
        {f:[2,1],t:[4,1],c:"包２進２，黑２路包巡河準備調動。"},
        {f:[9,1],t:[7,2],c:"傌八進七，紅方雙正馬齊出。"},
        {f:[4,1],t:[4,2],c:"包２平３，黑平巡河包瞄準紅七路底相，同時讓開２路車道！"},
        {f:[9,0],t:[8,0],c:"俥九進一，紅起橫車，暗伏「鐵滑車」棄馬陷阱！"},
        {f:[0,1],t:[2,2],c:"馬２進３，黑跳左馬亮出左車。"},
        {f:[8,0],t:[8,5],c:"俥九平四，紅橫車滑至四路肋道待命。"},
        {f:[0,0],t:[0,1],c:"車１平２，黑出左直車瞄準紅八路炮。"},
        {f:[9,7],t:[3,7],c:"俥二進六，紅右車過河深入黑陣施壓。"},
        {f:[0,1],t:[7,1],c:"車２進７，黑車貪吃紅八路炮，踏入鐵滑車陷阱！"},
        {f:[8,5],t:[8,6],c:"俥四平三，鐵滑車橫移捉死黑２路車！"},
        {f:[7,1],t:[7,2],c:"車２平３，黑車無路可逃，無奈吃馬（棄馬十三著）。"},
        {f:[9,2],t:[7,0],c:"相七進九，紅飛邊相徹底鎖死黑車退路，紅方大優！"}
      ]
    },
    juzhongmi1: {
      title: "《橘中秘》順炮直車對橫車",
      moves: [
        {f:[7,7],t:[7,4],c:"炮二平五，當頭炮開局正著。"},
        {f:[2,7],t:[2,4],c:"包８平５，順手炮應之，對攻激烈。"},
        {f:[9,7],t:[7,6],c:"傌二進三，正馬護中兵。"},
        {f:[0,7],t:[2,6],c:"馬８進７，黑方跳正馬。"},
        {f:[9,8],t:[9,7],c:"俥一平二，出直車搶佔要道。"},
        {f:[0,8],t:[1,8],c:"車９進１，黑出橫車準備平肋。"},
        {f:[9,7],t:[3,7],c:"俥二進六，過河深入黑陣壓制。"},
        {f:[1,8],t:[1,3],c:"車９平４，佔據四路肋道要津。"},
        {f:[3,7],t:[3,6],c:"俥二平三，吃７路卒並塞住黑馬腿、捉底象！"},
        {f:[0,5],t:[1,4],c:"士６進５，黑補士防中路並解底象之危。"},
        {f:[9,1],t:[7,2],c:"傌八進七，紅方躍出左馬。"},
        {f:[1,3],t:[6,3],c:"車４進５，黑車過河吃兵反擊。"},
        {f:[3,6],t:[2,6],c:"俥三進一，紅車砍馬破防！"},
        {f:[2,1],t:[2,6],c:"包２平７，黑隔中包打車還擊。"},
        {f:[9,0],t:[9,1],c:"俥九平八，紅速出左車助戰。"},
        {f:[0,1],t:[2,2],c:"馬２進３，黑跳左馬保護中卒。"}
      ]
    },
    shunpao_heng: {
      title: "《橘中秘》順炮橫車破直車",
      moves: [
        {f:[7,7],t:[7,4],c:"炮二平五，當頭炮開局。"},
        {f:[2,7],t:[2,4],c:"包８平５，順手炮對攻。"},
        {f:[9,7],t:[7,6],c:"傌二進三，紅跳右馬。"},
        {f:[0,7],t:[2,6],c:"馬８進７，黑跳右馬。"},
        {f:[9,8],t:[8,8],c:"俥一進一，紅起橫車（順炮橫車對直車）。"},
        {f:[0,8],t:[0,7],c:"車９平８，黑出直車搶佔８路。"},
        {f:[8,8],t:[8,3],c:"俥一平六，紅橫車佔據六路仕角肋道。"},
        {f:[0,7],t:[5,7],c:"車８進５，黑直車過河巡視。"},
        {f:[9,1],t:[7,2],c:"傌八進七，紅跳左馬。"},
        {f:[0,1],t:[2,2],c:"馬２進３，黑亦出左馬。"},
        {f:[8,3],t:[2,3],c:"俥六進六，紅車直插黑方士角壓迫宮城！"},
        {f:[0,3],t:[1,4],c:"士４進５，黑補士化解攻勢。"}
      ]
    },
    meihuapu: {
      title: "《梅花譜》屏風馬橫車破當頭炮",
      moves: [
        {f:[7,7],t:[7,4],c:"炮二平五，當頭炮。"},
        {f:[0,7],t:[2,6],c:"馬８進７，屏風馬應局。"},
        {f:[9,7],t:[7,6],c:"傌二進三，紅跳正馬。"},
        {f:[0,1],t:[2,2],c:"馬２進３，雙馬並立如屏風。"},
        {f:[9,8],t:[9,7],c:"俥一平二，紅出直車。"},
        {f:[0,8],t:[1,8],c:"車９進１，黑起橫車，《梅花譜》精髓。"},
        {f:[6,6],t:[5,6],c:"兵三進一，紅挺兵活馬。"},
        {f:[1,8],t:[1,3],c:"車９平４，黑車佔肋道要津。"},
        {f:[9,5],t:[8,4],c:"仕四進五，紅補仕防黑車深入。"},
        {f:[2,7],t:[4,7],c:"包８進２，巡河包靈活調動。"},
        {f:[9,1],t:[7,2],c:"傌八進七，紅出左馬。"},
        {f:[4,7],t:[4,2],c:"包８平３，平包瞄準紅方七路相線。"}
      ]
    },
    pingfengma: {
      title: "近代定式：中炮過河車對屏風馬平炮兌車",
      moves: [
        {f:[7,7],t:[7,4],c:"炮二平五，中炮開局。"},
        {f:[0,7],t:[2,6],c:"馬８進７，黑跳正馬。"},
        {f:[9,7],t:[7,6],c:"傌二進三，紅跳正馬。"},
        {f:[3,6],t:[4,6],c:"卒７進１，挺７路卒制紅馬。"},
        {f:[9,8],t:[9,7],c:"俥一平二，亮出直車。"},
        {f:[0,1],t:[2,2],c:"馬２進３，形成屏風馬正局。"},
        {f:[6,2],t:[5,2],c:"兵七進一，開通七路馬路。"},
        {f:[0,8],t:[0,7],c:"車９平８，黑出直車。"},
        {f:[9,7],t:[3,7],c:"俥二進六，紅過河車積極壓制。"},
        {f:[2,7],t:[1,7],c:"包８退１，退包準備平７路打車。"},
        {f:[9,1],t:[7,2],c:"傌八進七，紅出左馬。"},
        {f:[1,7],t:[1,6],c:"包８平７，平包亮車邀兌，屏風馬經典反擊手段。"}
      ]
    },
    fangongma: {
      title: "近代定式：中炮對反宮馬",
      moves: [
        {f:[7,7],t:[7,4],c:"炮二平五，當頭炮。"},
        {f:[0,1],t:[2,2],c:"馬２進３，先跳左馬。"},
        {f:[9,7],t:[7,6],c:"傌二進三，紅跳正馬。"},
        {f:[2,7],t:[2,5],c:"包８平６，趁８路馬尚未跳出，先平６路形成士角炮！"},
        {f:[9,8],t:[9,7],c:"俥一平二，紅出直車。"},
        {f:[0,7],t:[2,6],c:"馬８進７，再跳右馬，正式構成「反宮馬」陣勢！"},
        {f:[6,6],t:[5,6],c:"兵三進一，挺三兵制馬。"},
        {f:[3,6],t:[4,6],c:"卒７進１，黑亦挺卒活馬。"},
        {f:[7,1],t:[7,3],c:"炮八平六，紅先架仕角炮呼應。"},
        {f:[0,8],t:[0,7],c:"車９平８，黑亮直車。"},
        {f:[9,1],t:[7,2],c:"傌八進七，紅再跳左馬，子力協調。"},
        {f:[0,3],t:[1,4],c:"士４進５，鞏固中防。"}
      ]
    },
    huronghua: {
      title: "宗師名局：胡榮華「飛相局」對左中炮",
      moves: [
        {f:[9,6],t:[7,4],c:"相三進五，胡榮華招牌「飛相局」，以柔克剛。"},
        {f:[2,1],t:[2,4],c:"包２平５，黑架左中炮強攻。"},
        {f:[9,7],t:[7,6],c:"傌二進三，紅跳右馬護中。"},
        {f:[0,1],t:[2,2],c:"馬２進３，黑跳左馬。"},
        {f:[9,8],t:[9,7],c:"俥一平二，紅亮直車。"},
        {f:[0,0],t:[0,1],c:"車１平２，黑出直車。"},
        {f:[6,6],t:[5,6],c:"兵三進一，紅挺三兵制馬。"},
        {f:[0,7],t:[2,8],c:"馬８進９，黑跳邊馬避開紅兵壓制。"},
        {f:[7,1],t:[7,3],c:"炮八平六，紅先架仕角炮轉守為攻。"},
        {f:[3,2],t:[4,2],c:"卒３進１，黑挺３路卒對攻。"},
        {f:[9,1],t:[7,2],c:"傌八進七，紅再出左馬。"},
        {f:[0,8],t:[0,7],c:"車９平８，黑雙車盡出。"}
      ]
    },
    yangguanlin: {
      title: "宗師名局：楊官璘「中炮對左馬盤河」",
      moves: [
        {f:[7,7],t:[7,4],c:"炮二平五，當頭炮開局。"},
        {f:[0,7],t:[2,6],c:"馬８進７，黑跳左正馬。"},
        {f:[9,7],t:[7,6],c:"傌二進三，紅跳右馬。"},
        {f:[3,6],t:[4,6],c:"卒７進１，制馬挺卒開通馬路。"},
        {f:[9,8],t:[9,7],c:"俥一平二，紅出直車。"},
        {f:[0,1],t:[2,2],c:"馬２進３，黑成屏風馬。"},
        {f:[6,2],t:[5,2],c:"兵七進一，紅挺七兵。"},
        {f:[2,6],t:[4,5],c:"馬７進６，黑躍「左馬盤河」，極具侵略性！"},
        {f:[9,7],t:[3,7],c:"俥二進六，紅車過河壓制。"},
        {f:[0,8],t:[1,8],c:"車９進１，黑起橫車護肋。"},
        {f:[9,1],t:[7,2],c:"傌八進七，紅跳左馬。"},
        {f:[1,8],t:[1,5],c:"車９平６，黑車佔肋保護盤河馬。"}
      ]
    },
    xianren: {
      title: "當代流行：仙人指路對卒底炮",
      moves: [
        {f:[6,2],t:[5,2],c:"兵七進一，「仙人指路」試探虛實。"},
        {f:[2,1],t:[2,2],c:"包２平３，「卒底炮」針鋒相對，瞄準紅方七路兵。"},
        {f:[7,1],t:[7,4],c:"炮八平五，紅架左中炮反擊中路。"},
        {f:[0,7],t:[2,6],c:"馬８進７，黑跳右正馬保護中卒。"},
        {f:[9,1],t:[7,2],c:"傌八進七，紅跳左馬護兵。"},
        {f:[0,8],t:[0,7],c:"車９平８，黑亮右直車。"},
        {f:[9,0],t:[9,1],c:"俥九平八，紅出左直車。"},
        {f:[0,1],t:[2,0],c:"馬２進１，黑跳左邊馬亮左車。"},
        {f:[9,7],t:[7,6],c:"傌二進三，紅雙正馬齊出。"},
        {f:[0,0],t:[1,0],c:"車１進１，黑起左橫車準備調動。"},
        {f:[9,8],t:[8,8],c:"俥一進一，紅亦起右橫車呼應。"},
        {f:[1,0],t:[1,3],c:"車１平４，黑橫車佔據四路肋道。"}
      ]
    }
  };

  function initBoard() {
    const b = Array.from({length:10}, () => Array(9).fill(null));
    const setup = (row, side) => {
      const order = ['R','N','B','A','K','A','B','N','R'];
      order.forEach((t, c) => b[row][c] = {s: side, t});
    };
    setup(0, 'B');
    b[2][1] = {s:'B', t:'C'}; b[2][7] = {s:'B', t:'C'};
    [0,2,4,6,8].forEach(c => b[3][c] = {s:'B', t:'P'});
    setup(9, 'R');
    b[7][1] = {s:'R', t:'C'}; b[7][7] = {s:'R', t:'C'};
    [0,2,4,6,8].forEach(c => b[6][c] = {s:'R', t:'P'});
    return b;
  }

  function cloneBoard(b) { return b.map(r => r.map(c => c ? {...c} : null)); }

  const KNIGHT_MOVES = [
    [-2, -1, -1,  0], [-2,  1, -1,  0], [ 2, -1,  1,  0], [ 2,  1,  1,  0],
    [-1, -2,  0, -1], [ 1, -2,  0, -1], [-1,  2,  0,  1], [ 1,  2,  0,  1]
  ];
  const BISHOP_MOVES = [[-2, -2, -1, -1], [-2, 2, -1, 1], [2, -2, 1, -1], [2, 2, 1, 1]];
  const ADVISOR_MOVES = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const KNIGHT_CHECK_OFFSETS = [
    [-2, -1, -1, -1], [-2,  1, -1,  1], [ 2, -1,  1, -1], [ 2,  1,  1,  1],
    [-1, -2, -1, -1], [ 1, -2,  1, -1], [-1,  2, -1,  1], [ 1,  2,  1,  1]
  ];
  const ORTHO_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  function getPseudoMoves(board, r, c) {
    const p = board[r][c];
    if (!p) return [];
    const moves = [];
    const s = p.s, t = p.t;
    if (t === 'R') {
      for (let d = 0; d < 4; d++) {
        const dr = ORTHO_DIRS[d][0], dc = ORTHO_DIRS[d][1];
        let nr = r + dr, nc = c + dc;
        while (nr >= 0 && nr <= 9 && nc >= 0 && nc <= 8) {
          const target = board[nr][nc];
          if (!target) {
            moves.push([nr, nc]);
          } else {
            if (target.s !== s) moves.push([nr, nc]);
            break;
          }
          nr += dr; nc += dc;
        }
      }
    } else if (t === 'C') {
      for (let d = 0; d < 4; d++) {
        const dr = ORTHO_DIRS[d][0], dc = ORTHO_DIRS[d][1];
        let jumped = false;
        let nr = r + dr, nc = c + dc;
        while (nr >= 0 && nr <= 9 && nc >= 0 && nc <= 8) {
          const target = board[nr][nc];
          if (!jumped) {
            if (!target) moves.push([nr, nc]);
            else jumped = true;
          } else if (target) {
            if (target.s !== s) moves.push([nr, nc]);
            break;
          }
          nr += dr; nc += dc;
        }
      }
    } else if (t === 'N') {
      for (let i = 0; i < 8; i++) {
        const m = KNIGHT_MOVES[i];
        const lr = r + m[2], lc = c + m[3];
        if (lr >= 0 && lr <= 9 && lc >= 0 && lc <= 8 && !board[lr][lc]) {
          const nr = r + m[0], nc = c + m[1];
          if (nr >= 0 && nr <= 9 && nc >= 0 && nc <= 8) {
            const target = board[nr][nc];
            if (!target || target.s !== s) moves.push([nr, nc]);
          }
        }
      }
    } else if (t === 'B') {
      for (let i = 0; i < 4; i++) {
        const m = BISHOP_MOVES[i];
        const nr = r + m[0], nc = c + m[1];
        if (nr < 0 || nr > 9 || nc < 0 || nc > 8) continue;
        if ((s === 'R' && nr < 5) || (s === 'B' && nr > 4)) continue;
        if (!board[r + m[2]][c + m[3]]) {
          const target = board[nr][nc];
          if (!target || target.s !== s) moves.push([nr, nc]);
        }
      }
    } else if (t === 'A') {
      for (let i = 0; i < 4; i++) {
        const nr = r + ADVISOR_MOVES[i][0], nc = c + ADVISOR_MOVES[i][1];
        if (nc < 3 || nc > 5) continue;
        if ((s === 'R' && (nr < 7 || nr > 9)) || (s === 'B' && (nr < 0 || nr > 2))) continue;
        const target = board[nr][nc];
        if (!target || target.s !== s) moves.push([nr, nc]);
      }
    } else if (t === 'K') {
      for (let i = 0; i < 4; i++) {
        const nr = r + ORTHO_DIRS[i][0], nc = c + ORTHO_DIRS[i][1];
        if (nc < 3 || nc > 5) continue;
        if ((s === 'R' && (nr < 7 || nr > 9)) || (s === 'B' && (nr < 0 || nr > 2))) continue;
        const target = board[nr][nc];
        if (!target || target.s !== s) moves.push([nr, nc]);
      }
    } else if (t === 'P') {
      const nr = r + (s === 'R' ? -1 : 1);
      if (nr >= 0 && nr <= 9) {
        const target = board[nr][c];
        if (!target || target.s !== s) moves.push([nr, c]);
      }
      if ((s === 'R' && r <= 4) || (s === 'B' && r >= 5)) {
        if (c > 0 && (!board[r][c - 1] || board[r][c - 1].s !== s)) moves.push([r, c - 1]);
        if (c < 8 && (!board[r][c + 1] || board[r][c + 1].s !== s)) moves.push([r, c + 1]);
      }
    }
    return moves;
  }

  function hasKing(board, side) {
    for (let r=0; r<10; r++) {
      for (let c=0; c<9; c++) {
        if (board[r][c] && board[r][c].s === side && board[r][c].t === 'K') return true;
      }
    }
    return false;
  }

  function isInCheck(board, side) {
    let kr = -1, kc = -1;
    for (let r = 0; r < 10; r++) {
      const row = board[r];
      for (let c = 0; c < 9; c++) {
        const p = row[c];
        if (p && p.s === side && p.t === 'K') {
          kr = r; kc = c; break;
        }
      }
      if (kr !== -1) break;
    }
    if (kr === -1) return true;
    const opp = side === 'R' ? 'B' : 'R';

    for (let d = 0; d < 4; d++) {
      const dr = ORTHO_DIRS[d][0], dc = ORTHO_DIRS[d][1];
      let jumped = false;
      let r = kr + dr, c = kc + dc;
      while (r >= 0 && r <= 9 && c >= 0 && c <= 8) {
        const p = board[r][c];
        if (p) {
          if (!jumped) {
            if (p.s === opp && (p.t === 'R' || p.t === 'K')) return true;
            jumped = true;
          } else {
            if (p.s === opp && p.t === 'C') return true;
            break;
          }
        }
        r += dr;
        c += dc;
      }
    }

    for (let i = 0; i < 8; i++) {
      const off = KNIGHT_CHECK_OFFSETS[i];
      const nr = kr + off[0], nc = kc + off[1];
      if (nr >= 0 && nr <= 9 && nc >= 0 && nc <= 8) {
        const p = board[nr][nc];
        if (p && p.s === opp && p.t === 'N') {
          if (!board[kr + off[2]][kc + off[3]]) return true;
        }
      }
    }

    const pDir = opp === 'R' ? 1 : -1;
    const pr = kr + pDir;
    if (pr >= 0 && pr <= 9) {
      const p = board[pr][kc];
      if (p && p.s === opp && p.t === 'P') return true;
    }
    if (kc > 0) {
      const p = board[kr][kc - 1];
      if (p && p.s === opp && p.t === 'P') return true;
    }
    if (kc < 8) {
      const p = board[kr][kc + 1];
      if (p && p.s === opp && p.t === 'P') return true;
    }
    return false;
  }

  function getLegalMoves(board, r, c) {
    const p = board[r][c];
    if (!p) return [];
    return getPseudoMoves(board, r, c).filter(([tr, tc]) => {
      const nextB = cloneBoard(board);
      nextB[tr][tc] = nextB[r][c];
      nextB[r][c] = null;
      return !isInCheck(nextB, p.s);
    });
  }

  function hasAnyLegalMove(board, side) {
    if (!hasKing(board, side)) return false;
    for (let r=0; r<10; r++) {
      for (let c=0; c<9; c++) {
        if (board[r][c] && board[r][c].s === side) {
          if (getLegalMoves(board, r, c).length > 0) return true;
        }
      }
    }
    return false;
  }

  function evaluateGameState(board, turn) {
    if (!hasKing(board, 'R')) return { over: true, winner: 'B', reason: '帥被吃，黑方勝！' };
    if (!hasKing(board, 'B')) return { over: true, winner: 'R', reason: '將被吃，紅方勝！' };
    if (!hasAnyLegalMove(board, turn)) {
      const inCheck = isInCheck(board, turn);
      const winner = turn === 'R' ? 'B' : 'R';
      const winName = winner === 'R' ? '紅方勝' : '黑方勝';
      return {
        over: true,
        winner,
        reason: inCheck ? `絕殺！${winName}` : `困斃！${winName}`
      };
    }
    return { over: false, inCheck: isInCheck(board, turn) };
  }

  function getNotation(board, fr, fc, tr, tc) {
    const p = board[fr][fc];
    const name = PIECE_NAMES[p.s][p.t];
    const fileFrom = p.s === 'R' ? 9 - fc : fc + 1;
    const fileTo = p.s === 'R' ? 9 - tc : tc + 1;
    const numFmt = p.s === 'R' ? NUM_CN : NUM_FW;
    const dist = Math.abs(tr - fr);
    let dir = '';
    if (tr === fr) dir = '平';
    else if ((p.s === 'R' && tr < fr) || (p.s === 'B' && tr > fr)) dir = '進';
    else dir = '退';
    const target = (tr === fr || ['N','B','A'].includes(p.t)) ? numFmt[fileTo] : numFmt[dist];
    return `${name}${numFmt[fileFrom]}${dir}${target}`;
  }

  const AI_PROFILES = {
    1: {
      name: '林小軒',
      title: '街頭棋童',
      badge: 'Lv.1｜5 層算力',
      depth: 5, useTactics: true, qMax: 3, jitter: 6, timeMs: 450,
      bio: '巷口雜貨店十一歲神童，酷愛快攻飛刀與當頭炮猛衝。攻勢凌厲但偶爾忽略後防空隙。'
    },
    2: {
      name: '陳鐵山',
      title: '公園擂台主',
      badge: 'Lv.2｜8 層算力',
      depth: 8, useTactics: true, qMax: 6, jitter: 0, timeMs: 1100,
      bio: '縱橫榕樹下三十年的快棋霸主，精通屏風馬與馬炮殘局，棄子搶攻毫不手軟。'
    },
    3: {
      name: '沈滄海',
      title: '省冠國手',
      badge: 'Lv.3｜12 層算力',
      depth: 12, useTactics: true, qMax: 10, jitter: 0, timeMs: 1800,
      bio: '沉穩內斂的省賽冠軍國手，開局雙車出動極快，中盤陣型厚實、攻守如淵。'
    },
    4: {
      name: '顧千帆',
      title: '特級宗師',
      badge: 'Lv.4｜14 層算力',
      depth: 14, useTactics: true, qMax: 12, jitter: 0, timeMs: 2400,
      bio: '殿堂級特級大師，深諳九宮氣數與子力協同。對臥槽馬、鐵門栓與悶宮殺機有極致嗅覺。'
    },
    5: {
      name: '天璣玄極',
      title: '深算棋神',
      badge: 'Lv.5｜16 層極限算力',
      depth: 16, useTactics: true, qMax: 14, jitter: 0, timeMs: 3200,
      bio: '融合大型置換表與將軍延伸的終極引擎。算度深不可測，任何微小破綻皆化為絕殺。'
    }
  };

  const PIECE_VAL = { K: 10000, R: 950, C: 450, N: 430, B: 210, A: 210, P: 100 };
  const PST_P = [
    [ 40,  60,  80, 110, 120, 110,  80,  60,  40],
    [ 90, 130, 170, 230, 260, 230, 170, 130,  90],
    [100, 140, 185, 225, 245, 225, 185, 140, 100],
    [ 90, 120, 155, 185, 195, 185, 155, 120,  90],
    [ 70,  90, 115, 135, 145, 135, 115,  90,  70],
    [  0,   0,  22,   0,  28,   0,  22,   0,   0],
    [-15,   0,   4,   0,   8,   0,   4,   0, -15],
    [  0,   0,   0,   0,   0,   0,   0,   0,   0],
    [  0,   0,   0,   0,   0,   0,   0,   0,   0],
    [  0,   0,   0,   0,   0,   0,   0,   0,   0]
  ];
  const PST_N = [
    [-20, -10,   0,   5,   5,   5,   0, -10, -20],
    [-10,  15,  65,  50,  35,  50,  65,  15, -10],
    [  0,  25,  50,  72,  60,  72,  50,  25,   0],
    [  5,  25,  45,  58,  52,  58,  45,  25,   5],
    [  5,  20,  35,  48,  42,  48,  35,  20,   5],
    [  0,  15,  30,  36,  35,  36,  30,  15,   0],
    [ -5,  10,  20,  25,  20,  25,  20,  10,  -5],
    [-10,   5,  28,  15,   8,  15,  28,   5, -10],
    [-15, -10,   0, -15, -95, -15,   0, -10, -15],
    [-35, -25, -20, -65, -45, -65, -20, -25, -35]
  ];
  const PST_R = [
    [ 30,  45,  40,  60,  55,  60,  40,  45,  30],
    [ 35,  55,  50,  70,  65,  70,  50,  55,  35],
    [ 25,  40,  35,  55,  50,  55,  35,  40,  25],
    [ 30,  45,  40,  55,  50,  55,  40,  45,  30],
    [ 25,  35,  35,  45,  40,  45,  35,  35,  25],
    [ 20,  35,  30,  45,  38,  45,  30,  35,  20],
    [ 10,  25,  20,  35,  25,  35,  20,  25,  10],
    [ 10,  25,  15,  32,  25,  32,  15,  25,  10],
    [  5,  25,  15,  30,  15,  30,  15,  25,   5],
    [-40,  38,  10,  32,  15,  32,  10,  38, -40]
  ];
  const PST_C = [
    [ 35,  35,  25,  40,  50,  40,  25,  35,  35],
    [ 15,  20,  20,  25,  40,  25,  20,  20,  15],
    [ 15,  20,  25,  30,  45,  30,  25,  20,  15],
    [  5,  10,  18,  25,  42,  25,  18,  10,   5],
    [  5,  10,  18,  25,  38,  25,  18,  10,   5],
    [  8,  12,  18,  25,  35,  25,  18,  12,   8],
    [  5,  10,  15,  20,  32,  20,  15,  10,   5],
    [ 15,  22,  18,  25,  40,  25,  18,  22,  15],
    [  5,  10,   5,  10,  15,  10,   5,  10,   5],
    [  0,   5,   5,  10,  15,  10,   5,   5,   0]
  ];

  const PIECE_IDX = { R_K:0, R_A:1, R_B:2, R_N:3, R_R:4, R_C:5, R_P:6, B_K:7, B_A:8, B_B:9, B_N:10, B_R:11, B_C:12, B_P:13 };
  const ZOBRIST_LO = Array.from({ length: 14 }, () => new Uint32Array(90));
  const ZOBRIST_HI = Array.from({ length: 14 }, () => new Uint32Array(90));
  let Z_SIDE_LO = 0, Z_SIDE_HI = 0;
  (function initZobrist() {
    let seed = 0x9E3779B9;
    const nextRand = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return seed >>> 0;
    };
    for (let p = 0; p < 14; p++) {
      for (let sq = 0; sq < 90; sq++) {
        ZOBRIST_LO[p][sq] = nextRand();
        ZOBRIST_HI[p][sq] = nextRand();
      }
    }
    Z_SIDE_LO = nextRand();
    Z_SIDE_HI = nextRand();
  })();

  function computeBoardHash(board, turn) {
    let lo = turn === 'B' ? Z_SIDE_LO : 0;
    let hi = turn === 'B' ? Z_SIDE_HI : 0;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = board[r][c];
        if (!p) continue;
        const idx = PIECE_IDX[p.s + '_' + p.t];
        const sq = r * 9 + c;
        lo = (lo ^ ZOBRIST_LO[idx][sq]) >>> 0;
        hi = (hi ^ ZOBRIST_HI[idx][sq]) >>> 0;
      }
    }
    return [lo, hi];
  }

  const TT_BITS = 19;
  const TT_SIZE = 1 << TT_BITS;
  const TT_MASK = TT_SIZE - 1;
  let ttKeyLo = null, ttKeyHi = null, ttDepth = null, ttFlag = null, ttScore = null, ttBestMove = null;
  function ensureTT() {
    if (ttKeyLo) return;
    ttKeyLo = new Uint32Array(TT_SIZE);
    ttKeyHi = new Uint32Array(TT_SIZE);
    ttDepth = new Int8Array(TT_SIZE);
    ttFlag = new Uint8Array(TT_SIZE);
    ttScore = new Int32Array(TT_SIZE);
    ttBestMove = new Uint16Array(TT_SIZE);
  }
  const killerMove1 = new Uint16Array(32);
  const killerMove2 = new Uint16Array(32);
  const historyHeuristic = new Int32Array(90 * 90);
  let searchNodes = 0;
  let searchAborted = false;
  const pathHashLo = new Uint32Array(64);
  let gameHashSet = new Set();

  function encodeMove(fr, fc, tr, tc) {
    return ((fr * 9 + fc) << 7) | (tr * 9 + tc);
  }

  function getPstBonus(p, r, c) {
    const rr = p.s === 'R' ? r : 9 - r;
    const cc = p.s === 'R' ? c : 8 - c;
    if (p.t === 'P') return PST_P[rr][cc];
    if (p.t === 'N') return PST_N[rr][cc];
    if (p.t === 'R') return PST_R[rr][cc];
    if (p.t === 'C') return PST_C[rr][cc];
    if (p.t === 'A') return (rr === 8 && cc === 4) ? 32 : 8;
    if (p.t === 'B') return (rr === 7 && cc === 4) ? 32 : 8;
    if (p.t === 'K') return (rr === 9 && cc === 4) ? 25 : 0;
    return 0;
  }

  function evaluateBoard(board, useTactics = true) {
    let score = 0;
    let rRooks = 0, bRooks = 0, rCannons = 0, bCannons = 0;
    let rAdv = 0, bAdv = 0, rBish = 0, bBish = 0;
    let rKr = 9, rKc = 4, bKr = 0, bKc = 4;
    let rDevRooks = 0, bDevRooks = 0;
    let rDevHorses = 0, bDevHorses = 0;

    for (let r = 0; r < 10; r++) {
      const row = board[r];
      for (let c = 0; c < 9; c++) {
        const p = row[c];
        if (!p) continue;
        const val = PIECE_VAL[p.t] + getPstBonus(p, r, c);
        if (p.s === 'R') {
          score += val;
          if (p.t === 'R') {
            rRooks++;
            if (!(r === 9 && (c === 0 || c === 8))) rDevRooks++;
          } else if (p.t === 'N') {
            if (!(r === 9 && (c === 1 || c === 7))) rDevHorses++;
          } else if (p.t === 'C') rCannons++;
          else if (p.t === 'A') rAdv++;
          else if (p.t === 'B') rBish++;
          else if (p.t === 'K') { rKr = r; rKc = c; }
        } else {
          score -= val;
          if (p.t === 'R') {
            bRooks++;
            if (!(r === 0 && (c === 0 || c === 8))) bDevRooks++;
          } else if (p.t === 'N') {
            if (!(r === 0 && (c === 1 || c === 7))) bDevHorses++;
          } else if (p.t === 'C') bCannons++;
          else if (p.t === 'A') bAdv++;
          else if (p.t === 'B') bBish++;
          else if (p.t === 'K') { bKr = r; bKc = c; }
        }
      }
    }

    if (!useTactics) return score;

    // 1. 仕相全與缺仕怕雙車、缺相怕炮
    if (rAdv === 2 && rBish === 2) score += 40;
    if (bAdv === 2 && bBish === 2) score -= 40;
    if (rAdv < 2 && bRooks > 0) score -= (2 - rAdv) * bRooks * 105;
    if (bAdv < 2 && rRooks > 0) score += (2 - bAdv) * rRooks * 105;
    if (rBish < 2 && bCannons > 0) score -= (2 - rBish) * 70;
    if (bBish < 2 && rCannons > 0) score += (2 - bBish) * 70;

    // 2. 九宮將帥氣數（防止馬/士塞死將門遭臥槽馬或悶宮一擊必殺）
    let rLiberties = 0, bLiberties = 0;
    if (rKr > 7 && !board[rKr - 1][rKc]) rLiberties++;
    if (rKr < 9 && !board[rKr + 1][rKc]) rLiberties++;
    if (rKc > 3 && !board[rKr][rKc - 1]) rLiberties++;
    if (rKc < 5 && !board[rKr][rKc + 1]) rLiberties++;
    if (bKr > 0 && !board[bKr - 1][bKc]) bLiberties++;
    if (bKr < 2 && !board[bKr + 1][bKc]) bLiberties++;
    if (bKc > 3 && !board[bKr][bKc - 1]) bLiberties++;
    if (bKc < 5 && !board[bKr][bKc + 1]) bLiberties++;
    if (rLiberties === 0) score -= 165;
    else if (rLiberties === 1) score -= 45;
    if (bLiberties === 0) score += 165;
    else if (bLiberties === 1) score += 45;

    // 3. 戰術大腦：攻王緊湊度、空頭炮／鎮中牽制／鐵門栓、臥槽掛角馬、憋馬腿、孤炮貪吃懲罰
    for (let r = 0; r < 10; r++) {
      const row = board[r];
      for (let c = 0; c < 9; c++) {
        const p = row[c];
        if (!p || p.t === 'K' || p.t === 'A' || p.t === 'B') continue;
        const isRed = p.s === 'R';
        const sign = isRed ? 1 : -1;
        const oppKr = isRed ? bKr : rKr;
        const oppKc = isRed ? bKc : rKc;
        const oppLib = isRed ? bLiberties : rLiberties;
        const distToKing = Math.abs(r - oppKr) + Math.abs(c - oppKc);

        if (p.t === 'N') {
          let openLegs = 0;
          if (r > 0 && !board[r - 1][c]) openLegs++;
          if (r < 9 && !board[r + 1][c]) openLegs++;
          if (c > 0 && !board[r][c - 1]) openLegs++;
          if (c < 8 && !board[r][c + 1]) openLegs++;
          if (openLegs === 0) score -= sign * 80;
          else if (openLegs === 1) score -= sign * 35;
          else if (openLegs >= 3) score += sign * 22;

          // 攻王緊湊度 + 臥槽馬／掛角馬（若敵方九宮氣數不足則殺傷力倍增）
          score += sign * Math.max(0, 11 - distToKing) * 7;
          const rr = isRed ? r : 9 - r;
          if (rr === 8 && c === 4) {
            score -= sign * 120; // 窩心馬塞死九宮中樞重罰
          } else if (rr === 1 && (c === 2 || c === 6) && !board[isRed ? 1 : 8][c === 2 ? 3 : 5]) {
            score += sign * (oppLib <= 1 ? 160 : 85); // 臥槽馬
          } else if (rr === 2 && (c === 3 || c === 5)) {
            score += sign * (oppLib <= 1 ? 110 : 55); // 掛角馬
          } else if (rr === 3 && (c === 2 || c === 3 || c === 5 || c === 6)) {
            score += sign * (oppLib <= 1 ? 65 : 30);  // 準臥槽躍馬威脅
          }
        } else if (p.t === 'R') {
          score += sign * Math.max(0, 12 - distToKing) * 7;
          let blocked = false;
          if (isRed) {
            for (let rr = r - 1; rr >= 3; rr--) if (board[rr][c]) { blocked = true; break; }
            if (!blocked) score += 42;
            if (r <= 2 && c >= 2 && c <= 6) score += 48;
          } else {
            for (let rr = r + 1; rr <= 6; rr++) if (board[rr][c]) { blocked = true; break; }
            if (!blocked) score -= 42;
            if (r >= 7 && c >= 2 && c <= 6) score -= 48;
          }
          // 車對敵帥同線絕對牽制
          if (c === oppKc) {
            const lo = Math.min(r, oppKr), hi = Math.max(r, oppKr);
            let cnt = 0, pinnedP = null;
            for (let rr = lo + 1; rr < hi; rr++) {
              if (board[rr][c]) { cnt++; pinnedP = board[rr][c]; }
            }
            if (cnt === 1 && pinnedP && pinnedP.s !== p.s) {
              score += sign * (pinnedP.t === 'N' || pinnedP.t === 'C' ? 120 : 80);
            }
          }
        } else if (p.t === 'C') {
          score += sign * Math.max(0, 11 - distToKing) * 4;
          // 防止「雙車未出、孤炮過河貪吃邊兵」或「單馬未出急架中炮」
          if (isRed) {
            if (r <= 4 && rDevRooks === 0 && rRooks > 0) score -= 70;
            else if (r <= 4 && rDevRooks === 1 && rRooks === 2 && (c === 0 || c === 8)) score -= 45;
            if (r === 7 && c === 4 && rDevHorses < 2 && board[2][4] && board[2][4].s === 'B' && board[2][4].t === 'C') score -= 40;
          } else {
            if (r >= 5 && bDevRooks === 0 && bRooks > 0) score += 70;
            else if (r >= 5 && bDevRooks === 1 && bRooks === 2 && (c === 0 || c === 8)) score += 45;
            if (r === 2 && c === 4 && bDevHorses < 2 && board[7][4] && board[7][4].s === 'R' && board[7][4].t === 'C') score += 40;
          }
          if (c === oppKc) {
            const lo = Math.min(r, oppKr), hi = Math.max(r, oppKr);
            let between = 0, woxinHorse = false;
            for (let rr = lo + 1; rr < hi; rr++) {
              const bp = board[rr][c];
              if (bp) {
                between++;
                if (bp.s !== p.s && bp.t === 'N' && (rr === 1 || rr === 8) && c === 4) woxinHorse = true;
              }
            }
            if (between === 0 && hi - lo >= 2) score += sign * 240; // 空頭炮
            else if (between === 1) score += sign * 95;             // 當頭炮將軍威脅
            else if (between === 2) {
              score += sign * (woxinHorse ? 220 : 60);              // 鎮中牽制 / 窩心馬被栓重罰
              if ((isRed && rRooks > 0) || (!isRed && bRooks > 0)) score += sign * 45; // 鐵門栓配合威脅
            }
          }
          if ((isRed && r === 0) || (!isRed && r === 9)) score += sign * 50; // 沉底炮
        } else if (p.t === 'P') {
          if ((isRed && r <= 4) || (!isRed && r >= 5)) {
            score += sign * Math.max(0, 9 - distToKing) * 8;
            if (c < 8 && board[r][c + 1] && board[r][c + 1].s === p.s && board[r][c + 1].t === 'P') {
              score += sign * 35; // 過河連環兵
            }
          }
        }
      }
    }
    return score;
  }

  function generateOrderedMoves(board, side, ply, ttMove, capturesOnly) {
    const moves = [];
    const k1 = killerMove1[ply] || 0;
    const k2 = killerMove2[ply] || 0;
    const oppSide = side === 'R' ? 'B' : 'R';
    let oppKr = oppSide === 'R' ? 9 : 0, oppKc = 4;
    for (let r = (oppSide === 'R' ? 7 : 0); r <= (oppSide === 'R' ? 9 : 2); r++) {
      for (let c = 3; c <= 5; c++) {
        const kp = board[r][c];
        if (kp && kp.s === oppSide && kp.t === 'K') { oppKr = r; oppKc = c; break; }
      }
    }

    for (let r = 0; r < 10; r++) {
      const row = board[r];
      for (let c = 0; c < 9; c++) {
        const p = row[c];
        if (!p || p.s !== side) continue;
        const pseudo = getPseudoMoves(board, r, c);
        for (let i = 0; i < pseudo.length; i++) {
          const tr = pseudo[i][0], tc = pseudo[i][1];
          const target = board[tr][tc];
          if (capturesOnly && !target) continue;
          const code = encodeMove(r, c, tr, tc);
          let orderScore = 0;
          if (code === ttMove) {
            orderScore = 2000000;
          } else if (target) {
            orderScore = 200000 + PIECE_VAL[target.t] * 12 - PIECE_VAL[p.t];
          } else {
            if (code === k1) orderScore = 150000;
            else if (code === k2) orderScore = 140000;
            else {
              orderScore = Math.min(85000, historyHeuristic[(r * 9 + c) * 90 + (tr * 9 + tc)]) + (getPstBonus(p, tr, tc) - getPstBonus(p, r, c));
              // 優先排序對敵將的臥槽馬、掛角馬與車炮同線叫將威脅
              if (p.t === 'N') {
                const dr = Math.abs(tr - oppKr), dc = Math.abs(tc - oppKc);
                if ((dr === 2 && dc === 1) || (dr === 1 && dc === 2)) orderScore += 95000;
              } else if ((p.t === 'R' || p.t === 'C') && (tr === oppKr || tc === oppKc)) {
                orderScore += 55000;
              }
            }
          }
          moves.push({ fr: r, fc: c, tr, tc, code, orderScore });
        }
      }
    }
    moves.sort((a, b) => b.orderScore - a.orderScore);
    return moves;
  }

  function getAllLegalMoves(board, side, capturesOnly = false, ttMove = 0) {
    const pseudo = generateOrderedMoves(board, side, 0, ttMove, capturesOnly);
    const legal = [];
    for (let i = 0; i < pseudo.length; i++) {
      const m = pseudo[i];
      const mover = board[m.fr][m.fc];
      const captured = board[m.tr][m.tc];
      board[m.tr][m.tc] = mover;
      board[m.fr][m.fc] = null;
      const safe = !isInCheck(board, side);
      board[m.fr][m.fc] = mover;
      board[m.tr][m.tc] = captured;
      if (safe) legal.push(m);
    }
    return legal;
  }

  function quiesce(board, alpha, beta, turn, qDepth, ply, useTactics, deadline) {
    searchNodes++;
    if ((searchNodes & 511) === 0 && performance.now() > deadline) {
      searchAborted = true;
      return 0;
    }
    const inChk = isInCheck(board, turn);
    if (!inChk) {
      const standPat = evaluateBoard(board, useTactics) * (turn === 'R' ? 1 : -1);
      if (standPat >= beta) return beta;
      if (standPat > alpha) alpha = standPat;
      if (qDepth <= 0) return standPat;
    } else if (qDepth <= -3) {
      return evaluateBoard(board, useTactics) * (turn === 'R' ? 1 : -1);
    }

    const moves = generateOrderedMoves(board, turn, ply, 0, !inChk);
    const nextTurn = turn === 'R' ? 'B' : 'R';
    let legalCount = 0;

    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const mover = board[m.fr][m.fc];
      const captured = board[m.tr][m.tc];
      if (captured && captured.t === 'K') return 19500 - ply * 10;

      board[m.tr][m.tc] = mover;
      board[m.fr][m.fc] = null;
      if (isInCheck(board, turn)) {
        board[m.fr][m.fc] = mover;
        board[m.tr][m.tc] = captured;
        continue;
      }
      legalCount++;
      const score = -quiesce(board, -beta, -alpha, nextTurn, qDepth - 1, ply + 1, useTactics, deadline);
      board[m.fr][m.fc] = mover;
      board[m.tr][m.tc] = captured;

      if (searchAborted) return 0;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }

    if (inChk && legalCount === 0) return -19000 + ply * 10;
    return alpha;
  }

  function negamax(board, depth, alpha, beta, turn, ply, hLo, hHi, allowNull, useTactics, qMax, deadline, inChkKnown = null) {
    searchNodes++;
    if ((searchNodes & 511) === 0 && performance.now() > deadline) {
      searchAborted = true;
      return 0;
    }

    // 循環重複局面檢測（防止優勢時無意義來回長捉或長將）
    if (ply > 0 && allowNull) {
      if (gameHashSet.has(hLo)) return -35;
      for (let p = ply - 2; p >= 0; p -= 2) {
        if (pathHashLo[p] === hLo) return -35;
      }
    }
    if (ply < 64) pathHashLo[ply] = hLo;

    const inChk = inChkKnown !== null ? inChkKnown : isInCheck(board, turn);
    if (inChk && ply < 30) depth++;

    if (depth <= 0) {
      if (qMax > 0) return quiesce(board, alpha, beta, turn, qMax, ply, useTactics, deadline);
      return evaluateBoard(board, useTactics) * (turn === 'R' ? 1 : -1);
    }

    const origAlpha = alpha;
    const ttIdx = hLo & TT_MASK;
    let ttMove = 0;
    if (ttDepth[ttIdx] > 0 && ttKeyLo[ttIdx] === hLo && ttKeyHi[ttIdx] === hHi) {
      ttMove = ttBestMove[ttIdx];
      if (ttDepth[ttIdx] >= depth && ply > 0) {
        const tts = ttScore[ttIdx];
        const flg = ttFlag[ttIdx];
        if (flg === 1) return tts;
        if (flg === 2 && tts >= beta) return tts;
        if (flg === 3 && tts <= alpha) return tts;
      }
    }

    const nextTurn = turn === 'R' ? 'B' : 'R';

    // Null-Move Pruning (空著裁剪)
    if (allowNull && !inChk && depth >= 3 && ply > 0) {
      const nullR = depth >= 6 ? 3 : 2;
      const nullScore = -negamax(
        board, depth - 1 - nullR, -beta, -beta + 1, nextTurn, ply + 1,
        (hLo ^ Z_SIDE_LO) >>> 0, (hHi ^ Z_SIDE_HI) >>> 0,
        false, useTactics, qMax, deadline, false
      );
      if (ply < 64) pathHashLo[ply] = hLo;
      if (searchAborted) return 0;
      if (nullScore >= beta) return beta;
    }

    const moves = generateOrderedMoves(board, turn, ply, ttMove, false);
    let best = -Infinity;
    let bestCode = 0;
    let legalCount = 0;

    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const mover = board[m.fr][m.fc];
      const captured = board[m.tr][m.tc];
      if (captured && captured.t === 'K') return 19500 - ply * 10;

      board[m.tr][m.tc] = mover;
      board[m.fr][m.fc] = null;
      if (isInCheck(board, turn)) {
        board[m.fr][m.fc] = mover;
        board[m.tr][m.tc] = captured;
        continue;
      }
      legalCount++;

      const givesCheck = isInCheck(board, nextTurn);
      const pIdx = PIECE_IDX[mover.s + '_' + mover.t];
      const fromSq = m.fr * 9 + m.fc;
      const toSq = m.tr * 9 + m.tc;
      let nextLo = (hLo ^ ZOBRIST_LO[pIdx][fromSq] ^ ZOBRIST_LO[pIdx][toSq] ^ Z_SIDE_LO) >>> 0;
      let nextHi = (hHi ^ ZOBRIST_HI[pIdx][fromSq] ^ ZOBRIST_HI[pIdx][toSq] ^ Z_SIDE_HI) >>> 0;
      if (captured) {
        const cIdx = PIECE_IDX[captured.s + '_' + captured.t];
        nextLo = (nextLo ^ ZOBRIST_LO[cIdx][toSq]) >>> 0;
        nextHi = (nextHi ^ ZOBRIST_HI[cIdx][toSq]) >>> 0;
      }

      let score;
      if (legalCount === 1) {
        score = -negamax(board, depth - 1, -beta, -alpha, nextTurn, ply + 1, nextLo, nextHi, true, useTactics, qMax, deadline, givesCheck);
      } else {
        let reduction = 0;
        // 將軍著法 (givesCheck) 與吃子著法絕不減深，確保臥槽馬/悶宮殺棋不被 LMR 漏算
        if (legalCount >= 4 && depth >= 3 && !inChk && !givesCheck && !captured) {
          reduction = (legalCount >= 10 && depth >= 5) ? 2 : 1;
        }
        score = -negamax(board, depth - 1 - reduction, -alpha - 1, -alpha, nextTurn, ply + 1, nextLo, nextHi, true, useTactics, qMax, deadline, givesCheck);
        if (!searchAborted && score > alpha && reduction > 0) {
          score = -negamax(board, depth - 1, -alpha - 1, -alpha, nextTurn, ply + 1, nextLo, nextHi, true, useTactics, qMax, deadline, givesCheck);
        }
        if (!searchAborted && score > alpha && score < beta) {
          score = -negamax(board, depth - 1, -beta, -alpha, nextTurn, ply + 1, nextLo, nextHi, true, useTactics, qMax, deadline, givesCheck);
        }
      }

      board[m.fr][m.fc] = mover;
      board[m.tr][m.tc] = captured;

      if (searchAborted) return 0;

      if (score > best) {
        best = score;
        bestCode = m.code;
      }
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        if (!captured && ply < 32) {
          if (killerMove1[ply] !== m.code) {
            killerMove2[ply] = killerMove1[ply];
            killerMove1[ply] = m.code;
          }
          const hKey = fromSq * 90 + toSq;
          historyHeuristic[hKey] = Math.min(100000, historyHeuristic[hKey] + depth * depth * 12);
        }
        break;
      }
    }

    if (legalCount === 0) return -19000 + ply * 10;

    if (!searchAborted) {
      ttKeyLo[ttIdx] = hLo;
      ttKeyHi[ttIdx] = hHi;
      ttDepth[ttIdx] = depth;
      ttScore[ttIdx] = best;
      ttBestMove[ttIdx] = bestCode;
      ttFlag[ttIdx] = best <= origAlpha ? 3 : (best >= beta ? 2 : 1);
    }
    return best;
  }

  // 擴充實戰常見開局轉移定式（修正「1.炮二平五 馬２進３ 2.兵七進一」脫譜架中炮問題，支援左右鏡像）
  const EXTRA_BOOK_LINES = [
    {
      title: '中炮七路兵對屏風馬',
      moves: [
        { f: [7, 7], t: [7, 4], c: '炮二平五立中炮。' },
        { f: [0, 1], t: [2, 2], c: '馬２進３正馬應對。' },
        { f: [6, 2], t: [5, 2], c: '兵七進一先挺七路兵活馬。' },
        { f: [0, 7], t: [2, 6], c: '馬８進７穩健成屏風馬，不急於架空頭順炮。' },
        { f: [9, 7], t: [7, 6], c: '傌二進三正馬。' },
        { f: [3, 6], t: [4, 6], c: '卒７進１對挺七路卒制馬。' },
        { f: [9, 8], t: [9, 7], c: '俥一平二出直車。' },
        { f: [0, 8], t: [0, 7], c: '車９平８堂堂正正出直車。' }
      ]
    },
    {
      title: '中炮進三兵對屏風馬',
      moves: [
        { f: [7, 7], t: [7, 4], c: '炮二平五立中炮。' },
        { f: [0, 1], t: [2, 2], c: '馬２進３正馬。' },
        { f: [6, 6], t: [5, 6], c: '兵三進一挺三路兵。' },
        { f: [0, 7], t: [2, 6], c: '馬８進７成屏風馬雙馬護中。' },
        { f: [9, 7], t: [7, 6], c: '傌二進三出馬。' },
        { f: [3, 2], t: [4, 2], c: '卒３進１通馬路。' }
      ]
    }
  ];


  // ==================== 對局上下文（由呼叫端傳入，引擎本身不讀取任何 UI 狀態） ====================
  let ctxStep = 0;          // 目前是第幾步（0 = 開局）
  let ctxMoves = [];        // 第 1..ctxStep 步的 {fr, fc, tr, tc}
  let ctxPositions = [];    // 第 0..ctxStep-1 步的 {board, turn}，用於重複局面偵測

  function setGameContext(ctx) {
    const step = ctx && Number.isInteger(ctx.step) && ctx.step >= 0 && ctx.step <= MAX_CTX_STEPS ? ctx.step : 0;
    const moves = ctx && Array.isArray(ctx.moves) ? ctx.moves.slice(0, step) : [];
    const positions = ctx && Array.isArray(ctx.positions) ? ctx.positions.slice(0, step) : [];
    ctxStep = step;
    ctxMoves = moves.length === step && moves.every(isValidMoveObj) ? moves : [];
    ctxPositions = positions.filter(p => p && isValidBoard(p.board) && (p.turn === 'R' || p.turn === 'B'));
    if (ctxMoves.length !== step) ctxStep = Math.max(step, 14); // 走法紀錄不完整時停用開局庫，避免誤判
  }

  const MAX_CTX_STEPS = 600;
  const VALID_TYPES = new Set(['K', 'A', 'B', 'N', 'R', 'C', 'P']);

  function isValidMoveObj(m) {
    return !!m && [m.fr, m.tr].every(v => Number.isInteger(v) && v >= 0 && v <= 9) &&
      [m.fc, m.tc].every(v => Number.isInteger(v) && v >= 0 && v <= 8);
  }

  function isValidBoard(b) {
    if (!Array.isArray(b) || b.length !== 10) return false;
    for (let r = 0; r < 10; r++) {
      if (!Array.isArray(b[r]) || b[r].length !== 9) return false;
      for (let c = 0; c < 9; c++) {
        const p = b[r][c];
        if (p === null) continue;
        if (!p || typeof p !== 'object' || (p.s !== 'R' && p.s !== 'B') || !VALID_TYPES.has(p.t)) return false;
      }
    }
    return true;
  }

  function isValidRequest(msg) {
    return !!msg && isValidBoard(msg.board) && (msg.side === 'R' || msg.side === 'B') &&
      Number.isInteger(msg.level) && msg.level >= 1 && msg.level <= 5;
  }

  /** 只保留棋子的 s/t 欄位，丟棄任何多餘屬性 */
  function sanitizeBoard(b) {
    return b.map(row => row.map(p => (p ? { s: p.s, t: p.t } : null)));
  }

  function findOpeningBookMove(board, side) {
    if (ctxStep >= 14) return null;
    const candidates = [];
    const allBooks = [...Object.values(PRESETS), ...EXTRA_BOOK_LINES];
    for (const preset of allBooks) {
      if (preset.moves.length <= ctxStep) continue;
      for (const mirror of [false, true]) {
        let match = true;
        for (let i = 0; i < ctxStep; i++) {
          const hm = ctxMoves[i];
          const pm = preset.moves[i];
          const pfc = mirror ? 8 - pm.f[1] : pm.f[1];
          const ptc = mirror ? 8 - pm.t[1] : pm.t[1];
          if (!hm || hm.fr !== pm.f[0] || hm.fc !== pfc || hm.tr !== pm.t[0] || hm.tc !== ptc) {
            match = false;
            break;
          }
        }
        if (match) {
          const nextPm = preset.moves[ctxStep];
          const fr = nextPm.f[0], fc = mirror ? 8 - nextPm.f[1] : nextPm.f[1];
          const tr = nextPm.t[0], tc = mirror ? 8 - nextPm.t[1] : nextPm.t[1];
          const p = board[fr] && board[fr][fc];
          if (p && p.s === side) {
            const legal = getLegalMoves(board, fr, fc);
            if (legal.some(([lr, lc]) => lr === tr && lc === tc)) {
              candidates.push({ fr, fc, tr, tc, comment: `【AI 定式庫・${preset.title}】${nextPm.c}` });
            }
          }
        }
      }
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // ==================== 對手回合靜默背景推演引擎 (Silent Time-Sliced Pondering) ====================
  let ponderTimer = null;
  let ponderState = null;
  let lastCompletedPonder = null;

  function stopPonder(preserveForNextTurn = false) {
    if (ponderTimer !== null) {
      clearTimeout(ponderTimer);
      ponderTimer = null;
    }
    if (preserveForNextTurn && ponderState && ponderState.totalNodes > 0) {
      lastCompletedPonder = {
        step: ponderState.step,
        nodes: ponderState.totalNodes,
        depth: ponderState.reachedDepth
      };
    } else if (!preserveForNextTurn) {
      lastCompletedPonder = null;
    }
    ponderState = null;
  }

  function startPonder(board, humanSide, aiSide, level, sliceMs = 18) {
    stopPonder(false);
    if (!isValidBoard(board) || humanSide === aiSide) return;
    const state = evaluateGameState(board, humanSide);
    if (state.over) return;
    ensureTT();

    const aiLevel = level;
    const prof = AI_PROFILES[aiLevel] || AI_PROFILES[4];
    const workBoard = sanitizeBoard(board);
    const [rootLo, rootHi] = computeBoardHash(workBoard, humanSide);
    const rootTtIdx = rootLo & TT_MASK;
    const rootTtMove = (ttDepth[rootTtIdx] > 0 && ttKeyLo[rootTtIdx] === rootLo && ttKeyHi[rootTtIdx] === rootHi)
      ? ttBestMove[rootTtIdx]
      : 0;
    const rootMoves = getAllLegalMoves(workBoard, humanSide, false, rootTtMove);
    if (rootMoves.length === 0) return;

    const ponderHashSet = new Set();
    for (let s = 0; s < ctxPositions.length; s++) {
      const [hLo] = computeBoardHash(ctxPositions[s].board, ctxPositions[s].turn);
      ponderHashSet.add(hLo);
    }

    const maxDepth = aiLevel === 1 ? 5 : Math.min(18, prof.depth + 2);
    ponderState = {
      step: ctxStep,
      side: humanSide,
      aiSide,
      sliceMs: Math.max(5, Math.min(200, sliceMs | 0)),
      prof,
      workBoard,
      rootLo,
      rootHi,
      rootMoves,
      ponderHashSet,
      d: 2,
      maxDepth,
      moveIdx: 0,
      alpha: -Infinity,
      beta: Infinity,
      iterBestMove: rootMoves[0],
      iterBestScore: -Infinity,
      reachedDepth: 1,
      totalNodes: 0,
      sliceRetries: 0,
      done: false
    };
    ponderTimer = setTimeout(runPonderSlice, 30);
  }

  function runPonderSlice() {
    ponderTimer = null;
    if (!ponderState || ponderState.done) {
      return;
    }

    gameHashSet = ponderState.ponderHashSet;
    pathHashLo[0] = ponderState.rootLo;
    searchNodes = 0;
    searchAborted = false;
    const sliceDeadline = performance.now() + ponderState.sliceMs; // 每次只占用一小段時間切片，讓新指令（或主執行緒畫面）能及時插入
    const { workBoard, rootMoves, prof, rootLo, rootHi, aiSide } = ponderState;

    while (ponderState.d <= ponderState.maxDepth) {
      const d = ponderState.d;
      const i = ponderState.moveIdx;
      const m = rootMoves[i];
      const mover = workBoard[m.fr][m.fc];
      const captured = workBoard[m.tr][m.tc];
      workBoard[m.tr][m.tc] = mover;
      workBoard[m.fr][m.fc] = null;

      const givesCheck = isInCheck(workBoard, aiSide);
      const pIdx = PIECE_IDX[mover.s + '_' + mover.t];
      const fromSq = m.fr * 9 + m.fc;
      const toSq = m.tr * 9 + m.tc;
      let nextLo = (rootLo ^ ZOBRIST_LO[pIdx][fromSq] ^ ZOBRIST_LO[pIdx][toSq] ^ Z_SIDE_LO) >>> 0;
      let nextHi = (rootHi ^ ZOBRIST_HI[pIdx][fromSq] ^ ZOBRIST_HI[pIdx][toSq] ^ Z_SIDE_HI) >>> 0;
      if (captured) {
        const cIdx = PIECE_IDX[captured.s + '_' + captured.t];
        nextLo = (nextLo ^ ZOBRIST_LO[cIdx][toSq]) >>> 0;
        nextHi = (nextHi ^ ZOBRIST_HI[cIdx][toSq]) >>> 0;
      }

      let score;
      if (i < 3) {
        score = -negamax(
          workBoard, d - 1, -Infinity, Infinity, aiSide, 1,
          nextLo, nextHi, true, prof.useTactics, prof.qMax, sliceDeadline, givesCheck
        );
      } else {
        score = -negamax(
          workBoard, d - 1, -ponderState.alpha - 1, -ponderState.alpha, aiSide, 1,
          nextLo, nextHi, true, prof.useTactics, prof.qMax, sliceDeadline, givesCheck
        );
        if (!searchAborted && score > ponderState.alpha) {
          score = -negamax(
            workBoard, d - 1, -Infinity, -ponderState.alpha, aiSide, 1,
            nextLo, nextHi, true, prof.useTactics, prof.qMax, sliceDeadline, givesCheck
          );
        }
      }

      workBoard[m.fr][m.fc] = mover;
      workBoard[m.tr][m.tc] = captured;

      if (searchAborted) {
        ponderState.sliceRetries++;
        if (ponderState.sliceRetries <= 35) {
          break;
        }
        searchAborted = false;
        ponderState.sliceRetries = 0;
        ponderState.moveIdx++;
      } else {
        ponderState.sliceRetries = 0;
        m.lastScore = score;
        if (score > ponderState.iterBestScore) {
          ponderState.iterBestScore = score;
          ponderState.iterBestMove = m;
        }
        if (score > ponderState.alpha) {
          ponderState.alpha = score;
        }
        ponderState.moveIdx++;
      }

      if (ponderState.moveIdx >= rootMoves.length) {
        ponderState.reachedDepth = d;
        rootMoves.sort((a, b) => (b.lastScore ?? -999999) - (a.lastScore ?? -999999));
        const bestHm = rootMoves[0];
        const rTtIdx = rootLo & TT_MASK;
        ttKeyLo[rTtIdx] = rootLo;
        ttKeyHi[rTtIdx] = rootHi;
        ttDepth[rTtIdx] = d;
        ttScore[rTtIdx] = ponderState.iterBestScore;
        ttBestMove[rTtIdx] = bestHm.code;
        ttFlag[rTtIdx] = 1;

        if (Math.abs(ponderState.iterBestScore) > 18000 || d >= ponderState.maxDepth) {
          ponderState.done = true;
          break;
        }
        ponderState.d++;
        ponderState.moveIdx = 0;
        ponderState.alpha = -Infinity;
        ponderState.beta = Infinity;
        ponderState.iterBestMove = rootMoves[0];
        ponderState.iterBestScore = -Infinity;
      }

      if (performance.now() >= sliceDeadline) break;
    }

    ponderState.totalNodes += searchNodes;
    if (!ponderState.done) {
      ponderTimer = setTimeout(runPonderSlice, 5);
    }
  }

  function computeBestMove(board, side, level) {
    const prof = AI_PROFILES[level] || AI_PROFILES[4];
    if (level >= 1) {
      const bookMove = findOpeningBookMove(board, side);
      if (bookMove) return bookMove;
    }

    ensureTT();
    const workBoard = sanitizeBoard(board);
    const [rootLo, rootHi] = computeBoardHash(workBoard, side);
    const rootTtIdx = rootLo & TT_MASK;
    const hasRootTt = (ttDepth[rootTtIdx] > 0 && ttKeyLo[rootTtIdx] === rootLo && ttKeyHi[rootTtIdx] === rootHi);
    const rootTtMove = hasRootTt ? ttBestMove[rootTtIdx] : 0;

    const rootMoves = getAllLegalMoves(workBoard, side, false, rootTtMove);
    if (rootMoves.length === 0) return null;
    if (rootMoves.length === 1) {
      const only = rootMoves[0];
      return { fr: only.fr, fc: only.fc, tr: only.tr, tc: only.tc, comment: `【${prof.name}】唯一合法應著。` };
    }

    const ponderBonusNodes = (lastCompletedPonder && lastCompletedPonder.step === ctxStep - 1)
      ? lastCompletedPonder.nodes
      : 0;
    lastCompletedPonder = null;

    searchNodes = 0;
    searchAborted = false;
    killerMove1.fill(0);
    killerMove2.fill(0);
    for (let i = 0; i < historyHeuristic.length; i++) historyHeuristic[i] >>= 1;

    gameHashSet = new Set();
    for (let s = 0; s < ctxPositions.length; s++) {
      const [hLo] = computeBoardHash(ctxPositions[s].board, ctxPositions[s].turn);
      gameHashSet.add(hLo);
    }

    pathHashLo[0] = rootLo;
    const startTime = performance.now();
    const deadline = startTime + prof.timeMs;
    const nextTurn = side === 'R' ? 'B' : 'R';
    let chosenMove = rootMoves[0];
    let chosenScore = (hasRootTt && ttFlag[rootTtIdx] === 1) ? ttScore[rootTtIdx] : -Infinity;
    let reachedDepth = (hasRootTt && ttFlag[rootTtIdx] === 1) ? Math.min(prof.depth, ttDepth[rootTtIdx]) : 1;
    let maxTargetDepth = prof.depth;

    for (let d = 2; d <= maxTargetDepth; d++) {
      let alpha = -Infinity, beta = Infinity;
      let iterBestMove = rootMoves[0];
      let iterBestScore = -Infinity;

      for (let i = 0; i < rootMoves.length; i++) {
        if (d >= 3 && performance.now() > deadline) {
          searchAborted = true;
          break;
        }
        const m = rootMoves[i];
        const mover = workBoard[m.fr][m.fc];
        const captured = workBoard[m.tr][m.tc];
        workBoard[m.tr][m.tc] = mover;
        workBoard[m.fr][m.fc] = null;

        const givesCheck = isInCheck(workBoard, nextTurn);
        const pIdx = PIECE_IDX[mover.s + '_' + mover.t];
        const fromSq = m.fr * 9 + m.fc;
        const toSq = m.tr * 9 + m.tc;
        let nextLo = (rootLo ^ ZOBRIST_LO[pIdx][fromSq] ^ ZOBRIST_LO[pIdx][toSq] ^ Z_SIDE_LO) >>> 0;
        let nextHi = (rootHi ^ ZOBRIST_HI[pIdx][fromSq] ^ ZOBRIST_HI[pIdx][toSq] ^ Z_SIDE_HI) >>> 0;
        if (captured) {
          const cIdx = PIECE_IDX[captured.s + '_' + captured.t];
          nextLo = (nextLo ^ ZOBRIST_LO[cIdx][toSq]) >>> 0;
          nextHi = (nextHi ^ ZOBRIST_HI[cIdx][toSq]) >>> 0;
        }

        let score;
        if (i === 0 || prof.jitter > 0) {
          score = -negamax(
            workBoard, d - 1, -beta, -alpha, nextTurn, 1,
            nextLo, nextHi, true, prof.useTactics, prof.qMax, deadline, givesCheck
          );
        } else {
          score = -negamax(
            workBoard, d - 1, -alpha - 1, -alpha, nextTurn, 1,
            nextLo, nextHi, true, prof.useTactics, prof.qMax, deadline, givesCheck
          );
          if (!searchAborted && score > alpha) {
            score = -negamax(
              workBoard, d - 1, -beta, -alpha, nextTurn, 1,
              nextLo, nextHi, true, prof.useTactics, prof.qMax, deadline, givesCheck
            );
          }
        }
        workBoard[m.fr][m.fc] = mover;
        workBoard[m.tr][m.tc] = captured;

        if (searchAborted) break;

        if (prof.jitter > 0) {
          score += (Math.random() * 2 - 1) * prof.jitter;
        }
        m.lastScore = score;
        if (score > iterBestScore) {
          iterBestScore = score;
          iterBestMove = m;
        }
        if (score > alpha) alpha = score;
      }

      if (!searchAborted) {
        chosenMove = iterBestMove;
        chosenScore = iterBestScore;
        reachedDepth = d;
        rootMoves.sort((a, b) => (b.lastScore ?? -999999) - (a.lastScore ?? -999999));
        ttKeyLo[rootTtIdx] = rootLo;
        ttKeyHi[rootTtIdx] = rootHi;
        ttDepth[rootTtIdx] = d;
        ttScore[rootTtIdx] = chosenScore;
        ttBestMove[rootTtIdx] = chosenMove.code;
        ttFlag[rootTtIdx] = 1;
        if (chosenScore > 18000) break;
        if (d === prof.depth && prof.jitter === 0 && ponderBonusNodes > 1000) {
          const elapsed = performance.now() - startTime;
          if (elapsed < prof.timeMs * 0.25) maxTargetDepth = Math.min(18, prof.depth + 2);
          else if (elapsed < prof.timeMs * 0.5) maxTargetDepth = Math.min(18, prof.depth + 1);
        }
      } else {
        if (iterBestMove !== rootMoves[0] && rootMoves[0].lastScore !== undefined && iterBestScore > rootMoves[0].lastScore) {
          chosenMove = iterBestMove;
          chosenScore = iterBestScore;
        }
        break;
      }
    }

    const evalPawn = (chosenScore / 100).toFixed(1);
    const sign = chosenScore >= 0 ? '+' : '';
    const scoreDesc = Math.abs(chosenScore) > 18000
      ? (chosenScore > 0 ? '必勝殺棋!' : '面臨絕殺')
      : `${sign}${evalPawn} 兵`;
    const totalEvaluatedNodes = searchNodes + ponderBonusNodes;
    return {
      fr: chosenMove.fr,
      fc: chosenMove.fc,
      tr: chosenMove.tr,
      tc: chosenMove.tc,
      comment: `【${prof.name} (${prof.title})・算深 ${reachedDepth} 層 (${(totalEvaluatedNodes / 1000).toFixed(1)}k 節點)｜評估：${scoreDesc}】`
    };
  }

  return {
    PRESETS, AI_PROFILES, PIECE_NAMES,
    initBoard, cloneBoard, getLegalMoves, isInCheck, evaluateGameState, getNotation,
    evaluateBoard, isValidBoard, isValidRequest,
    setGameContext, computeBestMove, startPonder, stopPonder
  };
}

/**
 * Web Worker 端的訊息處理。由主執行緒以 toString() 與引擎一起注入 Worker。
 * 只接受固定的訊息型別，並在使用前驗證棋盤與參數格式。
 */
function XiangqiWorkerMain(E) {
  'use strict';
  self.onmessage = function (e) {
    const msg = e.data;
    if (!msg || typeof msg !== 'object') return;
    const id = Number.isInteger(msg.id) ? msg.id : 0;
    try {
      if (msg.type === 'think') {
        if (!E.isValidRequest(msg)) throw new Error('invalid request');
        E.stopPonder(true);
        E.setGameContext(msg.ctx);
        const move = E.computeBestMove(msg.board, msg.side, msg.level);
        self.postMessage({ type: 'result', id, move });
      } else if (msg.type === 'ponder') {
        if (!E.isValidRequest(msg) || (msg.aiSide !== 'R' && msg.aiSide !== 'B')) throw new Error('invalid request');
        E.setGameContext(msg.ctx);
        E.startPonder(msg.board, msg.side, msg.aiSide, msg.level, 45);
      } else if (msg.type === 'stopPonder') {
        E.stopPonder(false);
      }
    } catch (err) {
      self.postMessage({ type: 'error', id, message: String(err && err.message || err) });
    }
  };
  self.postMessage({ type: 'ready' });
}
