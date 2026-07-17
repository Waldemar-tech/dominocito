/**
 * E2E: partido completo donde NADIE juega (4 AFK).
 * El servidor debe auto-jugar por todos (timeout), encadenar las manos,
 * y el partido debe terminar solo. Prueba el AFK + el encadenado juntos.
 */
process.env.JWT_SECRET = 'test-secret-e2e';
const http = require('http'), jwt = require('jsonwebtoken');
const { Server } = require('socket.io'); const { io: ioc } = require('socket.io-client');
const { __db } = require('./fakedb');
const { setupDominoSocket } = require('../dist/realtime/domino-socket');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fallos=0; const chk=(n,c,e='')=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(e?' — ':'')+(e||''));if(!c)fallos++;};

function seed(roomId,target){ __db.rooms.clear(); __db.players.length=0; __db.users.clear(); __db.matches=[];
  __db.rooms.set(roomId,{id:roomId,code:'M',host_user_id:100,status:'waiting',max_players:4,game_mode:'teams',team_mode:'manual',target_score:target,game_state:null,match_state:null});
  [0,1,0,1].forEach((tm,i)=>{const uid=100+i;__db.users.set(uid,'j'+i);__db.players.push({room_id:roomId,user_id:uid,position:i,team:tm,is_connected:false,socket_id:null});});}
const tk=uid=>jwt.sign({userId:uid,username:'j'+(uid-100),email:'a@b.c'},process.env.JWT_SECRET,{algorithm:'HS256',expiresIn:'1h'});

(async()=>{
  const server=http.createServer();const io=new Server(server,{cors:{origin:'*'}});
  setupDominoSocket(io);await new Promise(r=>server.listen(4690,r));
  console.log('=== Partido a 40 pts con 4 jugadores AFK (el server juega todo) ===');
  seed(1,40);
  const ev={handFinished:[],matchFinished:null,errors:[],timeouts:0};
  const socks={};
  [100,101,102,103].forEach(uid=>{
    const c=ioc('http://localhost:4690',{auth:{token:tk(uid)},transports:['websocket']});
    socks[uid]=c;
    c.on('auth:ok',()=>c.emit('domino:join',{roomId:1}));
    if(uid===100){
      c.on('domino:hand_finished',d=>ev.handFinished.push(d));
      c.on('domino:turn_timeout',()=>ev.timeouts++);
      c.on('domino:match_finished',d=>ev.matchFinished=d);
    }
    c.on('error',e=>ev.errors.push(e.error));
    // NADIE juega: AFK total
  });
  await sleep(500);
  socks[100].emit('domino:start');

  const t0=Date.now();
  while(Date.now()-t0<60000 && !ev.matchFinished) await sleep(150);

  const mf=ev.matchFinished;
  chk('el partido TERMINA solo (todo por timeout)', !!mf, mf?`equipo ${mf.winnerTeam}, ${mf.score[0]}-${mf.score[1]}, ${mf.totalHands} manos`:'TIMEOUT tras 60s');
  chk('hubo auto-jugadas por timeout', ev.timeouts>0, ev.timeouts+' timeouts');
  chk('las manos se encadenaron', ev.handFinished.length>=1, ev.handFinished.length+' manos');
  chk('sin errores', ev.errors.length===0, [...new Set(ev.errors)].join(',')||'ninguno');
  chk('resultado persistido', (__db.matches||[]).length===1);

  Object.values(socks).forEach(c=>c.close());await sleep(200);server.close();
  console.log(fallos===0?'\n✅ AFK EN PARTIDO: VERDE':`\n❌ ${fallos} fallo(s)`);
  process.exit(fallos?1:0);
})();
