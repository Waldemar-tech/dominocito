/**
 * Domino_Socket_v2.js — Integración Socket para Devil33
 *
 * Principio: Devil33 maneja TODO lo visual y toda la lógica de fichas.
 * Nosotros solo hacemos 3 cosas:
 *
 * 1. INIT: Shuffle controlado de Ficha[] para que los slots 0-6 sean
 * la mano del viewer, igual que hace Continuar() pero con las
 * fichas correctas en vez de aleatorio.
 *
 * 2. JUGADA LOCAL: Cuando el viewer hace click, Devil33 llama
 * JugadorColocar() que llama Colocar(rama). Interceptamos
 * el postMessage que emite Domino_Partida.js y lo enviamos
 * al servidor vía socket. NO avanzamos turno localmente —
 * esperamos el domino:state del servidor.
 *
 * 3. JUGADA AJENA: Cuando otro jugador juega, llamamos Colocar(rama)
 * igual que hace la IA en Turno(), usando FichaIzquierda/
 * FichaDerecha exactamente como lo haría Devil33.
 *
 * NO tocamos: posicionamiento manual de fichas, rotation.z, ValorLibre(),
 * BuscarPos*, material.map, ni ninguna lógica interna de Devil33.
 */

// ─── Flag global ───────────────────────────────────────────────
window.__DEVIL33_SOCKET_MODE__ = true;

// ─── Activar modo socket ───────────────────────────────────────
// Llamado por Domino33.tsx una vez que el iframe está listo.
// Prepara Devil33 para recibir estado del servidor en vez de jugar solo.
Domino.ActivarModoSocket = function() {
 console.log('[Socket] ActivarModoSocket');

 // Desactivar la IA local y el loop de turnos automáticos
 // (los guards en Domino_Partida.js con __DEVIL33_SOCKET_MODE__ ya lo hacen)

 // Ocultar el menú de inicio de Devil33 — nosotros controlamos el flujo
 if (typeof UI !== 'undefined' && UI.OcultarEmpezar) UI.OcultarEmpezar();

 // Inicializar la escena con fichas en posición de espera
 // Usamos Continuar() pero lo interrumpimos antes del JugadorInicio/Turno
 // La forma más limpia: llamar CrearFichas() + posicionar manualmente
 // exactamente como hace Continuar() — sin shuffle ni turno
 var partida = Domino.Partida;

 partida.Mano = 1;
 partida.ManoTerminada = false;
 partida.ContinuandoPartida = true; // evitar que Continuar() corra sola
 partida.Pasado = 0;
 partida.TurnoActual = 0;
 partida.JugadorActual = 0;

 partida.CrearFichas();

 // Posicionar fichas exactamente como Continuar() — sin shuffle
 for (var i = 0; i < 7; i++) {
 partida.Ficha[i].RotarV();
 partida.Ficha[i].Ficha.position.set(-3.8 + (1.25 * i), 0, 5.5);

 partida.Ficha[14 + i].RotarV();
 partida.Ficha[14 + i].RotarBocaAbajo();
 partida.Ficha[14 + i].Ficha.position.set(-3.8 + (1.25 * i), 0, -12);

 partida.Ficha[7 + i].RotarH();
 partida.Ficha[7 + i].RotarBocaAbajo();
 partida.Ficha[7 + i].Ficha.position.set(15, 0, -6.5 + (1.25 * i));

 partida.Ficha[21 + i].RotarH();
 partida.Ficha[21 + i].RotarBocaAbajo();
 partida.Ficha[21 + i].Ficha.position.set(-15, 0, -6.5 + (1.25 * i));
 }

 window.ContadorDerecha = 0;
 window.ContadorIzquierda = 0;
 window.FinContadorIzquierda = 5;
 window.FinContadorDerecha = 5;

 partida.MostrarMensaje(0, '<span>Esperando inicio…</span>');
};

// ─── SyncState ─────────────────────────────────────────────────
// Llamado por Domino33.tsx cada vez que llega un domino:state del servidor.
// gameState: objeto GameState del servidor
// viewerUserId: number — userId del jugador local
Domino.SyncState = function(gameState, viewerUserId) {
 var partida = Domino.Partida;
 if (!partida || !partida.Ficha || partida.Ficha.length !== 28) {
 console.warn('[Socket] SyncState: Partida no lista');
 return;
 }

 var state = gameState;
 console.log('[Socket] SyncState board=' + state.board.length +
 ' turn=' + state.currentTurn +
 ' viewer=' + viewerUserId);

 // ── 1. Encontrar posición del viewer en el servidor ──────────
 var myServerPos = -1;
 var myPlayer = null;
 for (var pi = 0; pi < state.players.length; pi++) {
 if (Number(state.players[pi].userId) === Number(viewerUserId)) {
 myServerPos = state.players[pi].position;
 myPlayer = state.players[pi];
 break;
 }
 }
 if (myServerPos === -1) {
 console.warn('[Socket] SyncState: viewer no encontrado en players');
 return;
 }

 // ── 2. Mapear server pos → visual pos de Devil33 ─────────────
 // Devil33: pos visual 0 = abajo (viewer), 1 = derecha, 2 = arriba, 3 = izquierda
 // El viewer SIEMPRE ocupa visual 0.
 // Los oponentes van en visual 1,2,3 en orden de server pos (saltando al viewer).
 var serverToVisual = {};
 serverToVisual[myServerPos] = 0;
 var nextVisual = 1;
 for (var op = 0; op < 4; op++) {
 if (op === myServerPos) continue;
 serverToVisual[op] = nextVisual++;
 }

 // ── 3. Primera vez que llega state 'playing': hacer el shuffle ─
 // Solo si el board está vacío O si las fichas de slots 0-6 no coinciden
 // con la mano del viewer. Detectamos esto comparando Ficha[0].Valores.
 // FIX: las fichas que ya están en el tablero NO pueden estar en la mano.
 // El bug de "fichas sin pips" nace cuando hand ∩ board comparten un tile:
 // _shuffleToHand lo mete en la mano y luego _reproducirJugada (que escanea
 // desde fi=0) lo roba para el tablero, dejando el slot con Colocada=true.
 var _tk = function(t) { return Math.min(t[0], t[1]) + '-' + Math.max(t[0], t[1]); };
 var onBoard = {};
 for (var _bi = 0; _bi < state.board.length; _bi++) {
 onBoard[_tk(state.board[_bi].tile)] = true;
 }
 var rawHand = myPlayer ? myPlayer.hand : [];
 var myHand = rawHand.filter(function(t) { return !onBoard[_tk(t)]; });
 var handIsZero = myHand.length > 0 && myHand.every(function(t) { return t[0] === 0 && t[1] === 0; });

 if (!handIsZero && myHand.length > 0) {
 // Verificar si Ficha[0] ya tiene el valor correcto
 var f0 = partida.Ficha[0];
 var f0ok = f0 && f0.Valores[0] === myHand[0][0] && f0.Valores[1] === myHand[0][1];

 if (!f0ok) {
 // Shuffle controlado: mover las fichas correctas a slots 0-6
 // (igual que Continuar() hace shuffle aleatorio, pero aquí es controlado)
 _shuffleToHand(partida.Ficha, myHand);
 // Después del shuffle, RESET DURO de la mano: nunca 'colocada',
 // boca arriba, vertical, y cara blanca limpia (por si un hover
 // dejó la MaterialCaraR amarilla pegada). Esto garantiza que los
 // pips (Textura1/Textura2) queden visibles hacia la cámara.
 for (var ri2 = 0; ri2 < 7; ri2++) {
 var fh = partida.Ficha[ri2];
 fh.Colocada = false;
 fh.Cara1.material = Texturas.MaterialCara;
 fh.Cara2.material = Texturas.MaterialCara;
 fh.RotarBocaArriba();
 fh.RotarV();
 fh.Ficha.position.set(-3.8 + (1.25 * ri2), 0, 5.5);
 }
 // Re-posicionar también los slots que recibieron fichas del viewer (pueden haber venido de pos 0)
 for (var ri3 = 7; ri3 < 28; ri3++) {
 if (ri3 < 14) { // slots 7-13: derecha
 partida.Ficha[ri3].RotarH();
 partida.Ficha[ri3].RotarBocaAbajo();
 partida.Ficha[ri3].Ficha.position.set(15, 0, -6.5 + (1.25 * (ri3-7)));
 } else if (ri3 < 21) { // slots 14-20: arriba
 partida.Ficha[ri3].RotarV();
 partida.Ficha[ri3].RotarBocaAbajo();
 partida.Ficha[ri3].Ficha.position.set(-3.8 + (1.25 * (ri3-14)), 0, -12);
 } else { // slots 21-27: izquierda
 partida.Ficha[ri3].RotarH();
 partida.Ficha[ri3].RotarBocaAbajo();
 partida.Ficha[ri3].Ficha.position.set(-15, 0, -6.5 + (1.25 * (ri3-21)));
 }
 }
 console.log('[Socket] Shuffle controlado OK — Ficha[0]=' +
 JSON.stringify(partida.Ficha[0].Valores));
 }
 }

 // ── 4. Reproducir jugadas del board que faltan ───────────────
 // Contar cuántas fichas ya están colocadas
 var yaColocadas = 0;
 for (var fi = 0; fi < 28; fi++) {
 if (partida.Ficha[fi].Colocada) yaColocadas++;
 }
 var boardLen = state.board.length;

 if (boardLen > yaColocadas) {
 // Hay jugadas nuevas que reproducir
 var sorted = state.board.slice().sort(function(a, b) { return a.order - b.order; });
 for (var bi = yaColocadas; bi < sorted.length; bi++) {
 _reproducirJugada(partida, sorted[bi], serverToVisual, state.players);
 }
 }

 // ── 5. Actualizar turno / HUD ────────────────────────────────
 partida.JugadorActual = serverToVisual[state.currentTurn] !== undefined
 ? serverToVisual[state.currentTurn]
 : 0;
 partida.TurnoActual = state.moveCount || 0;

 // HUD
 var manoEl = document.getElementById('Mano');
 var turnoEl = document.getElementById('Turno');
 var jugEl = document.getElementById('Jugador');
 if (manoEl) manoEl.innerHTML = '1';
 if (turnoEl) turnoEl.innerHTML = String(state.moveCount || 0);
 if (jugEl) jugEl.innerHTML = String(partida.JugadorActual + 1);

 // ── 6. Mostrar ayuda si es el turno del viewer ───────────────
 // Solo mostrar ayuda si ya hay fichas en el tablero (FichaIzquierda tiene ValorLibre)
 var fichasEnMesa = 0;
 for (var ci2 = 0; ci2 < 28; ci2++) { if (partida.Ficha[ci2].Colocada) fichasEnMesa++; }
 if (partida.JugadorActual === 0 && state.status === 'playing' && fichasEnMesa > 0 &&
 typeof partida.FichaIzquierda.ValorLibre === 'function') {
 partida.MostrarAyuda();
 } else {
 if (typeof partida.OcultarAyuda === 'function') partida.OcultarAyuda();
 }

 // ── 7. Animar luz ────────────────────────────────────────────
 if (Domino.AnimarLuz && Domino.Opciones && Domino.Opciones.AniTurno === 'true') {
 Domino.AnimarLuz(partida.JugadorActual);
 }
};

// ─── Helpers internos ──────────────────────────────────────────

/**
 * Shuffle controlado: reorganiza partida.Ficha[] para que los slots
 * correctos tengan las fichas de cada jugador.
 *
 * Visual slot 0 (viewer, abajo) → fichas de myHand
 * Visual slots 1,2,3 (oponentes) → fichas restantes (boca abajo, valor no importa)
 */
function _shuffleToHand(fichas, myHand) {
 // Encontrar y mover cada ficha de la mano al slot correcto (0..6)
 for (var i = 0; i < myHand.length && i < 7; i++) {
 var want = myHand[i];
 // Buscar la ficha con ese valor en todo el array
 var foundIdx = -1;
 for (var j = 0; j < fichas.length; j++) {
 var v = fichas[j] && fichas[j].Valores;
 if (!v) continue;
 if (Math.min(v[0], v[1]) === Math.min(want[0], want[1]) &&
 Math.max(v[0], v[1]) === Math.max(want[0], want[1])) {
 foundIdx = j;
 break;
 }
 }
 if (foundIdx === -1 || foundIdx === i) continue;
 // Swap
 var tmp = fichas[i];
 fichas[i] = fichas[foundIdx];
 fichas[foundIdx] = tmp;
 }
}

/**
 * Reproducir una jugada del board usando Colocar() de Devil33.
 * Exactamente igual que hace la IA en Turno():
 * ficha.Colocar(partida.FichaIzquierda) o ficha.Colocar(partida.FichaDerecha)
 */
function _reproducirJugada(partida, boardEntry, serverToVisual, players) {
 // No necesitamos el visualPos para reproducir — solo necesitamos
 // encontrar la ficha por valor y llamar Colocar con la rama correcta.
 // Devil33 calcula la posición visual internamente via FichaIzquierda/FichaDerecha.

 // Buscar la ficha por valor en todo el array (incluyendo boca abajo de oponentes)
 var tile = boardEntry.tile;
 var fichaIdx = -1;
 // Paso 1: buscar en slots de oponentes (7-27), no colocadas.
 for (var fi = 7; fi < 28; fi++) {
 var f = partida.Ficha[fi];
 if (!f || f.Colocada) continue;
 var v = f.Valores;
 if (Math.min(v[0], v[1]) === Math.min(tile[0], tile[1]) &&
 Math.max(v[0], v[1]) === Math.max(tile[0], tile[1])) {
 fichaIdx = fi;
 break;
 }
 }
 // Paso 2: fallback a slots del viewer (0-6), SOLO si ya están Colocada=true.
 // (el viewer jugó esa ficha — el motor local la marcó colocada antes del SyncState).
 // NUNCA consumir una ficha del viewer con Colocada=false (aún en mano).
 if (fichaIdx === -1) {
 for (var fi2 = 0; fi2 < 7; fi2++) {
 var f2 = partida.Ficha[fi2];
 if (!f2 || !f2.Colocada) continue; // solo Colocada=true
 var v2 = f2.Valores;
 if (Math.min(v2[0], v2[1]) === Math.min(tile[0], tile[1]) &&
 Math.max(v2[0], v2[1]) === Math.max(tile[0], tile[1])) {
 fichaIdx = fi2;
 break;
 }
 }
 }

 console.log('[Socket] _reproducirJugada tile=' + JSON.stringify(tile) + ' found=' + fichaIdx + ' colocadas_antes=' + (function(){ var n=0; for(var x=0;x<partida.Ficha.length;x++) if(partida.Ficha[x].Colocada) n++; return n; })());
 if (fichaIdx === -1) {
 console.warn('[Socket] _reproducirJugada: ficha no encontrada', tile);
 return;
 }

 var ficha = partida.Ficha[fichaIdx];

 // Primera jugada: sin FichaOrigen (como el doble 6)
 var colocadas = 0;
 for (var ci = 0; ci < partida.Ficha.length; ci++) {
 if (partida.Ficha[ci].Colocada) colocadas++;
 }

 if (colocadas === 0) {
 // Primera ficha — igual que Turno() turno 0
 ficha.Colocar(false, true);
 } else {
 // Ficha siguiente — usar la rama correcta exactamente como la IA
 var rama = (boardEntry.side === 'left')
 ? partida.FichaIzquierda
 : partida.FichaDerecha;
 ficha.Colocar(rama, true);
 }
}
