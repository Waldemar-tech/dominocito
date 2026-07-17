/** Casos borde del motor de partido (unit, determinista). */
const E = require('../dist/engine/domino-classic');
const M = require('../dist/engine/domino-match');
let f=0; const chk=(n,c,e='')=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(e?' — '+e:''));if(!c)f++;};

console.log('=== 1) Empate EXACTO de puntos en tranca ===');
// Construyo un estado trancado a mano: ambos equipos con las mismas fichas.
// equipo 0 (pos 0,2): [1,2] y [3,4] = 3+7 = 10 pts
// equipo 1 (pos 1,3): [0,4] y [2,4] = 4+6 = 10 pts  → EMPATE
// El motor de mano resuelve tranca-empate con "gana quien trancó" (lastPasser).
const empatado = {
  roomId: 9, status: 'finished', winType: 'closed',
  winnerPosition: 1, winnerTeam: 1,   // "trancó" el equipo 1 → gana equipo 1 (regla del usuario)
  players: [
    {userId:1,username:'A',position:0,team:0,hand:[[1,2]],connected:true},
    {userId:2,username:'B',position:1,team:1,hand:[[0,4]],connected:true},
    {userId:3,username:'C',position:2,team:0,hand:[[3,4]],connected:true},
    {userId:4,username:'D',position:3,team:1,hand:[[2,4]],connected:true},
  ],
  currentTurn:0, board:[], leftEnd:0, rightEnd:0, passesInRow:4,
  scores:{}, handPoints:{}, openingTile:null, lastPasserPosition:1,
  startedAt:0, finishedAt:1, moveCount:10,
};
// eq0: 1+2+3+4=10 | eq1: 0+4+2+4=10 → empate
const sc = E.handScoreForMatch(empatado);
chk('empate de tranca NO revienta', sc !== null, JSON.stringify(sc));
chk('en empate gana quien trancó (winnerTeam del estado)', sc && sc.winningTeam === 1, `ganó equipo ${sc?.winningTeam} con ${sc?.points} pts`);
chk('los puntos otorgados son los del rival', sc && sc.points === 10);

console.log('\n=== 2) Ambos equipos cruzan la meta en la misma mano ===');
// score 95-98, meta 100. La mano da 12 pts al equipo 0 → 107-98: solo cruza el 0. OK trivial.
// El caso raro: si la mano diera puntos a ambos… no puede (solo un equipo suma por mano).
// Pero SÍ puede pasar: 95-98 y gana equipo 0 con 12 → 107 vs 98: gana 0 aunque 98<100.
let m = { roomId:9, status:'playing', targetScore:100, score:{0:95,1:98}, handNumber:5,
  currentStarterPosition:0,
  roster:[{userId:1,username:'A',position:0,team:0},{userId:2,username:'B',position:1,team:1},{userId:3,username:'C',position:2,team:0},{userId:4,username:'D',position:3,team:1}],
  currentHand: empatado, history:[], winnerTeam:null, startedAt:0, finishedAt:null };
// empatado da 10 pts al equipo 1 → 95-108 → gana el equipo 1
const adv = M.advanceAfterHand(m);
chk('el partido termina cuando alguien cruza', adv.status==='finished', `score final ${adv.score[0]}-${adv.score[1]}`);
chk('gana el que cruzó', adv.winnerTeam===1);

console.log('\n=== 3) La mano siguiente NO se reparte si el partido terminó ===');
chk('no hay mano nueva tras el fin', adv.currentHand === empatado || adv.currentHand.status==='finished');

console.log('\n=== 4) Objetivo inválido rechazado ===');
let threw=false;
try{ M.createMatch(1, m.roster.map(r=>({...r,hand:[],connected:true})), 0); }catch(e){ threw=true; }
chk('createMatch(…, 0) lanza error', threw);
threw=false;
try{ M.createMatch(1, m.roster.map(r=>({...r,hand:[],connected:true})), -50); }catch(e){ threw=true; }
chk('createMatch(…, -50) lanza error', threw);

console.log(f===0?'\n✅ CASOS BORDE: VERDE':`\n❌ ${f} fallo(s)`);
process.exit(f?1:0);
