/**
 * Domino_Socket.js — Hooks de modo socket sobre Devil33
 *
 * Este archivo se carga DESPUÉS de Domino.js (cuando `var Domino` ya existe)
 * y agrega funciones que el wrapper React (Domino33.tsx) puede llamar:
 *
 *   - Domino.ActivarModoSocket() → desactiva IA local y prepara el render
 *   - Domino.SyncState(state, viewerUserId) → aplica un GameState del socket
 *
 * NO reemplaza la lógica de juego: Devil33 sigue siendo el render 3D.
 * Solo añade la API para que el wrapper controle qué fichas se ven y dónde.
 */

(function() {
  'use strict';

  if (typeof Domino === 'undefined' || !Domino) {
    console.error('[Domino_Socket] Domino no está definido. ¿Se cargó Domino.js antes?');
    return;
  }

  // ─────────────────────────────────────────────────────────────
  // Activar modo socket
  // ─────────────────────────────────────────────────────────────
  Domino.ActivarModoSocket = function() {
    var _dominoRef = this;
    console.log('[Domino_Socket] ActivarModoSocket START');
    try {
    window.__DEVIL33_SOCKET_MODE__ = true;
    var partida = this.Partida;
    console.log('[Domino_Socket] partida ok, has Ficha?', !!(partida && partida.Ficha));
    partida.ModoSocket = true;
    // Cancelar el Turno() automático que disparó la carga (si lo hubo)
    partida.ManoTerminada = false;
    partida.Pasado = 0;
    partida.TurnoActual = 0;
    partida.JugadorActual = 0;

    // Recrear las 28 fichas en sus posiciones iniciales (idéntico a Partida.Continuar)
    partida.CrearFichas();
    console.log('[Domino_Socket] post-CrearFichas ficha0 pos=', partida.Ficha[0]?.Ficha?.position?.x, partida.Ficha[0]?.Ficha?.position?.z);
    for (var i = 0; i < 7; i++) {
      // Jugador 0 (abajo) - mano visible (descubierta por defecto en CrearFichas)
      partida.Ficha[i].RotarV();
      partida.Ficha[i].Ficha.position.set(-3.8 + (1.25 * i), 0, 5.5);
      // Jugador 2 (arriba) - boca abajo
      partida.Ficha[14 + i].RotarV();
      partida.Ficha[14 + i].RotarBocaAbajo();
      partida.Ficha[14 + i].Ficha.position.set(-3.8 + (1.25 * i), 0, -12);
    }
    for (var j = 0; j < 7; j++) {
      // Jugador 1 (derecha) - boca abajo
      partida.Ficha[7 + j].RotarH();
      partida.Ficha[7 + j].RotarBocaAbajo();
      partida.Ficha[7 + j].Ficha.position.set(15, 0, -6.5 + (1.25 * j));
      // Jugador 3 (izquierda) - boca abajo
      partida.Ficha[21 + j].RotarH();
      partida.Ficha[21 + j].RotarBocaAbajo();
      partida.Ficha[21 + j].Ficha.position.set(-15, 0, -6.5 + (1.25 * j));
    }
    console.log('[Domino_Socket] post-posicion ficha0 pos=', partida.Ficha[0]?.Ficha?.position?.x, partida.Ficha[0]?.Ficha?.position?.z, 'ficha7 pos=', partida.Ficha[7]?.Ficha?.position?.x, partida.Ficha[7]?.Ficha?.position?.z);

    partida.MostrarMensaje(0, '<span>Esperando inicio de partida…</span>');

    // Monkey-patch: en socket mode, las funciones Mostrar/Ocultar marcos de Devil33
    // son no-ops. El wrapper React controla qué UI mostrar via DOMino:state.
    if (typeof UI !== 'undefined') {
      UI.MostrarEmpezar = function() { /* no-op en socket mode */ };
      UI.OcultarEmpezar = function() { /* no-op */ };
      UI.MostrarEquipos = function() { /* no-op */ };
      UI.MostrarOpciones = function() { /* no-op */ };
      UI.MostrarContinuar = function() { /* no-op */ };
      UI.MostrarEmpate = function() { /* no-op */ };
      UI.MostrarGanador = function() { /* no-op */ };
      UI.MostrarVictoria = function() { /* no-op */ };
      UI.MostrarDerrota = function() { /* no-op */ };
      UI.MostrarPartidaGanada = function() { /* no-op */ };
      UI.MostrarPartidaPerdida = function() { /* no-op */ };
    }

    // Forzar ocultación inmediata de los marcos
    var ids = ['MarcoEmpezar', 'MarcoEquipos', 'MarcoOpciones', 'DatosJuego', 'Historial'];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el) {
        el.removeAttribute('visible');
        el.style.display = 'none';
      }
    }

    // Idioma: forzar español si está disponible
    if (typeof UI !== 'undefined' && UI.OpcionesCanvas) {
      UI.OpcionesCanvas.Idioma = 'es';
      try { UI.Idioma_Es(); } catch (e) { /* puede que no exista */ }
    }

    console.log('[Domino_Socket] Modo socket activado');

    } catch (err) {
      console.error('[Domino_Socket] ERROR en ActivarModoSocket:', err && err.message ? err.message : err);
    }
  };

  // Override CSS para socket mode: forzar marcos fuera de pantalla sin transición
  // (se inyecta solo si no existe ya)
  if (!document.getElementById('__devil33_socket_css__')) {
    var style = document.createElement('style');
    style.id = '__devil33_socket_css__';
    style.textContent =
      '#MarcoEmpezar[visible="true"], #MarcoContinuar[visible="true"], ' +
      '#MarcoEmpate[visible="true"], #MarcoTerminado[visible="true"], ' +
      '#MarcoOpciones[visible="true"], #MarcoEquipos[visible="true"] {' +
      'top:250% !important; transition:none !important;' +
      '}';
    document.head.appendChild(style);
  }

  // ─────────────────────────────────────────────────────────────
  // Helpers internos
  // ─────────────────────────────────────────────────────────────

  // Asigna valores a una ficha y rebindea las texturas de Three.js
  function setFichaValores(ficha, valores) {
    if (!ficha) return;
    ficha.Valores = [valores[0], valores[1]];
    if (ficha.Textura1 && typeof Texturas !== 'undefined' && Texturas.Textura) {
      ficha.Textura1.material.map = Texturas.Textura[valores[0]] || Texturas.Textura[0];
      ficha.Textura1.material.needsUpdate = true;
    }
    if (ficha.Textura2 && typeof Texturas !== 'undefined' && Texturas.Textura) {
      ficha.Textura2.material.map = Texturas.Textura[valores[1]] || Texturas.Textura[0];
      ficha.Textura2.material.needsUpdate = true;
    }
  }

  // Encuentra el índice de Partida.Ficha que corresponde a (position, tile).
  // - Si `allowColocada=true`, busca también entre las ya colocadas (útil para
  //   detectar re-syncs donde Devil33 ya tenía la ficha en mesa).
  // - Devuelve -1 si no la encuentra.
  function findFichaIndex(partida, position, tile, allowColocada) {
    var start = position * 7;
    var end = start + 7;
    var t0 = Math.min(tile[0], tile[1]);
    var t1 = Math.max(tile[0], tile[1]);
    for (var i = start; i < end; i++) {
      var f = partida.Ficha[i];
      if (!f) continue;
      if (!allowColocada && f.Colocada) continue;
      var f0 = Math.min(f.Valores[0], f.Valores[1]);
      var f1 = Math.max(f.Valores[0], f.Valores[1]);
      if (f0 === t0 && f1 === t1) return i;
    }
    return -1;
  }

  // Cuenta cuántas fichas de `position` están en el array `board` (del state)
  function countBoardTilesForPlayer(state, userId) {
    var c = 0;
    for (var i = 0; i < state.board.length; i++) {
      if (state.board[i].userId === userId) c++;
    }
    return c;
  }

  // ─────────────────────────────────────────────────────────────
  // Aplicar un GameState del socket al render 3D
  // ─────────────────────────────────────────────────────────────
  Domino.SyncState = function(state, viewerUserId) {
    try {
    if (!window.__DEVIL33_SOCKET_MODE__) {
      console.warn('[Domino_Socket] SyncState llamado pero modo socket no activo');
      return;
    }
    console.log('[Domino_Socket] SyncState START viewer=' + viewerUserId + ' board=' + state.board.length + ' turn=' + state.currentTurn + ' players=' + state.players.length);
    var partida = this.Partida;
    if (!partida || !partida.Ficha || partida.Ficha.length !== 28) {
      console.warn('[Domino_Socket] Partida no inicializada');
      return;
    }

    // 1. Mapear players por posición y por userId
    var playerByPos = {};
    var playerByUserId = {};
    var myPosInServer = -1;
    for (var i = 0; i < state.players.length; i++) {
      playerByPos[state.players[i].position] = state.players[i];
      playerByUserId[String(state.players[i].userId)] = state.players[i];
      if (String(state.players[i].userId) === String(viewerUserId)) myPosInServer = state.players[i].position;
    }
    if (myPosInServer === -1) {
      console.warn('[Domino_Socket] viewerUserId=' + viewerUserId + ' no encontrado en state.players, asumiendo pos 0');
      myPosInServer = 0;
    }

    // Calcular las 28 fichas totales del doble-6
    var ALL_TILES = [];
    for (var a = 0; a <= 6; a++) for (var b = a; b <= 6; b++) ALL_TILES.push([a, b]);
    function tileKey(t) { return t[0] + '|' + t[1]; }

    // Construir set de fichas "conocidas": mi mano + fichas en board
    var knownKeys = {};
    var myPlayer = playerByUserId[String(viewerUserId)];
    if (!myPlayer) myPlayer = playerByPos[myPosInServer];
    if (myPlayer && myPlayer.hand) {
      for (var mh = 0; mh < myPlayer.hand.length; mh++) knownKeys[tileKey(myPlayer.hand[mh])] = true;
    }
    for (var be = 0; be < state.board.length; be++) knownKeys[tileKey(state.board[be].tile)] = true;

    // Pool de fichas NO conocidas (se las asignamos a los oponentes para que
    // findFichaIndex pueda encontrarlas cuando jueguen)
    var unknownPool = ALL_TILES.filter(function (t) { return !knownKeys[tileKey(t)]; });

    // 2. Asignar valores a las 28 fichas.
    //    El render interno de Devil33 mapea por grupos de 7: visual pos 0 = Ficha[0..6], visual pos 1 = Ficha[7..13], visual pos 2 = Ficha[14..20], visual pos 3 = Ficha[21..27].
    //    El viewer siempre ocupa la posición visual 0 (abajo). Los oponentes se mapean a slots visuales 1,2,3.
    var visualHands = [[], [], [], []];
    var serverPosToVisualPos = {};
    visualHands[0] = (myPlayer && myPlayer.hand) ? myPlayer.hand.slice() : [];
    serverPosToVisualPos[myPosInServer] = 0;
    var nextVisual = 1;
    for (var op = 0; op < 4; op++) {
      if (op === myPosInServer) continue;
      var oppPlayer = playerByPos[op];
      if (oppPlayer) {
        visualHands[nextVisual] = oppPlayer.hand || [];
        serverPosToVisualPos[op] = nextVisual;
        nextVisual++;
      }
    }
    console.log('[Domino_Socket] viewer serverPos=' + myPosInServer + ' visualSlot=0, serverPosToVisualPos=' + JSON.stringify(serverPosToVisualPos));

    var opponentAssignIdx = 0;
    for (var vp = 0; vp < 4; vp++) {
      var vhand = visualHands[vp] || [];
      for (var j = 0; j < 7; j++) {
        var f = partida.Ficha[vp * 7 + j];
        if (!f) continue;
        if (vp === 0) {
          // Mano del viewer (visual pos 0): viene del servidor
          var tile = vhand[j];
          if (tile) {
            setFichaValores(f, tile);
          } else {
            setFichaValores(f, [0, 0]);
          }
        } else {
          // Oponente: asignar valor único del pool de desconocidas
          if (opponentAssignIdx < unknownPool.length) {
            setFichaValores(f, unknownPool[opponentAssignIdx]);
          } else {
            setFichaValores(f, [0, 0]);
          }
          opponentAssignIdx++;
        }
      }
    }

    // 3. Resetear extremos si el board está vacío
    if (state.board.length === 0) {
      partida.FichaIzquierda = { Rama: 'izquierda', ValorLibre: function() { return null; } };
      partida.FichaDerecha   = { Rama: 'derecha',   ValorLibre: function() { return null; } };
    }

    // 4. Colocar las fichas del board en orden
    //    Estrategia robusta: si NO podemos colocar alguna ficha del board,
    //    hacer un RESET FULL (recrear todas las fichas y reconstruir el board).
    var failed = false;
    var firstFailure = null;
    for (var b = 0; b < state.board.length; b++) {
      var entry = state.board[b];
      var t = entry.tile;
      // Encontrar el visual pos del jugador (para findFichaIndex que busca por grupo de 7)
      var playerServerPos = 0;
      for (var k = 0; k < state.players.length; k++) {
        if (state.players[k].userId === entry.userId) {
          playerServerPos = state.players[k].position;
          break;
        }
      }
      var playerPos = serverPosToVisualPos[playerServerPos] !== undefined ? serverPosToVisualPos[playerServerPos] : playerServerPos;
      var idx = findFichaIndex(partida, playerPos, t, false);
      if (idx === -1) {
        // Verificar si ya estaba colocada (re-sync)
        var idxColocada = findFichaIndex(partida, playerPos, t, true);
        if (idxColocada !== -1) {
          // Ya estaba en mesa; asumimos que el board ya está en orden.
          // Pero por seguridad, marcamos como "todo OK" y seguimos.
          continue;
        }
        failed = true;
        if (!firstFailure) firstFailure = { entry: entry, playerPos: playerPos };
        break;
      }
      var ficha = partida.Ficha[idx];
      var rama = (entry.side === 'left') ? partida.FichaIzquierda : partida.FichaDerecha;
      // Si el board está vacío, pasamos false para que sea la ficha central
      var useRama = (state.board.length > 0 && b > 0) ? rama : false;
      try {
        ficha.Colocar(useRama, true);
      } catch (err) {
        console.error('[Domino_Socket] Error colocando ficha:', entry, err);
        failed = true;
        firstFailure = { entry: entry, playerPos: playerPos };
        break;
      }
    }

    // 5. Si falló algo, hacer RESET FULL: recrear todas las fichas y reconstruir
    if (failed) {
      console.warn('[Domino_Socket] Sync incremental falló, haciendo RESET FULL. First failure:', firstFailure);
      partida.CrearFichas();
      // Re-ubicar en posiciones iniciales
      for (var ri = 0; ri < 7; ri++) {
        partida.Ficha[ri].RotarV();
        partida.Ficha[ri].Ficha.position.set(-3.8 + (1.25 * ri), 0, 5.5);
        partida.Ficha[14 + ri].RotarV();
        partida.Ficha[14 + ri].RotarBocaAbajo();
        partida.Ficha[14 + ri].Ficha.position.set(-3.8 + (1.25 * ri), 0, -12);
        partida.Ficha[7 + ri].RotarH();
        partida.Ficha[7 + ri].RotarBocaAbajo();
        partida.Ficha[7 + ri].Ficha.position.set(15, 0, -6.5 + (1.25 * ri));
        partida.Ficha[21 + ri].RotarH();
        partida.Ficha[21 + ri].RotarBocaAbajo();
        partida.Ficha[21 + ri].Ficha.position.set(-15, 0, -6.5 + (1.25 * ri));
      }
      // Re-asignar valores (mismo algoritmo que arriba: oponentes reciben valores del pool)
      var oppIdx2 = 0;
      for (var pos2 = 0; pos2 < 4; pos2++) {
        var p2 = playerByPos[pos2];
        if (!p2) continue;
        for (var j2 = 0; j2 < 7; j2++) {
          var f2 = partida.Ficha[pos2 * 7 + j2];
          if (!f2) continue;
          if (pos2 === 0) {
            var tile2 = p2.hand && p2.hand[j2];
            if (tile2) setFichaValores(f2, tile2);
            else setFichaValores(f2, [0, 0]);
          } else {
            if (oppIdx2 < unknownPool.length) {
              setFichaValores(f2, unknownPool[oppIdx2]);
            } else {
              setFichaValores(f2, [0, 0]);
            }
            oppIdx2++;
          }
        }
      }
      // Resetear extremos
      partida.FichaIzquierda = { Rama: 'izquierda', ValorLibre: function() { return null; } };
      partida.FichaDerecha   = { Rama: 'derecha',   ValorLibre: function() { return null; } };
      // Reconstruir board
      // Primero: pre-asignar valores correctos a fichas de oponentes que jugaron
      // (sus slots tienen unknownPool, no el valor real de la ficha jugada)
      for (var preB = 0; preB < state.board.length; preB++) {
        var preEntry = state.board[preB];
        var preServerPos = 0;
        for (var preK = 0; preK < state.players.length; preK++) {
          if (String(state.players[preK].userId) === String(preEntry.userId)) {
            preServerPos = state.players[preK].position; break;
          }
        }
        if (preServerPos === myPosInServer) continue; // mi ficha ya tiene valor correcto
        var preVisualPos = serverPosToVisualPos[preServerPos] !== undefined ? serverPosToVisualPos[preServerPos] : preServerPos;
        var preStart = preVisualPos * 7;
        var preTile = [Math.min(preEntry.tile[0], preEntry.tile[1]), Math.max(preEntry.tile[0], preEntry.tile[1])];
        // Buscar slot libre (no ya asignado) y forzar el valor
        for (var preJ = preStart; preJ < preStart + 7; preJ++) {
          var preF = partida.Ficha[preJ];
          if (!preF) continue;
          var preV = [Math.min(preF.Valores[0], preF.Valores[1]), Math.max(preF.Valores[0], preF.Valores[1])];
          // Si ya tiene el valor correcto, ok
          if (preV[0] === preTile[0] && preV[1] === preTile[1]) break;
          // Asignar al primer slot del grupo
          setFichaValores(preF, preEntry.tile);
          break;
        }
      }

      for (var bb = 0; bb < state.board.length; bb++) {
        var entry2 = state.board[bb];
        var playerServerPos2 = 0;
        for (var k2 = 0; k2 < state.players.length; k2++) {
          if (String(state.players[k2].userId) === String(entry2.userId)) {
            playerServerPos2 = state.players[k2].position;
            break;
          }
        }
        var playerPos2 = serverPosToVisualPos[playerServerPos2] !== undefined ? serverPosToVisualPos[playerServerPos2] : playerServerPos2;
        var idx2 = findFichaIndex(partida, playerPos2, entry2.tile, false);
        if (idx2 === -1) {
          console.error('[Domino_Socket] RESET FULL: ficha no encontrada', entry2);
          continue;
        }
        var ficha2 = partida.Ficha[idx2];
        var rama2 = (entry2.side === 'left') ? partida.FichaIzquierda : partida.FichaDerecha;
        var useRama2 = (bb > 0) ? rama2 : false;
        try { ficha2.Colocar(useRama2, false); } catch (err) { console.error('[Domino_Socket] RESET FULL: error colocando', entry2, err); }
      }
      console.log('[Domino_Socket] RESET FULL completado');
    }

    // 5. Actualizar HUD
    var manoEl = document.getElementById('Mano');
    var turnoEl = document.getElementById('Turno');
    var jugadorEl = document.getElementById('Jugador');
    if (manoEl) manoEl.innerHTML = '1';
    if (turnoEl) turnoEl.innerHTML = String(state.moveCount || 0);
    if (jugadorEl) jugadorEl.innerHTML = String(state.currentTurn + 1);

    // 6. Rotar cámara/luz hacia el jugador del turno actual
    if (this.AnimarLuz && this.Opciones && this.Opciones.AniTurno === 'true') {
      this.AnimarLuz(state.currentTurn);
    }

    // 7. Mensaje de turno
    if (state.currentTurn === 0) {
      partida.MostrarMensaje(0, '<span>Tu turno</span>');
    } else {
      var nameP = playerByPos[state.currentTurn]
        ? playerByPos[state.currentTurn].username
        : ('Jugador ' + (state.currentTurn + 1));
      partida.MostrarMensaje(state.currentTurn, '<span>' + nameP + ' está jugando…</span>');
    }

    console.log('[Domino_Socket] SyncState aplicado: board=' + state.board.length + ', turno=' + state.currentTurn);
    // Debug: leer posiciones después de aplicar
    try {
      var d = window.Domino;
      console.log('[SyncEnd] f0=(' + d?.Partida?.Ficha?.[0]?.Ficha?.position?.x?.toFixed(1) + ',' + d?.Partida?.Ficha?.[0]?.Ficha?.position?.z?.toFixed(1) + ') f14=(' + d?.Partida?.Ficha?.[14]?.Ficha?.position?.x?.toFixed(1) + ',' + d?.Partida?.Ficha?.[14]?.Ficha?.position?.z?.toFixed(1) + ')');
      // Muestrear 3 veces con setTimeout
      for (var s = 1; s <= 4; s++) {
        (function(snap) {
          setTimeout(function() {
            try {
              var dd = window.Domino;
              console.log('[SyncEnd +' + (snap*500) + 'ms] f0=(' + dd?.Partida?.Ficha?.[0]?.Ficha?.position?.x?.toFixed(1) + ',' + dd?.Partida?.Ficha?.[0]?.Ficha?.position?.z?.toFixed(1) + ')');
            } catch (e) { console.log('[SyncEnd +' + (snap*500) + 'ms] err: ' + e.message); }
          }, snap * 500);
        })(s);
      }
    } catch (e) { console.log('[SyncEnd] err: ' + e.message); }
    } catch (err) {
      console.error('[Domino_Socket] ERROR en SyncState:', err && err.message ? err.message : err);
      console.error('[Domino_Socket] stack:', err && err.stack ? err.stack : 'no stack');
    }
  };

  console.log('[Domino_Socket] Hooks registrados. window.Domino.ActivarModoSocket y .SyncState disponibles');
})();