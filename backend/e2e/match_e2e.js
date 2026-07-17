process.env.JWT_SECRET = 'test-secret-e2e';
const http = require('http'), jwt = require('jsonwebtoken');
const { Server } = require('socket.io'); const { io: ioc } = require('socket.io-client');
const { __db } = require('./fakedb');
const { setupDominoSocket } = require('../dist/realtime/domino-socket');
const E = require('../dist/engine/domino-classic');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fallos = 0;
const chk=(n,c,e='')=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(e?' — ':'')+(e||''));if(!c)fallos++;};

function seed(roomId,target){ __db.rooms.clear(); __db.players.length=0; __db.users.clear(); __db.matches=[];
  __db.rooms.set(roomId,{id:roomId,code:'M',host_user_id:100,status:'waiting',max_players:4,game_mode:'teams',team_mode:'manual',target_score:target,game_state:null,match_state:null});
  [0,1,0,1].forEach((tm,i)=>{const uid=100+i;__db.users.set(uid,'j'+i);__db.players.push({room_id:roomId,user_id:uid,position:i,team:tm,is_connected:false,socket_id:null});});}
const tk=uid=>jwt.sign({userId:uid,username:'j'+(uid-100),email:'a@b.c'},process.env.JWT_SECRET,{algorithm:'HS256',expiresIn:'1h'});

// Elegir una jugada VÁLIDA para el jugador en turno, desde SU vista.
function chooseMove(sv, me){
  const mh = me.hand.filter(x=>x[0]>=0);
  if(sv.board.length===0){
    // apertura: si hay openingTile obligatoria, esa; si es libre (null), cualquiera de la mano
    if(sv.openingTile) return {tile:sv.openingTile, side:'right'};
    return {tile: mh[mh.length-1], side:'right'};   // ficha libre
  }
  const mv = E.legalMoves(mh, sv.leftEnd, sv.rightEnd);
  if(mv.length) return {tile:mv[0].tile, side:mv[0].side};
  return null; // pasa
}

(async()=>{
  const server=http.createServer();const io=new Server(server,{cors:{origin:'*'}});
  setupDominoSocket(io);await new Promise(r=>server.listen(4660,r));
  console.log('=== Partido a 60 puntos, socket real, controlador secuencial ===');
  seed(1,60);
  const view={}, ev={handFinished:[],handStarted:[],matchFinished:null,errors:[]};
  const socks={};
  [100,101,102,103].forEach(uid=>{
    const c=ioc('http://localhost:4660',{auth:{token:tk(uid)},transports:['websocket']});
    socks[uid]=c;
    c.on('auth:ok',()=>c.emit('domino:join',{roomId:1}));
    c.on('domino:state',s=>view[uid]=s);
    if(uid===100){
      c.on('domino:hand_finished',d=>ev.handFinished.push(d));
      c.on('domino:hand_started',d=>ev.handStarted.push(d));
      c.on('domino:match_finished',d=>ev.matchFinished=d);
    } else {
      c.on('domino:match_finished',d=>ev.matchFinished=d);
    }
    c.on('error',e=>ev.errors.push(e.error));
  });
  await sleep(500);
  socks[100].emit('domino:start');
  await sleep(600);

  const t0=Date.now();
  while(Date.now()-t0<90000 && !ev.matchFinished){
    const anchor=view[100];
    if(!anchor||anchor.status!=='playing'){ await sleep(50); continue; }   // reveal gap
    const turn=anchor.currentTurn;
    const cur=anchor.players.find(p=>p.position===turn);
    const sv=view[cur.userId];
    if(!sv||sv.status!=='playing'||sv.currentTurn!==turn||sv.board.length!==anchor.board.length){ await sleep(25); continue; }
    const me=sv.players.find(p=>p.userId===cur.userId);
    const before=sv.board.length;
    const mv=chooseMove(sv,me);
    if(mv) socks[cur.userId].emit('domino:play',mv);
    else socks[cur.userId].emit('domino:pass');
    // esperar a que el estado avance (board cambió, turno cambió, o la mano terminó)
    const tw=Date.now();
    while(Date.now()-tw<2000){
      const a=view[100];
      if(!a) break;
      if(a.status!=='playing') break;                 // mano terminó → reveal
      if(a.board.length!==before || a.currentTurn!==turn) break;
      await sleep(15);
    }
  }

  const mf=ev.matchFinished;
  if(!mf){ const last=ev.handFinished[ev.handFinished.length-1]; console.log('  [diag] no terminó. última score:', last?JSON.stringify(last.score):'ninguna', '| manos:', ev.handFinished.length); }
  chk('el partido TERMINA', !!mf, mf?`equipo ${mf.winnerTeam}, ${mf.score[0]}-${mf.score[1]}, ${mf.totalHands} manos`:'TIMEOUT');
  chk('sin errores', ev.errors.length===0, [...new Set(ev.errors)].join(',')||'ninguno');
  chk('hand_finished por mano', ev.handFinished.length>=2, ev.handFinished.length+' manos');
  if(ev.handFinished.length){
    chk('marcador acumulado presente', ev.handFinished[0].score && typeof ev.handFinished[0].score[0]==='number');
    chk('revela fichas del perdedor', Array.isArray(ev.handFinished[0].revealedHands), (ev.handFinished[0].revealedHands||[]).length+' revelados');
    const last=ev.handFinished[ev.handFinished.length-1];
    chk('marcador acumula entre manos', (last.score[0]+last.score[1])>(ev.handFinished[0].score[0]+ev.handFinished[0].score[1]));
  }
  chk('hand_started = manos-1 (transiciones)', ev.handStarted.length===ev.handFinished.length-1 || ev.handStarted.length===ev.handFinished.length, `started=${ev.handStarted.length} finished=${ev.handFinished.length}`);
  if(mf) chk('ganador llegó a la meta', mf.score[mf.winnerTeam]>=60, `${mf.score[0]}-${mf.score[1]}`);
  chk('rotación de salida correcta', ev.handStarted.every((h,i)=> i===0 || h.starterPosition===(ev.handStarted[i-1].starterPosition+1)%4), ev.handStarted.map(h=>h.starterPosition).join(','));
  chk('partido persistido', (__db.matches||[]).length===1);

  Object.values(socks).forEach(c=>c.close());await sleep(200);server.close();
  console.log(fallos===0?'\n✅ PARTIDO E2E: VERDE':`\n❌ ${fallos} fallo(s)`);
  process.exit(fallos?1:0);
})();
