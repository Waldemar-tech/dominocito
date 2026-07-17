/**
 * Fake pg pool: implementa solo las queries que usa domino-socket.ts,
 * con estado en memoria. Suficiente para un E2E real de la capa socket.
 */
const db = {
  rooms: new Map(),   // id -> {id, code, host_user_id, status, max_players, game_state}
  players: [],        // {room_id, user_id, position, team, is_connected, socket_id}
  users: new Map(),   // id -> username
  games: [],
  stats: new Map(),
  log: [],
};

const norm = s => s.replace(/\s+/g, ' ').trim();

async function query(text, params = []) {
  const q = norm(text);
  db.log.push(q.slice(0, 70));

  if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(q)) return { rows: [], rowCount: 0 };

  // ── rooms ──
  if (/^SELECT game_state FROM dc_domino_rooms WHERE id = \$1/.test(q)) {
    const r = db.rooms.get(params[0]);
    return { rows: r && r.game_state ? [{ game_state: r.game_state }] : [], rowCount: 0 };
  }
  if (/^UPDATE dc_domino_rooms SET game_state = \$1 WHERE id = \$2/.test(q)) {
    const r = db.rooms.get(params[1]);
    if (r) r.game_state = JSON.parse(params[0]);
    return { rows: [], rowCount: 1 };
  }
  if (/^SELECT id, host_user_id, status, game_mode, team_mode FROM dc_domino_rooms WHERE id = \$1/.test(q)) {
    const r = db.rooms.get(params[0]);
    return { rows: r ? [{ id: r.id, host_user_id: r.host_user_id, status: r.status, game_mode: r.game_mode, team_mode: r.team_mode }] : [], rowCount: 0 };
  }
  if (/^SELECT id, host_user_id, status(, max_players)? FROM dc_domino_rooms WHERE id = \$1/.test(q)) {
    const r = db.rooms.get(params[0]);
    return { rows: r ? [{ id: r.id, host_user_id: r.host_user_id, status: r.status }] : [], rowCount: 0 };
  }
  if (/^SELECT game_mode, team_mode, status FROM dc_domino_rooms WHERE id = \$1/.test(q)) {
    const r = db.rooms.get(params[0]);
    return { rows: r ? [{ game_mode: r.game_mode, team_mode: r.team_mode, status: r.status }] : [], rowCount: 0 };
  }
  if (/^SELECT host_user_id, game_mode, status FROM dc_domino_rooms WHERE id = \$1/.test(q)) {
    const r = db.rooms.get(params[0]);
    return { rows: r ? [{ host_user_id: r.host_user_id, game_mode: r.game_mode, status: r.status }] : [], rowCount: 0 };
  }
  if (/^UPDATE dc_domino_rooms SET status = 'playing', started_at = NOW\(\), game_state = \$2 WHERE id = \$1/.test(q)) {
    const r = db.rooms.get(params[0]);
    if (r) { r.status = 'playing'; r.game_state = JSON.parse(params[1]); }
    return { rows: [], rowCount: 1 };
  }
  if (/^UPDATE dc_domino_rooms SET status = 'finished', game_state = NULL/.test(q)) {
    const r = db.rooms.get(params[0]);
    if (r) { r.status = 'finished'; r.game_state = null; }
    return { rows: [], rowCount: 1 };
  }

  if (/^UPDATE dc_domino_rooms SET status = 'playing', started_at = NOW\(\) WHERE id = \$1$/.test(q)) {
    const r = db.rooms.get(params[0]); if (r) r.status = 'playing';
    return { rows: [], rowCount: 1 };
  }
  if (/^UPDATE dc_domino_rooms SET game_state = NULL WHERE id = \$1/.test(q)) {
    const r = db.rooms.get(params[0]); if (r) r.game_state = null;
    return { rows: [], rowCount: 1 };
  }

  if (/^UPDATE dc_domino_players SET position = \$1, team = \$2 WHERE room_id = \$3 AND user_id = \$4/.test(q)) {
    const pl = db.players.find(x => x.room_id === params[2] && x.user_id === params[3]);
    if (pl) { pl.position = params[0]; pl.team = params[1]; }
    return { rows: [], rowCount: 1 };
  }
  if (/^UPDATE dc_domino_players SET team = \$1 WHERE room_id = \$2 AND user_id = \$3/.test(q)) {
    const pl = db.players.find(x => x.room_id === params[1] && x.user_id === params[2]);
    if (pl) pl.team = params[0];
    return { rows: [], rowCount: 1 };
  }
  if (/^SELECT user_id, team FROM dc_domino_players WHERE room_id = \$1/.test(q)) {
    const rows = db.players.filter(x => x.room_id === params[0]).map(x => ({ user_id: x.user_id, team: x.team }));
    return { rows, rowCount: rows.length };
  }
  if (/^SELECT user_id FROM dc_domino_players WHERE room_id = \$1/.test(q)) {
    const rows = db.players.filter(x => x.room_id === params[0]).map(x => ({ user_id: x.user_id }));
    return { rows, rowCount: rows.length };
  }
  if (/^SELECT p.user_id, p.position, p.team, p.is_connected, u.username/.test(q)) {
    const rows = db.players.filter(x => x.room_id === params[0]).sort((a,b)=>a.position-b.position)
      .map(x => ({ user_id: x.user_id, position: x.position, team: x.team, is_connected: x.is_connected, username: db.users.get(x.user_id) }));
    return { rows, rowCount: rows.length };
  }

  // ── players ──
  if (/^SELECT (p\.)?position FROM dc_domino_players( p)? WHERE (p\.)?room_id = \$1 AND (p\.)?user_id = \$2/.test(q)) {
    const p = db.players.find(x => x.room_id === params[0] && x.user_id === params[1]);
    return { rows: p ? [{ position: p.position }] : [], rowCount: 0 };
  }
  if (/^UPDATE dc_domino_players SET is_connected = true, socket_id = \$1/.test(q)) {
    const p = db.players.find(x => x.room_id === params[1] && x.user_id === params[2]);
    if (p) { p.is_connected = true; p.socket_id = params[0]; }
    return { rows: [], rowCount: 1 };
  }
  if (/^UPDATE dc_domino_players SET is_connected = false/.test(q)) {
    const p = db.players.find(x => x.room_id === params[0] && x.user_id === params[1]);
    if (p) p.is_connected = false;
    return { rows: [], rowCount: 1 };
  }
  if (/^SELECT p.user_id, p.position, p.team, u.username/.test(q)) {
    const rows = db.players
      .filter(x => x.room_id === params[0])
      .sort((a, b) => a.position - b.position)
      .map(x => ({ user_id: x.user_id, position: x.position, team: x.team, username: db.users.get(x.user_id) }));
    return { rows, rowCount: rows.length };
  }

  // ── resultados / stats ──
  if (/^INSERT INTO dc_domino_games/.test(q)) {
    db.games.push({ room_id: params[0], winner_user_id: params[1], is_closed: params[2], points_awarded: params[3] });
    return { rows: [], rowCount: 1 };
  }
  if (/^INSERT INTO dc_domino_stats/.test(q)) {
    const uid = params[0];
    const s = db.stats.get(uid) || { games_played: 0, games_won: 0, total_points: 0 };
    s.games_played++;
    if (/games_won/.test(q)) { s.games_won++; s.total_points += Number(params[2] || 0); }
    db.stats.set(uid, s);
    return { rows: [], rowCount: 1 };
  }

  throw new Error('FakePool: query no soportada → ' + q.slice(0, 100));
}

const pool = {
  query,
  connect: async () => ({ query, release: () => {} }),
  on: () => {},
};

module.exports = { pool, testConnection: async () => {}, __db: db };
