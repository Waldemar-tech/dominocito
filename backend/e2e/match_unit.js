// Prueba la cadena advanceAfterHand SIN sockets: simula manos terminadas y
// verifica que el marcador, la rotación y el fin de partido son correctos.
const E = require('../dist/engine/domino-classic');
const M = require('../dist/engine/domino-match');
let f=0; const chk=(n,c,e='')=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(e?' — '+e:''));if(!c)f++;};

function roster(){return [
  {userId:1,username:'A',position:0,team:0,hand:[],connected:true},
  {userId:2,username:'B',position:1,team:1,hand:[],connected:true},
  {userId:3,username:'C',position:2,team:0,hand:[],connected:true},
  {userId:4,username:'D',position:3,team:1,hand:[],connected:true}];}

// jugar una mano entera vía motor puro
function playHand(match){
  let h=match.currentHand,g=0;
  while(h.status==='playing'&&++g<600){
    const cur=h.players.find(p=>p.position===h.currentTurn);
    let r; if(h.board.length===0){ r=h.openingTile?E.playTile(h,cur.userId,h.openingTile,'right'):E.playTile(h,cur.userId,cur.hand[cur.hand.length-1],'right'); }
    else{ const mv=E.legalMoves(cur.hand,h.leftEnd,h.rightEnd); r=mv.length?E.playTile(h,cur.userId,mv[0].tile,mv[0].side):E.passTurn(h,cur.userId); }
    if(!r.ok)throw new Error(r.error); h=r.newState; match=M.updateCurrentHand(match,h);
  }
  return M.advanceAfterHand(match);
}

console.log('=== Partido completo a 100 (motor puro, la lógica que usa el socket) ===');
let m=M.createMatch(1,roster(),100),manos=0,starters=[];
while(m.status==='playing'&&manos<200){ starters.push(m.currentStarterPosition); m=playHand(m); manos++; }
chk('el partido termina con ganador',m.status==='finished'&&m.winnerTeam!==null,`equipo ${m.winnerTeam}, ${m.score[0]}-${m.score[1]}, ${manos} manos`);
chk('el ganador llegó a 100',m.score[m.winnerTeam]>=100);
chk('rotación de salida +1 cada mano',starters.slice(1).every((v,i)=>v===(starters[i]+1)%4),starters.join(','));
chk('historial completo',m.history.length===manos);

console.log('\n=== La revelación del perdedor sale del history (lo que emite el socket) ===');
const h0=m.history[0];
const losing = h0.winningTeam===null?null:(h0.winningTeam===0?1:0);
chk('cada mano sabe qué equipo perdió',losing!==null||h0.winType===null,`mano1: ganó ${h0.winningTeam}, perdió ${losing}`);

console.log(f===0?'\n✅ LÓGICA DE PARTIDO (unit): VERDE':`\n❌ ${f} fallo(s)`);
process.exit(f?1:0);
