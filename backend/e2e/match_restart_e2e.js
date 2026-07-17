/**
 * E2E: el PARTIDO sobrevive a un reinicio del backend.
 * Simula: partido en curso → "muere" el server (nuevo io + Maps vacíos) →
 * los jugadores se reconectan → la mano sigue → al terminar, el marcador
 * ACUMULADO sigue vivo (no se trató como mano suelta).
 */
process.env.JWT_SECRET = 'test-secret-e2e';
const http = require('http'), jwt = require('jsonwebtoken');
const { Server } = require('socket.io'); const { io: ioc } = require('socket.io-client');
const { __db } = require('./fakedb');
const E = require('../dist/engine/domino-classic');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fallos=0; const chk=(n,c,e='')=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(e?' — ':'')+(e||''));if(!c)fallos++;};

function seed(roomId,target){ __db.rooms.clear(); __db.players.length=0; __db.users.clear(); __db.matches=[];
  __db.rooms.set(roomId,{id:roomId,code:'M',host_user_id:100,status:'waiting',max_players:4,game_mode:'teams',team_mode:'manual',target_score:target,game_state:null,match_state:null});
  [0,1,0,1].forEach((tm,i)=>{const uid=100+i;__db.users.set(uid,'j'+i);__db.players.push({room_id:roomId,user_id:uid,position:i,team:tm,is_connected:false,socket_id:null});});}
const tk=uid=>jwt.sign({userId:uid,username:'j'+(uid-100),email:'a@b.c'},process.env.JWT_SECRET,{algorithm:'HS256',expiresIn:'1h'});

function mkClients(port, ev, view){
  const socks={};
  [100,101,102,103].forEach(uid=>{
    const c=ioc(`http://localhost:${port}`,{auth:{token:tk(uid)},transports:['websocket']});
    socks[uid]=c;
    c.on('auth:ok',()=>c.emit('domino:join',{roomId:1}));
    c.on('domino:state',s=>view[uid]=s);
    if(uid===100){
      c.on('domino:hand_finished',d=>ev.handFinished.push(d));
      c.on('domino:hand_started',d=>ev.handStarted.push(d));
    }
    c.on('domino:match_finished',d=>ev.matchFinished=d);
    c.on('error',e=>ev.errors.push(e.error));
  });
  return socks;
}
function chooseMove(sv,me){ const mh=me.hand.filter(x=>x[0]>=0);
  if(sv.board.length===0){ return sv.openingTile?{tile:sv.openingTile,side:'right'}:{tile:mh[mh.length-1],side:'right'}; }
  const mv=E.legalMoves(mh,sv.leftEnd,sv.rightEnd);
  return mv.length?{tile:mv[0].tile,side:mv[0].side}:null; }

async function playUntil(view,socks,ev,stopFn,maxMs){
  const t0=Date.now();
  while(Date.now()-t0<maxMs && !stopFn()){
    const a=view[100];
    if(!a||a.status!=='playing'){ await sleep(50); continue; }
    const turn=a.currentTurn, cur=a.players.find(p=>p.position===turn);
    const sv=view[cur.userId];
    if(!sv||sv.status!=='playing'||sv.currentTurn!==turn||sv.board.length!==a.board.length){ await sleep(25); continue; }
    const me=sv.players.find(p=>p.userId===cur.userId);
    const before=sv.board.length;
    const mv=chooseMove(sv,me);
    if(mv)socks[cur.userId].emit('domino:play',mv); else socks[cur.userId].emit('domino:pass');
    const tw=Date.now();
    while(Date.now()-tw<2000){ const x=view[100]; if(!x||x.status!=='playing')break;
      if(x.board.length!==before||x.currentTurn!==turn)break; await sleep(15); }
  }
}

(async()=>{
  // ── Server 1 ──
  let freshSocket = require('../dist/realtime/domino-socket');
  let server=http.createServer(); let io=new Server(server,{cors:{origin:'*'}});
  freshSocket.setupDominoSocket(io); await new Promise(r=>server.listen(4680,r));
  console.log('=== Partido arranca en el server 1 ===');
  seed(1,150); // objetivo alto: seguro NO termina antes del restart
  let view={}, ev={handFinished:[],handStarted:[],matchFinished:null,errors:[]};
  let socks=mkClients(4680,ev,view);
  await sleep(500); socks[100].emit('domino:start'); await sleep(500);

  // jugar hasta que termine al menos 1 mano (hay marcador acumulado)
  await playUntil(view,socks,ev,()=>ev.handFinished.length>=1 && view[100]?.status==='playing' && view[100]?.board?.length>0, 30000);
  const scoreAntes = ev.handFinished.length ? {...ev.handFinished[ev.handFinished.length-1].score} : null;
  chk('al menos 1 mano jugada antes del restart', ev.handFinished.length>=1, ev.handFinished.length+' manos, score '+JSON.stringify(scoreAntes));
  const manosAntes = ev.handFinished.length;

  // ── "Muere" el server 1 ──
  console.log('=== Simulando REINICIO del backend (Maps de memoria se pierden) ===');
  Object.values(socks).forEach(c=>c.close());
  await new Promise(r=>server.close(r));
  // borrar el módulo del caché de node = proceso nuevo con Maps VACÍOS
  Object.keys(require.cache).filter(k=>k.includes('dist/realtime')).forEach(k=>delete require.cache[k]);
  freshSocket = require('../dist/realtime/domino-socket');

  // ── Server 2 (mismo puerto, DB intacta) ──
  server=http.createServer(); io=new Server(server,{cors:{origin:'*'}});
  freshSocket.setupDominoSocket(io); await new Promise(r=>server.listen(4680,r));
  view={}; const ev2={handFinished:[],handStarted:[],matchFinished:null,errors:[]};
  socks=mkClients(4680,ev2,view);
  await sleep(700); // reconexión + domino:join → loadStateFromDB

  chk('los jugadores se reconectan y reciben estado', !!view[100], view[100]?`mano en board ${view[100].board.length}`:'sin estado');

  // seguir jugando hasta que termine la mano en curso
  await playUntil(view,socks,ev2,()=>ev2.handFinished.length>=1||ev2.matchFinished, 30000);

  const gotHand = ev2.handFinished.length>=1, gotMatch = !!ev2.matchFinished;
  chk('la mano en curso TERMINA tras el restart', gotHand||gotMatch);

  // LO CRÍTICO: el marcador acumulado sobrevivió (no se reseteó ni se trató como mano suelta)
  if(gotHand){
    const s=ev2.handFinished[0].score;
    const acumulado = (s[0]+s[1]) > 0 && scoreAntes && (s[0]>=scoreAntes[0] && s[1]>=scoreAntes[1]);
    chk('*** el MARCADOR ACUMULADO sobrevive al restart ***', acumulado,
        `antes ${JSON.stringify(scoreAntes)} → después ${JSON.stringify(s)}`);
    chk('el número de mano continúa (no volvió a 1)', ev2.handFinished[0].handNumber > manosAntes,
        'mano #'+ev2.handFinished[0].handNumber);
  } else if(gotMatch){
    chk('*** el partido terminó con marcador acumulado ***', ev2.matchFinished.score[0]+ev2.matchFinished.score[1]>0,
        JSON.stringify(ev2.matchFinished.score));
  }
  chk('sin errores tras el restart', ev2.errors.length===0, [...new Set(ev2.errors)].join(',')||'ninguno');

  Object.values(socks).forEach(c=>c.close()); await sleep(200); server.close();
  console.log(fallos===0?'\n✅ RESTART E2E: VERDE':`\n❌ ${fallos} fallo(s)`);
  process.exit(fallos?1:0);
})();
