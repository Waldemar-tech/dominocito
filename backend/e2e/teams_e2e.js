/** E2E Fase 1: modo teams por socket real, los 3 métodos de armado. */
process.env.JWT_SECRET = 'test-secret-e2e';
const http = require('http'), jwt = require('jsonwebtoken');
const { Server } = require('socket.io'); const { io: ioc } = require('socket.io-client');
const { __db } = require('./fakedb');
const { setupDominoSocket } = require('../dist/realtime/domino-socket');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fallos = 0;
const chk = (n,c,e='') => { console.log((c?'  PASS  ':'  FAIL  ')+n+(e?' — '+e:'')); if(!c) fallos++; };

function seedTeams(roomId, teamMode, teams) {
  __db.rooms.clear(); __db.players.length=0; __db.users.clear(); __db.games.length=0;
  __db.rooms.set(roomId, { id:roomId, code:'T', host_user_id:100, status:'waiting', max_players:4, game_mode:'teams', team_mode:teamMode, game_state:null });
  [0,1,2,3].forEach(i => { const uid=100+i; __db.users.set(uid,'j'+i);
    __db.players.push({ room_id:roomId, user_id:uid, position:i, team: teams?teams[i]:null, is_connected:false, socket_id:null }); });
}
const tk = uid => jwt.sign({ userId:uid, username:'j'+(uid-100), email:'a@b.c' }, process.env.JWT_SECRET, { algorithm:'HS256', expiresIn:'1h' });

function conn(port, uid, roomId) {
  const c = ioc(`http://localhost:${port}`, { auth:{token:tk(uid)}, transports:['websocket'] });
  const st = { uid, state:null, lobby:null, started:null, errors:[] };
  c.on('auth:ok', () => c.emit('domino:join', { roomId }));
  c.on('domino:lobby', d => st.lobby = d);
  c.on('domino:state', s => st.state = s);
  c.on('domino:started', d => st.started = d);
  c.on('error', e => st.errors.push(e.error));
  return { sock:c, st };
}

function crossOK(players) {
  // compañeros del mismo equipo en asientos que difieren en 2
  const byTeam = {0:[],1:[]};
  players.forEach(p => byTeam[p.team].push(p.position));
  return byTeam[0].length===2 && byTeam[1].length===2 &&
         Math.abs(byTeam[0][0]-byTeam[0][1])===2 && Math.abs(byTeam[1][0]-byTeam[1][1])===2;
}

(async () => {
  const server = http.createServer(); const io = new Server(server, { cors:{origin:'*'} });
  setupDominoSocket(io); await new Promise(r => server.listen(4640, r));

  // ── MANUAL: host arma equipos ──
  console.log('=== MANUAL: el host arma los equipos ===');
  seedTeams(1, 'manual', [null,null,null,null]);
  let cs = [100,101,102,103].map(u => conn(4640, u, 1));
  await sleep(400);
  // host asigna: 100&102 = equipo 0, 101&103 = equipo 1
  cs[0].sock.emit('domino:set_teams', { teams:[
    {userId:100,team:0},{userId:101,team:1},{userId:102,team:0},{userId:103,team:1}]});
  await sleep(300);
  chk('todos reciben el lobby actualizado', cs.every(c=>c.st.lobby), '');
  const lob = cs[0].st.lobby;
  chk('equipos 2-2 en el lobby', lob && lob.players.filter(p=>p.team===0).length===2 && lob.players.filter(p=>p.team===1).length===2);
  cs[0].sock.emit('domino:start');
  await sleep(500);
  chk('la partida arranca', cs.every(c=>c.st.started), cs.flatMap(c=>c.st.errors).join(',')||'');
  chk('*** compañeros sentados cruzados ***', cs[0].st.state && crossOK(cs[0].st.state.players),
      cs[0].st.state ? cs[0].st.state.players.map(p=>`p${p.position}:eq${p.team}`).join(' ') : 'sin estado');
  cs.forEach(c=>c.sock.close()); await sleep(200);

  // ── CHOOSE: cada quien elige, host reacomoda ──
  console.log('\n=== CHOOSE: cada quien elige su equipo ===');
  seedTeams(2, 'choose', [0,null,null,null]); // host ya en equipo 0
  cs = [100,101,102,103].map(u => conn(4640, u, 2));
  await sleep(400);
  cs[1].sock.emit('domino:choose_team', { team:1 });
  cs[2].sock.emit('domino:choose_team', { team:0 });
  cs[3].sock.emit('domino:choose_team', { team:1 });
  await sleep(400);
  const lob2 = cs[0].st.lobby;
  chk('equipos quedan 2-2 tras elegir', lob2 && lob2.players.filter(p=>p.team===0).length===2 && lob2.players.filter(p=>p.team===1).length===2,
      lob2 ? lob2.players.map(p=>`u${p.userId}:${p.team}`).join(' ') : '');
  // un 5to intento al equipo lleno debe fallar
  cs[3].st.errors = [];
  cs[3].sock.emit('domino:choose_team', { team:0 }); // equipo 0 lleno
  await sleep(250);
  chk('no se puede unir a equipo lleno', cs[3].st.errors.some(e=>/lleno/i.test(e)), cs[3].st.errors.join(',')||'sin error');
  // host reacomoda
  cs[0].sock.emit('domino:set_teams', { teams:[
    {userId:100,team:0},{userId:101,team:0},{userId:102,team:1},{userId:103,team:1}]});
  await sleep(300);
  const lob2b = cs[0].st.lobby;
  chk('el host puede reacomodar', lob2b && lob2b.players.find(p=>p.userId===101).team===0);
  cs.forEach(c=>c.sock.close()); await sleep(200);

  // ── RANDOM: sorteo al iniciar ──
  console.log('\n=== RANDOM: sorteo al iniciar ===');
  let cruzados=0;
  for (let rep=0; rep<20; rep++) {
    seedTeams(3, 'random', [null,null,null,null]);
    cs = [100,101,102,103].map(u => conn(4640, u, 3));
    await sleep(250);
    cs[0].sock.emit('domino:start');
    await sleep(300);
    if (cs[0].st.state && crossOK(cs[0].st.state.players)) cruzados++;
    cs.forEach(c=>c.sock.close()); await sleep(120);
  }
  chk('20/20 sorteos dan equipos cruzados', cruzados===20, cruzados+'/20');

  // ── Validación: no arranca con equipos incompletos ──
  console.log('\n=== Validación: teams sin armar no arranca ===');
  seedTeams(4, 'manual', [null,null,null,null]);
  cs = [100,101,102,103].map(u => conn(4640, u, 4));
  await sleep(400);
  cs[0].st.errors = [];
  cs[0].sock.emit('domino:start'); // sin armar equipos
  await sleep(400);
  chk('start rechazado si faltan equipos', cs[0].st.errors.length>0 && !cs[0].st.started, cs[0].st.errors.join(',')||'arrancó igual (mal)');
  cs.forEach(c=>c.sock.close()); await sleep(200);

  server.close();
  console.log(fallos===0?'\n✅ FASE 1 SOCKET: VERDE':`\n❌ ${fallos} fallo(s)`);
  process.exit(fallos?1:0);
})();
