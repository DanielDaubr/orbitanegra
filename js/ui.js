/*
 * Órbita Negra — pass-and-play UI layer.
 *
 * The engine owns the rules; this file owns nothing but presentation and the
 * "hand the device over" ceremony that keeps hidden information hidden.
 */
(function () {
  'use strict';

  const E = window.OrbitaEngine;
  const app = document.getElementById('app');

  // -------------------------------------------------------------------- icons
  // Inline SVG strings, injected through innerHTML on an empty <span>, so they
  // never add text to a button's label.

  function svg(body, extra) {
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || '') + '>' +
      body + '</svg>'
    );
  }

  const ICON = {
    back: svg('<path d="M15 5l-7 7 7 7"/>'),
    gear: svg(
      '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4L5.3 5.3"/><circle cx="12" cy="12" r="6.5"/>'
    ),
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    scanner: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/>'),
    chain: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    airlock: svg('<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M12 3v18M9.5 11v2M14.5 11v2"/>'),
    end: svg('<path d="M12 3.5L2.5 20h19L12 3.5z"/><path d="M12 10v4.5M12 17.2v.3"/>'),
    user: svg('<circle cx="12" cy="8.5" r="3.6"/><path d="M4.5 20c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4"/>'),
    crown: svg('<path d="M3.5 8l4 4 4.5-6.5L16.5 12l4-4-1.8 10H5.3L3.5 8z"/><path d="M5.5 20.5h13"/>'),
    star: svg('<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7L12 3z"/>'),
    lock: svg('<rect x="5" y="11" width="14" height="9.5" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    unlock: svg('<rect x="5" y="11" width="14" height="9.5" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 7.6-1.7"/>'),
    book: svg('<path d="M4 4.5h6a2 2 0 0 1 2 2V20a2 2 0 0 0-2-2H4V4.5zM20 4.5h-6a2 2 0 0 0-2 2V20a2 2 0 0 1 2-2h6V4.5z"/>'),
    scroll: svg('<path d="M7 3.5h11v14a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-1h11v1a3 3 0 0 0 3 3"/><path d="M7 3.5a2 2 0 0 0-2 2v11M10 8h5M10 11.5h5"/>'),
    power: svg('<path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/>'),
    shield: svg('<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6L12 3z"/><path d="M9 12l2.2 2.2L15.5 10"/>'),
    bolt: svg('<circle cx="12" cy="12" r="9"/><path d="M13 6.5l-4.5 6.5h4l-1 4.5 4.5-6.5h-4l1-4.5z"/>'),
    vote: svg('<circle cx="12" cy="12" r="9"/><path d="M8.5 12.3l2.4 2.4 4.8-5"/>'),
    dot: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/>'),
    flag: svg('<path d="M5 21V4M5 4.5h11l-2 3.5 2 3.5H5"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    cross: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    log: svg('<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
    sync: svg('<circle cx="12" cy="12" r="9"/><path d="M8 10a4.2 4.2 0 0 1 7.6-1.2M16 14a4.2 4.2 0 0 1-7.6 1.2"/><path d="M15.8 6.6v2.4h-2.4M8.2 17.4V15h2.4"/>'),
    hex: svg('<path d="M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4l8-4.6z"/><circle cx="12" cy="12" r="3.2"/>')
  };

  // Seen from above. The red core is the thing the infiltrators want to reach.
  const SHIP_SVG =
    '<svg class="ship-wire" viewBox="0 0 120 200" aria-hidden="true">' +
    '<defs><filter id="wglow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.6" result="b"/>' +
    '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
    '<g fill="none" stroke="currentColor" stroke-width="1" stroke-linejoin="round" filter="url(#wglow)">' +
    '<path d="M60 6 L73 28 L78 66 L96 88 L113 128 L105 150 L84 146 L80 176 L68 193 L52 193 L40 176 L36 146 L15 150 L7 128 L24 88 L42 66 L47 28 Z"/>' +
    '<path d="M60 16 V186 M50 36 H70 M45 66 H75 L80 122 H40 Z M24 88 L40 122 M96 88 L80 122 M15 150 L40 136 M105 150 L80 136"/>' +
    '<path d="M48 150 H72 V176 H48 Z M53 176 L52 193 M67 176 L68 193 M7 128 L36 128 M113 128 L84 128" opacity=".7"/>' +
    '<path d="M54 22 L66 22 L64 30 L56 30 Z" opacity=".8"/>' +
    '</g>' +
    '<g class="ship-core"><circle cx="60" cy="100" r="15" fill="none" stroke-dasharray="3 3"/>' +
    '<circle cx="60" cy="100" r="9" fill="none"/><circle cx="60" cy="100" r="3.5" class="core-dot"/></g>' +
    '</svg>';

  const LOGO_SVG =
    '<svg class="logo-ring" viewBox="0 0 120 120" aria-hidden="true">' +
    '<defs><linearGradient id="lgr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7cf6ff"/>' +
    '<stop offset="1" stop-color="#0891b2"/></linearGradient>' +
    '<filter id="lglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3" result="b"/>' +
    '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
    '<circle cx="60" cy="60" r="54" fill="none" stroke="#22d3ee" stroke-opacity=".35" stroke-width="1"/>' +
    '<circle cx="60" cy="60" r="38" fill="none" stroke="url(#lgr)" stroke-width="10" stroke-linecap="round" ' +
    'stroke-dasharray="200 39" transform="rotate(-50 60 60)" filter="url(#lglow)"/>' +
    '<circle cx="60" cy="60" r="25" fill="none" stroke="#22d3ee" stroke-opacity=".6" stroke-width="1.2"/>' +
    '<path d="M60 2v8M60 110v8M2 60h8M110 60h8" stroke="#22d3ee" stroke-width="1.4"/>' +
    '</svg>';

  const HERO_SHIP_SVG =
    '<svg class="hero-ship" viewBox="0 0 360 200" aria-hidden="true">' +
    '<defs><radialGradient id="planet" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#1e3a5f"/>' +
    '<stop offset=".7" stop-color="#0b1730"/><stop offset="1" stop-color="#050a14"/></radialGradient>' +
    '<linearGradient id="hull" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b4a63"/>' +
    '<stop offset="1" stop-color="#0d1524"/></linearGradient>' +
    '<filter id="eglow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3"/></filter></defs>' +
    '<circle cx="300" cy="42" r="30" fill="url(#planet)"/>' +
    '<path d="M272 30 A30 30 0 0 1 328 26" fill="none" stroke="#7dd3fc" stroke-opacity=".7" stroke-width="1.2"/>' +
    '<g transform="rotate(-14 180 110)">' +
    '<path d="M24 128 L150 92 L236 70 L322 70 L334 84 L296 92 L330 104 L318 116 L238 120 L150 136 Z" fill="url(#hull)" stroke="#5b7290" stroke-width="1"/>' +
    '<path d="M150 92 L170 112 L150 136 M236 70 L246 96 L238 120 M90 110 L180 102 L300 96" fill="none" stroke="#8fb3d9" stroke-opacity=".45" stroke-width=".8"/>' +
    '<path d="M180 80 L250 60 L282 62 L246 76 Z" fill="#1a2538" stroke="#5b7290" stroke-width=".8"/>' +
    '<path d="M178 132 L246 142 L278 140 L244 126 Z" fill="#1a2538" stroke="#5b7290" stroke-width=".8"/>' +
    '<g fill="#cfe8ff" opacity=".7"><rect x="200" y="98" width="3" height="2"/><rect x="210" y="97" width="3" height="2"/>' +
    '<rect x="220" y="96" width="3" height="2"/><rect x="262" y="94" width="3" height="2"/></g>' +
    '<circle cx="330" cy="90" r="8" fill="#ff3b5c" filter="url(#eglow)"/><circle cx="330" cy="90" r="3" fill="#ffd1d9"/>' +
    '<circle cx="324" cy="110" r="5" fill="#ff3b5c" filter="url(#eglow)" opacity=".8"/>' +
    '<circle cx="140" cy="116" r="2.5" fill="#ff3b5c"/>' +
    '</g></svg>';

  function portraitSvg(role) {
    const tone = role === 'android' ? '#ff3b5c' : role === 'infiltrator' ? '#a78bfa' : '#22d3ee';
    let head;
    if (role === 'android') {
      head =
        '<path d="M100 38 C132 38 148 62 148 92 L143 128 C139 147 122 160 100 162 C78 160 61 147 57 128 L52 92 C52 62 68 38 100 38 Z" fill="url(#pfill)" stroke="#47536b" stroke-width="1.4"/>' +
        '<path d="M100 40 V86 M70 64 C84 56 116 56 130 64" fill="none" stroke="#5b6884" stroke-width="1"/>' +
        '<path d="M62 96 L95 104 L95 113 L66 107 Z M138 96 L105 104 L105 113 L134 107 Z" fill="' + tone + '" filter="url(#pglow)"/>' +
        '<path d="M80 132 H120 M86 142 H114" stroke="#5b6884" stroke-width="1.2"/>';
    } else if (role === 'infiltrator') {
      head =
        '<path d="M100 30 C140 32 156 70 152 108 L146 150 C130 162 116 166 100 166 C84 166 70 162 54 150 L48 108 C44 70 60 32 100 30 Z" fill="url(#pfill)" stroke="#4a3f6b" stroke-width="1.4"/>' +
        '<path d="M100 62 C124 62 134 84 132 108 C130 134 116 148 100 148 C84 148 70 134 68 108 C66 84 76 62 100 62 Z" fill="#06070d"/>' +
        '<path d="M80 102 L94 106 M120 102 L106 106" stroke="' + tone + '" stroke-width="4" stroke-linecap="round" filter="url(#pglow)"/>';
    } else {
      head =
        '<circle cx="100" cy="100" r="56" fill="url(#pfill)" stroke="#3f5a74" stroke-width="1.4"/>' +
        '<path d="M60 96 C62 72 80 62 100 62 C120 62 138 72 140 96 C140 122 122 134 100 134 C78 134 60 122 60 96 Z" fill="#05121c" stroke="' + tone + '" stroke-width="1.2" stroke-opacity=".7"/>' +
        '<path d="M74 82 C82 72 96 70 106 72" fill="none" stroke="' + tone + '" stroke-width="3" stroke-linecap="round" opacity=".8" filter="url(#pglow)"/>' +
        '<path d="M100 44 V30 M100 30 h8" stroke="#3f5a74" stroke-width="2"/>' +
        '<circle cx="146" cy="104" r="5" fill="' + tone + '" filter="url(#pglow)"/>';
    }

    return (
      '<svg viewBox="0 0 200 200" aria-hidden="true">' +
      '<defs><linearGradient id="pfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26324a"/>' +
      '<stop offset="1" stop-color="#090e19"/></linearGradient>' +
      '<filter id="pglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.5" result="b"/>' +
      '<feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
      '<circle cx="100" cy="96" r="84" fill="none" stroke="' + tone + '" stroke-width="3" stroke-opacity=".85" ' +
      'stroke-dasharray="120 14 40 14" filter="url(#pglow)"/>' +
      '<circle cx="100" cy="96" r="70" fill="none" stroke="' + tone + '" stroke-width="1" stroke-opacity=".35"/>' +
      '<path d="M22 200 C30 168 60 152 100 152 C140 152 170 168 178 200 Z" fill="url(#pfill)" stroke="#33405a" stroke-width="1.2"/>' +
      head +
      '</svg>'
    );
  }

  // ------------------------------------------------------------------ content

  const ROLE_INFO = {
    crew: {
      label: 'Tripulante',
      objective: 'Objetivo: salvar la nave',
      icon: 'shield',
      text:
        'Sos parte de la tripulación leal. Ganás si se activan 5 protocolos de ' +
        'reparación o si el Androide queda aislado en el módulo 4.'
    },
    infiltrator: {
      label: 'Infiltrado',
      objective: 'Objetivo: sabotear la nave',
      icon: 'bolt',
      text:
        'Saboteás la nave desde adentro. Conocés a tus cómplices y al Androide. ' +
        'Ganás con 6 sabotajes o si el Androide es elegido reparador ' +
        'con 3 o más sabotajes ya promulgados.'
    },
    android: {
      label: 'Androide',
      objective: 'Objetivo: tomar el mando',
      icon: 'bolt',
      text:
        'Nadie sabe quién sos, salvo los Infiltrados. Si te aíslan en el módulo 4, pierden ' +
        'en el acto. Si te eligen reparador con 3 o más sabotajes, ganás antes de que se ' +
        'active ningún protocolo.'
    }
  };

  const POLICY_INFO = {
    crew: { label: 'Reparación', icon: 'shield' },
    sabotage: { label: 'Sabotaje', icon: 'bolt' }
  };

  const POWER_SHORT = {
    investigate: 'Escáner',
    'special-election': 'Cadena',
    isolate: 'Aislar',
    win: 'Fin'
  };

  const POWER_ICON = {
    investigate: 'scanner',
    'special-election': 'chain',
    isolate: 'airlock',
    win: 'end'
  };

  const POWER_LONG = {
    investigate: 'Escáner biométrico',
    'special-election': 'Cadena de mando',
    isolate: 'Aislamiento en el módulo 4'
  };

  const POWER_HINT = {
    investigate: 'Elegí a un jugador para conocer si pertenece a la Tripulación o a los Infiltrados. El Androide se lee como infiltrado.',
    'special-election': 'Elegí a cualquier jugador para que asuma como Capitán en el próximo gobierno. Después la cadena vuelve a su orden normal.',
    isolate:
      'Elegí a un jugador para aislarlo en el módulo 4. Sigue votando y puede gobernar, pero si lo ' +
      'eligen reparador juega con las cartas a la vista. Si es el Androide, gana la Tripulación.'
  };

  const PHASE_LABEL = {
    nomination: 'Nominación',
    voting: 'Votación',
    'legislative-president': 'Sesión de reparación',
    'legislative-chancellor': 'Sesión de reparación',
    'veto-request': 'Anulación conjunta',
    power: 'Poder del Capitán',
    'game-over': 'Partida terminada'
  };

  const WIN_REASON = {
    policies: 'por completar su tabla de protocolos',
    'android-isolated': 'porque aislaron al Androide en el módulo 4',
    'android-chancellor': 'porque el Androide fue elegido reparador'
  };

  // Cosmetic only: a station and a colour per seat, so the crew grid reads like
  // a ship's roster. None of it says anything about a player's hidden role.
  const STATIONS = [
    'Navegación', 'Ingeniería', 'Médica', 'Enlace', 'Seguridad',
    'Ciencia', 'Pilotaje', 'Logística', 'Armamento', 'Soporte vital'
  ];
  const HUES = ['cyan', 'violet', 'teal', 'blue', 'green', 'pink', 'sky', 'orange', 'lime', 'indigo'];

  // -------------------------------------------------------------------- state

  let game = null;
  let ui = null;

  function defaultNames(count) {
    const pool = ['Nova', 'Ríos', 'Kessler', 'Vega', 'Ortiz', 'Lira', 'Haddad', 'Sato', 'Bravo', 'Duarte'];
    const out = [];
    for (let i = 0; i < count; i += 1) {
      out.push(pool[i] || 'Jugador ' + (i + 1));
    }
    return out;
  }

  function freshUi() {
    return {
      playerCount: 6,
      names: defaultNames(6),
      screen: 'splash',
      revealIndex: 0,
      revealShown: false,
      sheet: null,
      readyKey: null,
      voteIndex: 0,
      votes: [],
      pick: null,
      pickKey: null,
      modal: null,
      toast: null
    };
  }

  // ------------------------------------------------------------------- helpers

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        const value = attrs[key];
        if (value === null || value === undefined || value === false) {
          return;
        }
        if (key === 'class') {
          node.className = value;
        } else if (key === 'text') {
          node.textContent = value;
        } else if (key === 'html') {
          node.innerHTML = value;
        } else if (key.slice(0, 2) === 'on') {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else {
          node.setAttribute(key, value === true ? '' : String(value));
        }
      });
    }
    (children || []).forEach(function (child) {
      if (child === null || child === undefined || child === false) {
        return;
      }
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function icon(name, extraClass) {
    return el('span', { class: 'ico' + (extraClass ? ' ' + extraClass : ''), html: ICON[name] || '', 'aria-hidden': 'true' });
  }

  function iconButton(name, label, onClick, extraClass) {
    return el(
      'button',
      { class: 'icon-btn' + (extraClass ? ' ' + extraClass : ''), type: 'button', 'aria-label': label, title: label, onClick: onClick },
      [icon(name)]
    );
  }

  function panelHead(title, iconName, extra) {
    return el('div', { class: 'panel-title' }, [
      iconName ? icon(iconName) : null,
      el('span', { class: 'panel-title-text', text: title }),
      el('span', { class: 'spacer' }),
      extra || null
    ]);
  }

  function playerName(id) {
    if (!game || !game.players[id]) {
      return '???';
    }
    return game.players[id].name;
  }

  function hueOf(id) {
    return HUES[id % HUES.length];
  }

  function avatar(id, extraClass) {
    return el('span', { class: 'avatar hue-' + hueOf(id) + (extraClass ? ' ' + extraClass : '') }, [icon('user')]);
  }

  // Nobody leaves the table: isolated players still vote and act.
  function seatedIds() {
    return game.players.map(function (p) {
      return p.id;
    });
  }

  function gameNumber() {
    return '#' + String((game.seed >>> 0) % 10000).padStart(4, '0');
  }

  function roundNumber() {
    let nominations = 0;
    game.events.forEach(function (event) {
      if (event.type === 'chancellor-nominated') {
        nominations += 1;
      }
    });
    return nominations + (game.phase === 'nomination' ? 1 : 0);
  }

  function currentActorId() {
    if (!game || game.phase === 'game-over') {
      return null;
    }
    const phase = game.phase;
    if (phase === 'voting') {
      const voters = seatedIds();
      return ui.voteIndex < voters.length ? voters[ui.voteIndex] : null;
    }
    if (
      phase === 'nomination' ||
      phase === 'legislative-president' ||
      phase === 'veto-request' ||
      phase === 'power'
    ) {
      return game.presidentId;
    }
    if (phase === 'legislative-chancellor') {
      return game.chancellorId;
    }
    return null;
  }

  function actorKey() {
    const actor = currentActorId();
    if (actor === null) {
      return null;
    }
    return game.phase + ':' + actor + ':' + ui.voteIndex + ':' + game.events.length;
  }

  function isReady() {
    const key = actorKey();
    return key !== null && ui.readyKey === key;
  }

  function markReady() {
    ui.readyKey = actorKey();
    render();
    const panel = document.getElementById('action');
    if (panel && panel.scrollIntoView) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function resetHandoff() {
    ui.readyKey = null;
    ui.pick = null;
    ui.pickKey = null;
  }

  // A pick only counts for the turn it was made in.
  function currentPick() {
    return ui.pickKey !== null && ui.pickKey === actorKey() ? ui.pick : null;
  }

  function setPick(id) {
    ui.pick = id;
    ui.pickKey = actorKey();
    render();
  }

  function openSheet(kind) {
    ui.sheet = kind;
    render();
  }

  function closeSheet() {
    ui.sheet = null;
    render();
  }

  function flashError(code) {
    ui.toast = 'Acción rechazada: ' + code;
    render();
    window.setTimeout(function () {
      ui.toast = null;
      render();
    }, 2400);
  }

  // -------------------------------------------------------------------- setup

  function setPlayerCount(count) {
    const names = [];
    for (let i = 0; i < count; i += 1) {
      names.push((ui.names[i] || '').trim() || defaultNames(count)[i]);
    }
    ui.playerCount = count;
    ui.names = names;
    render();
  }

  function goTo(screen) {
    ui.screen = screen;
    render();
  }

  function startGame() {
    const names = [];
    for (let i = 0; i < ui.playerCount; i += 1) {
      names.push((ui.names[i] || '').trim() || 'Jugador ' + (i + 1));
    }
    game = E.createGame({ playerNames: names });
    ui.screen = 'reveal';
    ui.revealIndex = 0;
    ui.revealShown = false;
    ui.sheet = null;
    ui.modal = null;
    ui.voteIndex = 0;
    ui.votes = [];
    resetHandoff();
    render();
  }

  function restart() {
    if (game && game.phase !== 'game-over' && !window.confirm('¿Abandonar la partida en curso?')) {
      return;
    }
    game = null;
    ui = freshUi();
    render();
  }

  function header(title, subtitle, left, right) {
    return el('header', { class: 'appbar' }, [
      el('div', { class: 'appbar-side' }, [left || null]),
      el('div', { class: 'appbar-title' }, [
        el('div', { class: 'appbar-h', text: title }),
        subtitle ? el('div', { class: 'appbar-sub', text: subtitle }) : null
      ]),
      el('div', { class: 'appbar-side right' }, [right || null])
    ]);
  }

  function gameHeader() {
    if (!game) {
      return header(
        'Tripulación',
        'Configurar partida',
        iconButton('back', 'Volver', function () { goTo('splash'); }),
        iconButton('gear', 'Reglas', function () { openSheet('rules'); })
      );
    }
    const sub = ui.screen === 'reveal'
      ? 'Asignación de roles'
      : 'Ronda ' + roundNumber() + ' · ' + (PHASE_LABEL[game.phase] || game.phase);
    return header(
      'Partida ' + gameNumber(),
      sub,
      iconButton('back', 'Abandonar partida', restart),
      iconButton('gear', 'Reglas', function () { openSheet('rules'); })
    );
  }

  function dock() {
    const items = [
      el('button', { class: 'dock-btn', type: 'button', onClick: function () { openSheet('rules'); } }, [
        icon('book'),
        el('span', { class: 'dock-label', text: 'Reglas' })
      ]),
      el('button', { class: 'dock-btn', type: 'button', onClick: function () { openSheet('lore'); } }, [
        icon('scroll'),
        el('span', { class: 'dock-label', text: 'Historia' })
      ])
    ];
    if (game) {
      items.push(
        el('button', { class: 'dock-btn', type: 'button', onClick: restart }, [
          icon('power'),
          el('span', { class: 'dock-label', text: 'Salir' })
        ])
      );
    }
    return el('nav', { class: 'dock', 'aria-label': 'Menú' }, items);
  }

  function splashScreen() {
    return el('div', { class: 'splash' }, [
      el('div', { class: 'splash-art', html: HERO_SHIP_SVG }),
      el('div', { class: 'splash-logo', html: LOGO_SVG }),
      el('h1', { class: 'splash-title' }, [
        el('span', { text: 'Órbita' }),
        el('span', { text: 'Negra' })
      ]),
      el('p', { class: 'splash-tag' }, [
        el('span', { text: 'Un androide. Una nave.' }),
        el('span', { text: 'Miles de sospechosos.' })
      ]),
      el('div', { class: 'divider short' }),
      el('div', { class: 'splash-actions' }, [
        el('button', { class: 'btn btn-primary btn-wide btn-lg', type: 'button', onClick: function () { goTo('setup'); } }, ['Iniciar']),
        // Placeholder for a future feature: visible, never clickable.
        el('button', { class: 'btn btn-wide btn-soon', type: 'button', disabled: true, 'aria-disabled': 'true', title: 'Próximamente' }, [
          icon('sync'),
          el('span', { text: 'Modo online' }),
          el('span', { class: 'soon-badge', text: 'Próximamente' })
        ]),
        el('button', { class: 'btn btn-ghost btn-wide', type: 'button', onClick: function () { openSheet('rules'); } }, ['Cómo se juega']),
        el('button', { class: 'btn btn-link', type: 'button', onClick: function () { openSheet('lore'); } }, ['Historia de la estación'])
      ])
    ]);
  }

  function setupScreen() {
    const screen = el('div', { class: 'setup' });

    const countPanel = el('section', { class: 'panel' }, [panelHead('Cantidad de jugadores', 'user')]);
    const grid = el('div', { class: 'count-grid' });
    for (let count = 5; count <= 10; count += 1) {
      grid.appendChild(
        el(
          'button',
          {
            class: 'count-btn' + (count === ui.playerCount ? ' active' : ''),
            type: 'button',
            onClick: function () {
              setPlayerCount(count);
            }
          },
          [String(count)]
        )
      );
    }
    countPanel.appendChild(grid);
    const dist = E.PLAYER_COUNTS[ui.playerCount];
    countPanel.appendChild(
      el('div', { class: 'dist' }, [
        el('span', { class: 'dist-item crew-c' }, [el('b', { text: String(dist.crew) }), ' tripulación']),
        el('span', { class: 'dist-item infil-c' }, [el('b', { text: String(dist.infiltrator) }), ' infiltrados']),
        el('span', { class: 'dist-item andro-c' }, [el('b', { text: String(dist.android) }), ' androide'])
      ])
    );
    screen.appendChild(countPanel);

    const namesPanel = el('section', { class: 'panel' }, [panelHead('Nombres a bordo', 'log')]);
    const names = el('div', { class: 'name-grid' });
    for (let i = 0; i < ui.playerCount; i += 1) {
      const input = el('input', {
        type: 'text',
        value: ui.names[i],
        maxlength: '18',
        placeholder: 'Nombre ' + (i + 1),
        'aria-label': 'Nombre del jugador ' + (i + 1),
        onInput: function (event) {
          ui.names[i] = event.target.value;
        }
      });
      names.appendChild(
        el('label', { class: 'name-row' }, [
          avatar(i, 'sm'),
          el('span', { class: 'name-field' }, [input, el('small', { text: STATIONS[i % STATIONS.length] })])
        ])
      );
    }
    namesPanel.appendChild(names);
    screen.appendChild(namesPanel);

    screen.appendChild(
      el('div', { class: 'setup-cta' }, [
        el('button', { class: 'btn btn-primary btn-wide btn-lg', type: 'button', onClick: startGame }, ['Iniciar misión']),
        el('p', { class: 'fine', text: 'Un solo dispositivo · se pasa de mano en mano · roles ocultos' })
      ])
    );

    return screen;
  }

  // ------------------------------------------------------------------- reveal

  function roleCard(role) {
    const info = ROLE_INFO[role.role];
    const allies =
      role.allies.length > 0
        ? el('div', { class: 'role-allies' }, [
            el('span', { text: role.role === 'android' ? 'Tus infiltrados' : 'Tus cómplices' }),
            el('b', {
              text: role.allies
                .map(function (allyId) {
                  return playerName(allyId);
                })
                .join(' · ')
            })
          ])
        : null;

    return el('div', { class: 'role-card ' + role.role }, [
      el('div', { class: 'portrait', html: portraitSvg(role.role) }),
      el('div', { class: 'role-head' }, [
        el('span', { class: 'role-badge' }, [icon(info.icon)]),
        el('div', {}, [
          el('div', { class: 'role-name', text: info.label }),
          el('div', { class: 'role-objective', text: info.objective })
        ])
      ]),
      el('div', { class: 'divider' }),
      el('p', { class: 'role-text', text: info.text }),
      allies
    ]);
  }

  function revealOverlay() {
    const ids = game.players.map(function (p) {
      return p.id;
    });
    const id = ids[ui.revealIndex];

    if (!ui.revealShown) {
      return overlay(
        el('div', { class: 'overlay-card handoff' }, [
          el('div', { class: 'eyebrow', text: 'Entrega del dispositivo · ' + (ui.revealIndex + 1) + '\u00a0de\u00a0' + ids.length }),
          avatar(id, 'xl'),
          el('div', { class: 'pass-name', text: playerName(id) }),
          el('p', {
            class: 'pass-hint',
            text: 'Tomá el dispositivo y asegurate de que nadie más esté mirando la pantalla.'
          }),
          el('div', { class: 'overlay-actions' }, [
            el(
              'button',
              {
                class: 'btn btn-primary btn-wide',
                type: 'button',
                onClick: function () {
                  ui.revealShown = true;
                  render();
                }
              },
              ['Soy ' + playerName(id) + ' — ver mi rol']
            )
          ])
        ])
      );
    }

    const role = E.roleFor(game, id);

    return overlay(
      el('div', { class: 'overlay-card role-modal' }, [
        el('div', { class: 'modal-head' }, [el('span', { class: 'modal-head-title', text: 'Tu rol' })]),
        el('div', { class: 'pass-kicker', text: playerName(id) }),
        roleCard(role),
        el('div', { class: 'overlay-actions' }, [
          el(
            'button',
            {
              class: 'btn btn-primary btn-wide',
              type: 'button',
              onClick: function () {
                ui.revealShown = false;
                ui.revealIndex += 1;
                if (ui.revealIndex >= ids.length) {
                  ui.screen = 'board';
                  ui.revealIndex = 0;
                }
                render();
              }
            },
            [ui.revealIndex + 1 >= ids.length ? 'Listo — empezar la partida' : 'Listo, ocultar y pasar']
          )
        ])
      ])
    );
  }

  // -------------------------------------------------------------------- board

  function trackCell(classes, children) {
    return el('div', { class: 'cell ' + classes }, children);
  }

  function tracksPanel(gv) {
    const panel = el('section', { class: 'panel' });

    panel.appendChild(
      panelHead(
        'Registro de sistemas',
        'hex',
        el('span', { class: 'counters' }, [
          el('span', {}, ['Mazo ', el('b', { text: String(gv.deckCount) })]),
          el('span', {}, ['Desc. ', el('b', { text: String(gv.discardCount) })])
        ])
      )
    );

    const crewCells = el('div', { class: 'track-cells', style: 'grid-template-columns: repeat(' + E.CREW_WIN_POLICIES + ', 1fr)' });
    for (let i = 0; i < E.CREW_WIN_POLICIES; i += 1) {
      const filled = i < gv.policies.crew;
      crewCells.appendChild(
        trackCell((filled ? 'filled crew' : '') + (i === gv.policies.crew ? ' upcoming' : ''), [
          filled ? icon('shield') : el('span', { class: 'cell-num', text: String(i + 1) })
        ])
      );
    }
    panel.appendChild(
      el('div', { class: 'track' }, [
        el('div', { class: 'track-name crew-c' }, [el('span', { text: 'Reparación' }), el('small', { text: E.CREW_WIN_POLICIES + ' para ganar' })]),
        crewCells
      ])
    );

    const sabotageCells = el('div', { class: 'track-cells' });
    for (let i = 0; i < E.SABOTAGE_WIN_POLICIES; i += 1) {
      const power = E.POWER_TABLE[gv.playerCount][i + 1];
      const filled = i < gv.policies.sabotage;
      const upcoming = i === gv.policies.sabotage;
      sabotageCells.appendChild(
        trackCell(
          (filled ? 'filled sabotage' : '') + (upcoming ? ' upcoming' : '') + (power === 'win' ? ' terminal' : '') + (power ? ' has-power' : ''),
          [
            filled ? icon('bolt') : power ? icon(POWER_ICON[power]) : el('span', { class: 'cell-num', text: '–' }),
            el('span', { class: 'cell-label', text: power ? POWER_SHORT[power] : '' })
          ]
        )
      );
    }
    panel.appendChild(
      el('div', { class: 'track' }, [
        el('div', { class: 'track-name sab-c' }, [el('span', { text: 'Sabotaje' }), el('small', { text: E.SABOTAGE_WIN_POLICIES + ' para ganar' })]),
        sabotageCells
      ])
    );

    const pips = el('div', { class: 'meter-pips' });
    for (let i = 0; i < E.TRACKER_LIMIT; i += 1) {
      pips.appendChild(el('span', { class: 'pip' + (i < gv.electionTracker ? ' on' : '') }));
    }
    panel.appendChild(
      el('div', { class: 'meter' }, [
        el('div', { class: 'track-name' }, [el('span', { text: 'Alerta de motín' })]),
        pips,
        el('span', {
          class: 'meter-text' + (gv.electionTracker > 0 ? ' warn' : ''),
          text: gv.electionTracker === 0 ? 'estable' : gv.electionTracker + '/' + E.TRACKER_LIMIT
        })
      ])
    );

    return panel;
  }

  function playerSubtitle(player, gv) {
    if (player.id === gv.presidentId) {
      return 'Capitán';
    }
    if (player.id === gv.chancellorId) {
      return 'Reparador';
    }
    if (player.isolated) {
      return 'Módulo 4';
    }
    return STATIONS[player.id % STATIONS.length];
  }

  function rosterPanel(gv) {
    const panel = el('section', { class: 'panel' });
    const isolatedCount = gv.players.filter(function (p) { return p.isolated; }).length;
    panel.appendChild(panelHead('Tripulación', 'user', el('span', { class: 'counters' }, [
      el('span', {}, ['Aislados ', el('b', { text: String(isolatedCount) })])
    ])));

    const roster = el('div', { class: 'crew-grid' });
    gv.players.forEach(function (player) {
      const isPresident = player.id === gv.presidentId;
      roster.appendChild(
        el(
          'div',
          {
            class:
              'player-card hue-' + hueOf(player.id) +
              (isPresident ? ' is-president' : '') +
              (player.id === gv.chancellorId ? ' is-chancellor' : '') +
              (player.isolated ? ' is-isolated' : '')
          },
          [
            isPresident ? el('span', { class: 'avatar gold' }, [icon('crown')]) : avatar(player.id),
            el('div', { class: 'pname', text: player.name }),
            el('div', { class: 'psub', text: playerSubtitle(player, gv) }),
            player.investigated ? el('span', { class: 'scan-tag', title: 'Escaneado' }, [icon('scanner')]) : null,
            player.isolated ? el('span', { class: 'iso-tag', title: 'Aislado en el módulo 4' }, [icon('lock')]) : null
          ]
        )
      );
    });
    panel.appendChild(roster);
    return panel;
  }

  function statusPanel(gv) {
    const panel = el('section', { class: 'panel status-panel' });
    panel.appendChild(panelHead('Estado de la nave', null, el('span', { class: 'chip', text: PHASE_LABEL[gv.phase] || gv.phase })));

    const rows = [
      ['Fase', PHASE_LABEL[gv.phase] || gv.phase, ''],
      ['Capitán', playerName(gv.presidentId), ''],
      ['Reparador', gv.chancellorId === null ? 'Sin designar' : playerName(gv.chancellorId), ''],
      ['Aislados', String(gv.players.filter(function (p) { return p.isolated; }).length) + ' de ' + gv.playerCount, ''],
      ['Anulación', gv.vetoUnlocked ? 'Habilitada' : 'Bloqueada', gv.vetoUnlocked ? 'ok' : 'locked']
    ];

    const stack = el('div', { class: 'status-rows' });
    rows.forEach(function (row) {
      stack.appendChild(
        el('div', { class: 'row' }, [
          el('span', { class: 'row-k', text: row[0] }),
          el('span', { class: 'row-v ' + row[2] }, [
            row[1],
            row[2] ? icon(row[2] === 'locked' ? 'lock' : 'unlock') : null
          ])
        ])
      );
    });

    const danger = gv.policies.sabotage >= 3 ? ' danger' : '';
    panel.appendChild(
      el('div', { class: 'status-body' }, [el('div', { class: 'ship' + danger, html: SHIP_SVG }), stack])
    );
    return panel;
  }

  // The role has its own section so it is always in the same place, but the
  // control only unlocks once the device is already in the acting player's
  // hands. Rendering it any earlier would hand the previous player the next
  // player's role.
  function rolePanel(gv) {
    if (gv.phase === 'game-over') {
      return el('div', {});
    }

    const panel = el('section', { class: 'panel' });
    panel.appendChild(panelHead('Tu rol', 'lock'));

    const actor = currentActorId();
    if (actor === null) {
      panel.appendChild(el('p', { class: 'role-hint', text: 'Procesando…' }));
      return panel;
    }

    if (!isReady()) {
      panel.appendChild(
        el('p', { class: 'role-hint', text: 'Pasale el dispositivo a ' + playerName(actor) + '.' })
      );
      return panel;
    }

    panel.appendChild(
      el(
        'button',
        { class: 'btn btn-ghost btn-wide', type: 'button', onClick: function () { openSheet('role'); } },
        ['Ver rol']
      )
    );
    panel.appendChild(el('p', { class: 'role-hint', text: 'Solo lo ves vos, ' + playerName(actor) + '.' }));

    return panel;
  }

  function cardList(cards) {
    return cards
      .map(function (card) {
        return POLICY_INFO[card].label;
      })
      .join(' + ');
  }

  const LOG_ICON = {
    'tag-isolate': 'lock',
    'tag-crew': 'shield',
    'tag-sabotage': 'bolt',
    'tag-power': 'scanner',
    'tag-end': 'flag',
    'tag-vote': 'vote',
    '': 'dot'
  };

  function describeEvent(event) {
    switch (event.type) {
      case 'chancellor-nominated':
        return {
          cls: '',
          text: playerName(event.presidentId) + ' designó a ' + playerName(event.chancellorId) + ' para reparar una zona.'
        };
      case 'vote-result':
        return {
          cls: event.passed ? 'tag-vote' : 'tag-sabotage',
          text:
            'Votación ' +
            (event.passed ? 'aprobada' : 'rechazada') +
            ' — ' +
            event.yes +
            ' a favor, ' +
            event.no +
            ' en contra.'
        };
      case 'government-elected':
        return {
          cls: '',
          text: 'Gobierno en funciones: ' + playerName(event.presidentId) + ' y ' + playerName(event.chancellorId) + '.'
        };
      case 'legislative-session':
        return { cls: '', text: 'Se entregan 3 protocolos al Capitán.' };
      case 'policy-enacted':
        return {
          cls: event.policy === 'crew' ? 'tag-crew' : 'tag-sabotage',
          text:
            (event.policy === 'crew' ? 'Protocolo de reparación activado' : 'Sabotaje promulgado') +
            (event.source === 'tracker'
              ? ' por la alerta de motín.'
              : event.source === 'veto'
                ? ' por la anulación forzada.'
                : '.')
        };
      case 'power-granted':
        return { cls: 'tag-power', text: 'Poder habilitado: ' + POWER_LONG[event.power] + '.' };
      case 'power-used':
        if (event.power === 'investigate') {
          return { cls: 'tag-power', text: 'Escáner biométrico sobre ' + playerName(event.targetId) + '.' };
        }
        if (event.power === 'special-election') {
          return { cls: 'tag-power', text: 'Cadena de mando: ' + playerName(event.targetId) + ' asume como Capitán.' };
        }
        return { cls: 'tag-power', text: 'Poder usado sobre ' + playerName(event.targetId) + '.' };
      case 'player-isolated':
        return { cls: 'tag-isolate', text: playerName(event.playerId) + ' quedó aislado en el módulo 4.' };
      case 'open-hand':
        return {
          cls: 'tag-isolate',
          text: playerName(event.chancellorId) + ' (aislado) recibió a la vista: ' + cardList(event.cards) + '.'
        };
      case 'open-discard':
        return {
          cls: 'tag-isolate',
          text:
            playerName(event.chancellorId) + ' descartó ' + POLICY_INFO[event.discarded].label +
            ' y activó ' + POLICY_INFO[event.enacted].label + ', a la vista de todos.'
        };
      case 'veto-proposed':
        return { cls: '', text: 'El reparador propone anular los protocolos.' };
      case 'veto-accepted':
        return { cls: 'tag-power', text: 'El Capitán acepta la anulación: no se promulga nada.' };
      case 'veto-refused':
        return { cls: '', text: 'El Capitán rechaza la anulación.' };
      case 'deck-reshuffled':
        return { cls: '', text: 'Se rebarajan los protocolos descartados.' };
      case 'game-over':
        return {
          cls: 'tag-end',
          text:
            'Fin de la partida: victoria de ' +
            (event.winner === 'crew' ? 'la Tripulación' : 'los Infiltrados') +
            '.'
        };
      default:
        return null;
    }
  }

  function logPanel(gv) {
    const panel = el('section', { class: 'panel' });
    panel.appendChild(panelHead('Bitácora', 'log'));

    const log = el('div', { class: 'log' });
    const entries = [];
    gv.events.forEach(function (event) {
      const described = describeEvent(event);
      if (described) {
        entries.push(described);
      }
    });

    if (entries.length === 0) {
      log.appendChild(el('div', { class: 'log-empty', text: 'Sin registros todavía.' }));
    } else {
      entries
        .slice()
        .reverse()
        .forEach(function (entry) {
          log.appendChild(
            el('div', { class: 'log-entry ' + entry.cls }, [
              el('span', { class: 'log-ico' }, [icon(LOG_ICON[entry.cls] || 'dot')]),
              el('span', { class: 'log-text', text: entry.text })
            ])
          );
        });
    }

    panel.appendChild(log);
    return panel;
  }

  function notesFor(actorId) {
    const view = E.privateView(game, actorId);
    if (!view || view.investigations.length === 0) {
      return null;
    }
    const box = el('div', { class: 'notes' }, [el('div', { class: 'notes-title', text: 'Tu expediente personal' })]);
    view.investigations.forEach(function (entry) {
      const dirty = entry.party === 'infiltrator';
      box.appendChild(
        el('div', { class: 'note-row' }, [
          el('span', { text: playerName(entry.targetId) }),
          el('b', { class: dirty ? 'sab-c' : 'crew-c', text: dirty ? 'infiltrado' : 'tripulante' })
        ])
      );
    });
    return box;
  }

  function playerChoices(ids, danger) {
    const picked = currentPick();
    const list = el('div', { class: 'crew-grid' });
    ids.forEach(function (id) {
      const isPresident = id === game.presidentId;
      list.appendChild(
        el(
          'button',
          {
            class:
              'player-card selectable hue-' + hueOf(id) +
              (danger ? ' danger' : '') +
              (picked === id ? ' picked' : ''),
            type: 'button',
            'aria-pressed': picked === id ? 'true' : 'false',
            onClick: function () {
              setPick(id);
            }
          },
          [
            isPresident ? el('span', { class: 'avatar gold' }, [icon('crown')]) : avatar(id),
            el('div', { class: 'pname', text: playerName(id) }),
            el('div', { class: 'psub', text: isPresident ? 'Capitán' : STATIONS[id % STATIONS.length] })
          ]
        )
      );
    });
    return list;
  }

  // Shown to the whole table: an isolated reparador has no secret hand.
  function openHandBanner(chancellorId) {
    return el('div', { class: 'open-hand' }, [
      el('div', { class: 'open-hand-title' }, [icon('lock'), el('span', { text: 'Juega a la vista de todos' })]),
      el('div', { class: 'open-hand-sub', text: playerName(chancellorId) + ' está aislado en el módulo 4. Recibió:' }),
      el('div', { class: 'open-hand-cards' }, game.chancellorHand.map(function (card) {
        return el('span', { class: 'mini-card ' + card }, [icon(POLICY_INFO[card].icon), el('span', { text: POLICY_INFO[card].label })]);
      }))
    ]);
  }

  function confirmButton(label, onConfirm, danger) {
    const picked = currentPick();
    if (picked === null) {
      return el('button', { class: 'btn btn-primary btn-wide confirm', type: 'button', disabled: true }, [label]);
    }
    return el(
      'button',
      {
        class: 'btn btn-wide confirm ' + (danger ? 'btn-danger' : 'btn-primary'),
        type: 'button',
        onClick: function () {
          onConfirm(picked);
        }
      },
      [label + ' · ' + playerName(picked)]
    );
  }

  function policyCards(hand, onPick, verb) {
    const row = el('div', { class: 'policy-row' });
    hand.forEach(function (policy, index) {
      row.appendChild(
        el(
          'button',
          {
            class: 'policy-card ' + policy,
            type: 'button',
            onClick: function () {
              onPick(index);
            }
          },
          [
            el('span', { class: 'glyph' }, [icon(POLICY_INFO[policy].icon)]),
            el('span', { class: 'plabel', text: POLICY_INFO[policy].label }),
            el('span', { class: 'pverb', text: verb })
          ]
        )
      );
    });
    return row;
  }

  // ------------------------------------------------------------------ actions

  function doNominate(id) {
    const result = E.nominateChancellor(game, id);
    if (!result.ok) {
      return flashError(result.error);
    }
    ui.voteIndex = 0;
    ui.votes = [];
    resetHandoff();
    render();
  }

  function doVote(yes) {
    const voters = seatedIds();
    const voter = voters[ui.voteIndex];
    ui.votes.push({ playerId: voter, yes: yes });
    ui.voteIndex += 1;
    resetHandoff();

    if (ui.voteIndex >= voters.length) {
      const collected = ui.votes.slice();
      ui.votes = [];
      ui.voteIndex = 0;
      const result = E.castVotes(game, collected);
      if (!result.ok) {
        return flashError(result.error);
      }
      ui.modal = { kind: 'vote' };
    }
    render();
  }

  function doPresidentDiscard(index) {
    const result = E.presidentDiscard(game, index);
    if (!result.ok) {
      return flashError(result.error);
    }
    resetHandoff();
    render();
  }

  function doChancellorDiscard(index) {
    const result = E.chancellorDiscard(game, index);
    if (!result.ok) {
      return flashError(result.error);
    }
    resetHandoff();
    render();
  }

  function doProposeVeto() {
    const result = E.proposeVeto(game);
    if (!result.ok) {
      return flashError(result.error);
    }
    resetHandoff();
    render();
  }

  function doAnswerVeto(accept) {
    const result = E.answerVeto(game, accept);
    if (!result.ok) {
      return flashError(result.error);
    }
    resetHandoff();
    render();
  }

  function doUsePower(targetId) {
    const power = game.pendingPower;
    const result = E.usePower(game, { targetId: targetId });
    if (!result.ok) {
      return flashError(result.error);
    }
    resetHandoff();
    if (power === 'investigate' && result.party) {
      ui.modal = { kind: 'investigation', targetId: targetId, party: result.party };
    }
    render();
  }

  // -------------------------------------------------------------- action panel

  function actionHead(title, sub, iconName) {
    return el('div', { class: 'action-head' }, [
      el('div', { class: 'action-title' }, [iconName ? icon(iconName) : null, el('span', { text: title })]),
      sub ? el('div', { class: 'action-sub', text: sub }) : null
    ]);
  }

  function actionPanel(gv) {
    if (gv.phase === 'game-over') {
      return el('div', {});
    }

    const actor = currentActorId();
    if (actor === null) {
      return el('section', { class: 'panel action' }, [
        el('div', { class: 'action-wait', text: 'Procesando…' })
      ]);
    }

    const container = el('section', { class: 'panel action', id: 'action' });

    if (!isReady()) {
      container.appendChild(actionHead('Esperando jugada', null, 'sync'));
      container.appendChild(
        el('div', { class: 'action-wait', text: 'Pasale el dispositivo a ' + playerName(actor) + '.' })
      );
      return container;
    }

    const phase = gv.phase;

    if (phase === 'nomination') {
      container.appendChild(actionHead('Nominación', '¿A quién designás para reparar una zona?', 'star'));
      container.appendChild(playerChoices(E.eligibleChancellorIds(game), false));
      container.appendChild(confirmButton('Confirmar', doNominate, false));
      return container;
    }

    if (phase === 'voting') {
      container.appendChild(
        el('div', { class: 'vote-progress', text: 'Voto ' + (ui.voteIndex + 1) + ' de ' + seatedIds().length + ' · ' + playerName(actor) })
      );
      container.appendChild(
        actionHead(
          'Votá el gobierno',
          'Capitán ' + playerName(gv.presidentId) + ' propone a ' +
            playerName(gv.chancellorId) + ' para reparar una zona. Se aprueba con más votos a favor que en contra.',
          'vote'
        )
      );
      container.appendChild(
        el('div', { class: 'gov-pair' }, [
          el('div', { class: 'gov-member' }, [el('span', { class: 'avatar gold' }, [icon('crown')]), el('b', { text: playerName(gv.presidentId) }), el('small', { text: 'Capitán' })]),
          el('span', { class: 'gov-plus', text: '+' }),
          el('div', { class: 'gov-member' }, [avatar(gv.chancellorId), el('b', { text: playerName(gv.chancellorId) }), el('small', { text: game.players[gv.chancellorId].isolated ? 'Reparador · aislado' : 'Reparador' })])
        ])
      );
      container.appendChild(
        el('div', { class: 'vote-row' }, [
          el('button', { class: 'vote-btn yes', type: 'button', onClick: function () { doVote(true); } }, [icon('check'), el('span', { text: 'Apruebo' })]),
          el('button', { class: 'vote-btn no', type: 'button', onClick: function () { doVote(false); } }, [icon('cross'), el('span', { text: 'Rechazo' })])
        ])
      );
      return container;
    }

    if (phase === 'legislative-president') {
      container.appendChild(
        actionHead(
          'Descartá un protocolo',
          'Capitán ' + playerName(actor) + ', tenés 3 protocolos. Tocá el que querés descartar en secreto; los otros 2 pasan al reparador.' +
            (game.players[gv.chancellorId].isolated ? ' Ojo: el reparador está aislado y esas 2 cartas se verán en público.' : ''),
          'log'
        )
      );
      container.appendChild(policyCards(game.presidentHand, doPresidentDiscard, 'Descartar'));
      return container;
    }

    if (phase === 'legislative-chancellor') {
      container.appendChild(
        actionHead(
          'Reparar la zona',
          'Reparador ' + playerName(actor) + ', tocá el protocolo que querés descartar. El otro se activa.',
          'log'
        )
      );
      if (gv.openHand) {
        container.appendChild(openHandBanner(actor));
      }
      container.appendChild(policyCards(game.chancellorHand, doChancellorDiscard, 'Descartar'));

      if (gv.vetoUnlocked) {
        container.appendChild(
          el('div', { class: 'veto-box' }, [
            el('button', { class: 'btn btn-ghost btn-wide', type: 'button', onClick: doProposeVeto }, [
              'Proponer anulación conjunta'
            ]),
            el('div', {
              class: 'fine',
              text: 'Si el Capitán acepta, se descartan los dos protocolos y sube la alerta de motín.'
            })
          ])
        );
      }
      return container;
    }

    if (phase === 'veto-request') {
      container.appendChild(
        actionHead(
          'Anulación conjunta',
          'El reparador ' + playerName(gv.chancellorId) +
            ' quiere anular los protocolos. Capitán ' + playerName(actor) + ', ¿aceptás?',
          'unlock'
        )
      );
      container.appendChild(
        el('div', { class: 'vote-row' }, [
          el('button', { class: 'vote-btn yes', type: 'button', onClick: function () { doAnswerVeto(true); } }, [icon('check'), el('span', { text: 'Aceptar' })]),
          el('button', { class: 'vote-btn no', type: 'button', onClick: function () { doAnswerVeto(false); } }, [icon('cross'), el('span', { text: 'Rechazar' })])
        ])
      );
      return container;
    }

    if (phase === 'power') {
      const power = gv.pendingPower;
      const danger = power === 'isolate';
      container.appendChild(actionHead(POWER_LONG[power] || 'Poder del Capitán', POWER_HINT[power] || '', POWER_ICON[power]));
      container.appendChild(playerChoices(power === 'isolate' ? E.isolationTargetIds(game) : seatedIds(), danger));
      container.appendChild(confirmButton(danger ? 'Confirmar aislamiento' : 'Confirmar', doUsePower, danger));
      const notes = notesFor(actor);
      if (notes) {
        container.appendChild(notes);
      }
      return container;
    }

    return container;
  }

  // -------------------------------------------------------------------- modals

  function overlay(content) {
    return el('div', { class: 'overlay' }, [content]);
  }

  function voteModal() {
    const vote = game.lastVote;
    const card = el('div', { class: 'overlay-card' }, [
      el('div', { class: 'eyebrow', text: 'Resultado de la votación' }),
      el('h2', {
        class: 'win-title ' + (vote.passed ? 'crew' : 'infiltrators'),
        text: vote.passed ? 'Gobierno aprobado' : 'Gobierno rechazado'
      })
    ]);

    card.appendChild(
      el('div', { class: 'tally' }, [
        el('div', { class: 'yes-count' }, [el('span', { text: 'A favor' }), el('b', { text: String(vote.yes) })]),
        el('div', { class: 'no-count' }, [el('span', { text: 'En contra' }), el('b', { text: String(vote.no) })])
      ])
    );

    const chips = el('div', { class: 'vote-list' });
    vote.votes.forEach(function (entry) {
      chips.appendChild(
        el('span', { class: 'vote-chip ' + (entry.yes ? 'yes' : 'no') }, [
          icon(entry.yes ? 'check' : 'cross'),
          playerName(entry.playerId)
        ])
      );
    });
    card.appendChild(chips);

    if (!vote.passed) {
      card.appendChild(
        el('p', {
          class: 'pass-hint',
          text:
            game.electionTracker === 0
              ? 'La alerta de motín llegó al máximo: se activó el protocolo de arriba del mazo.'
              : 'Alerta de motín: ' + game.electionTracker + ' de ' + E.TRACKER_LIMIT + '.'
        })
      );
    }

    card.appendChild(
      el('div', { class: 'overlay-actions' }, [
        el(
          'button',
          {
            class: 'btn btn-primary btn-wide',
            type: 'button',
            onClick: function () {
              ui.modal = null;
              render();
            }
          },
          ['Continuar']
        )
      ])
    );

    return overlay(card);
  }

  function investigationModal() {
    const party = ui.modal.party;
    const isInfiltrator = party === 'infiltrator';

    return overlay(
      el('div', { class: 'overlay-card' }, [
        el('div', { class: 'eyebrow', text: 'Escáner biométrico · solo para tus ojos' }),
        el('div', { class: 'investigation-box ' + (isInfiltrator ? 'dirty' : 'clean') }, [
          el('span', { class: 'scan-ring' }, [icon('scanner')]),
          el('div', { class: 'investigation-verdict', text: isInfiltrator ? 'Infiltrado' : 'Tripulante' }),
          el('div', {
            class: 'investigation-target',
            text: playerName(ui.modal.targetId) + ' pertenece a ' + (isInfiltrator ? 'los Infiltrados' : 'la Tripulación') + '.'
          })
        ]),
        el('p', {
          class: 'pass-hint',
          text: 'Memorizá el resultado: no queda visible para el resto de la tripulación.'
        }),
        el('div', { class: 'overlay-actions' }, [
          el(
            'button',
            {
              class: 'btn btn-primary btn-wide',
              type: 'button',
              onClick: function () {
                ui.modal = null;
                render();
              }
            },
            ['Entendido, ocultar']
          )
        ])
      ])
    );
  }

  function handoffOverlay(actorId) {
    const reasons = {
      nomination: 'Tiene que designar a quién repara una zona.',
      voting: 'Tiene que emitir su voto en secreto.',
      'legislative-president': 'Tiene que descartar un protocolo en secreto.',
      'legislative-chancellor': 'Tiene que reparar la zona.',
      'veto-request': 'Tiene que responder a la propuesta de anulación.',
      power: 'Tiene que resolver su poder de Capitán.'
    };

    return overlay(
      el('div', { class: 'overlay-card handoff' }, [
        el('div', { class: 'eyebrow', text: 'Nuevo turno · ' + (PHASE_LABEL[game.phase] || '') }),
        avatar(actorId, 'xl'),
        el('div', { class: 'pass-name', text: playerName(actorId) }),
        el('p', { class: 'pass-hint', text: reasons[game.phase] || 'Es su turno.' }),
        E.publicView(game).openHand ? openHandBanner(actorId) : null,
        el('div', { class: 'overlay-actions' }, [
          el('button', { class: 'btn btn-primary btn-wide', type: 'button', onClick: markReady }, [
            'Soy ' + playerName(actorId)
          ])
        ])
      ])
    );
  }

  function gameOverOverlay() {
    const crewWon = game.winner === 'crew';
    const card = el('div', { class: 'overlay-card' }, [
      el('div', { class: 'eyebrow', text: 'Fin de la misión' }),
      el('div', { class: 'portrait small ' + (crewWon ? 'crew' : 'android'), html: portraitSvg(crewWon ? 'crew' : 'android') }),
      el('h2', { class: 'win-title ' + (crewWon ? 'crew' : 'infiltrators'), text: crewWon ? 'Gana la Tripulación' : 'Ganan los Infiltrados' }),
      el('p', { class: 'win-reason', text: WIN_REASON[game.winReason] || '' })
    ]);

    const list = el('div', { class: 'reveal-list' });
    game.players.forEach(function (player) {
      const info = ROLE_INFO[player.role];
      list.appendChild(
        el('div', { class: 'reveal-row ' + player.role + (player.role === 'android' ? ' was-android' : '') }, [
          avatar(player.id, 'sm'),
          el('span', { class: 'rinfo' }, [
            el('span', { class: 'rname', text: player.name }),
            el('span', { class: 'badge' + (player.isolated ? ' isolated' : ''), text: player.isolated ? 'aislado' : 'a bordo' })
          ]),
          el('span', { class: 'rrole', text: info.label })
        ])
      );
    });
    card.appendChild(list);

    card.appendChild(
      el('div', { class: 'overlay-actions' }, [
        el('button', { class: 'btn btn-primary btn-wide', type: 'button', onClick: restart }, ['Nueva partida'])
      ])
    );

    return overlay(card);
  }

  // -------------------------------------------------------------------- sheets

  const RULES_SECTIONS = [
    {
      title: 'Objetivo',
      body:
        'A bordo hay dos bandos. La Tripulación leal gana si se activan 5 protocolos de ' +
        'reparación o si el Androide queda aislado en el módulo 4. Los Infiltrados ganan si se ' +
        'promulgan 6 sabotajes, o si el Androide es elegido reparador con ' +
        '3 o más sabotajes ya promulgados.'
    },
    {
      title: 'El gobierno',
      body:
        'En cada ronda el Capitán designa a un tripulante para reparar una zona (el reparador) y ' +
        'todos votan en secreto, también los aislados. El ' +
        'gobierno se aprueba solo si hay más votos a favor que en contra: un empate lo ' +
        'rechaza.'
    },
    {
      title: 'La sesión de reparación',
      body:
        'Si el gobierno se aprueba, el Capitán roba 3 protocolos y descarta uno en secreto. ' +
        'Le pasa los 2 restantes al reparador, que descarta otro y activa el último. ' +
        'Cuando queden menos de 3 protocolos en el mazo, se mezclan con los descartes.'
    },
    {
      title: 'Alerta de motín',
      body:
        'Cada gobierno rechazado sube un nivel de la alerta. Al tercero la nave toma el ' +
        'control: se activa el primer protocolo del mazo, sin poder para el Capitán, y la ' +
        'alerta vuelve a cero.'
    },
    {
      title: 'Aislamiento en el módulo 4',
      body:
        'Nadie muere ni sale del juego. El jugador aislado sigue hablando, votando y puede ser ' +
        'Capitán o reparador, pero pierde el secreto: si lo eligen reparador, los 2 protocolos ' +
        'que recibe y el que descarta se muestran a toda la mesa. Su rol nunca se revela. Si ' +
        'aíslan al Androide, gana la Tripulación en el acto. El Capitán no puede aislarse a sí ' +
        'mismo ni volver a aislar a alguien que ya está en el módulo 4.'
    },
    {
      title: 'Anulación conjunta',
      body:
        'Cuando ya hay 5 sabotajes promulgados, el reparador puede proponer anular el ' +
        'gobierno. Si el Capitán acepta, ambos descartan sus manos sin promulgar nada y la ' +
        'alerta sube un nivel. Si rechaza, sigue la sesión de reparación normal.'
    },
    {
      title: 'Límites de mandato',
      body:
        'El reparador del gobierno anterior no puede repetir en el siguiente. El Capitán ' +
        'anterior tampoco, salvo en partidas de 5 jugadores. El Capitán en ' +
        'ejercicio nunca puede designarse a sí mismo.'
    }
  ];

  function rolesTable() {
    const table = el('table', { class: 'rules-table' });
    table.appendChild(
      el('thead', {}, [
        el('tr', {}, [
          el('th', { text: 'Jug.' }),
          el('th', { text: 'Tripulación' }),
          el('th', { text: 'Infiltrados' }),
          el('th', { text: 'Androide' })
        ])
      ])
    );

    const body = el('tbody', {});
    Object.keys(E.PLAYER_COUNTS).forEach(function (count) {
      const info = E.PLAYER_COUNTS[count];
      body.appendChild(
        el('tr', {}, [
          el('th', { class: 'rowhead', text: count }),
          el('td', { text: String(info.crew) }),
          el('td', { text: String(info.infiltrator) }),
          el('td', { text: String(info.android) })
        ])
      );
    });
    table.appendChild(body);
    return table;
  }

  function powersTable() {
    const groups = [
      ['5–6', E.POWER_TABLE[5]],
      ['7–8', E.POWER_TABLE[7]],
      ['9–10', E.POWER_TABLE[9]]
    ];

    const table = el('table', { class: 'rules-table' });
    const head = el('tr', {}, [el('th', { text: 'Jug.' })]);
    for (let sabotage = 1; sabotage <= 5; sabotage += 1) {
      head.appendChild(el('th', { text: sabotage + '.º' }));
    }
    table.appendChild(el('thead', {}, [head]));

    const body = el('tbody', {});
    groups.forEach(function (group) {
      const row = el('tr', {}, [el('th', { class: 'rowhead', text: group[0] })]);
      for (let sabotage = 1; sabotage <= 5; sabotage += 1) {
        const power = group[1][sabotage];
        row.appendChild(el('td', { text: power ? POWER_SHORT[power] : '—' }));
      }
      body.appendChild(row);
    });
    table.appendChild(body);
    return table;
  }

  // Same data as powersTable(), stacked for narrow phones.
  function powersList() {
    const list = el('div', { class: 'powers-list narrow-only' });
    [['5–6', 5], ['7–8', 7], ['9–10', 9]].forEach(function (group) {
      const chips = el('div', { class: 'power-steps' });
      for (let sabotage = 1; sabotage <= 5; sabotage += 1) {
        const power = E.POWER_TABLE[group[1]][sabotage];
        chips.appendChild(
          el('span', { class: 'power-step' + (power ? ' on' : '') }, [
            el('b', { text: String(sabotage) }),
            power ? POWER_SHORT[power] : '—'
          ])
        );
      }
      list.appendChild(el('div', { class: 'powers-row' }, [el('div', { class: 'powers-count', text: group[0] + ' jugadores' }), chips]));
    });
    return list;
  }

  function rulesSheet() {
    const wrap = el('div', { class: 'sheet' });
    wrap.appendChild(el('div', { class: 'eyebrow', text: 'Manual de a bordo' }));
    wrap.appendChild(el('h2', { class: 'sheet-title', text: 'Cómo se juega' }));

    wrap.appendChild(el('h3', { class: 'sheet-h', text: 'Reparto de roles' }));
    wrap.appendChild(
      el('p', {
        class: 'sheet-p',
        text: 'Siempre hay un solo Androide. El resto se reparte entre Tripulación e Infiltrados.'
      })
    );
    wrap.appendChild(el('div', { class: 'table-wrap' }, [rolesTable()]));

    RULES_SECTIONS.forEach(function (section) {
      wrap.appendChild(el('h3', { class: 'sheet-h', text: section.title }));
      wrap.appendChild(el('p', { class: 'sheet-p', text: section.body }));
    });

    wrap.appendChild(el('h3', { class: 'sheet-h', text: 'Poderes del Capitán' }));
    wrap.appendChild(
      el('p', {
        class: 'sheet-p',
        text:
          'Cada sabotaje promulgado puede darle un poder al Capitán, según cuántos jugadores ' +
          'haya a bordo. El primer sabotaje nunca otorga poder; el segundo, solo en partidas ' +
          'de 7 o más.'
      })
    );
    wrap.appendChild(el('div', { class: 'table-wrap wide-only' }, [powersTable()]));
    wrap.appendChild(powersList());
    wrap.appendChild(
      el('p', {
        class: 'fine left',
        text:
          'Columnas: sabotaje número 1 a 5. Escáner = escáner biométrico · Cadena = cadena de ' +
          'mando · Aislar = aislamiento en el módulo 4.'
      })
    );

    return wrap;
  }

  function loreSheet() {
    const wrap = el('div', { class: 'sheet' });
    wrap.appendChild(el('div', { class: 'eyebrow', text: 'Bitácora de la estación' }));
    wrap.appendChild(el('h2', { class: 'sheet-title', text: 'Órbita Negra' }));

    [
      'La estación Órbita Negra gira en silencio alrededor de un planeta que no tiene nombre. ' +
        'Turnos de seis meses, diez tripulantes y una sola regla que nadie discute: no se abre ' +
        'la escotilla del módulo 4.',
      'Cuando el soporte vital empezó a fallar, la tripulación entendió que no estaba sola. ' +
        'Alguien a bordo está saboteando los sistemas, y no es del todo humano.',
      'Los informes hablan de un Androide: una unidad que se hace pasar por tripulante, que ' +
        'respira cuando conviene y que responde a una cadena de mando que nadie autorizó. ' +
        'Junto a él, uno o más infiltrados sabotean la nave desde adentro.',
      'No hay comunicación con la Tierra. No hay nave de rescate, y nadie va a sobrar: cada ' +
        'par de manos hace falta para mantener la estación en órbita. Por eso el protocolo no ' +
        'expulsa a nadie. Al sospechoso se lo encierra en el módulo 4, detrás de la escotilla ' +
        'que nadie abre, y desde ahí sigue trabajando bajo la mirada de todos.',
      'Cada ronda se nombra un Capitán, que designa a un tripulante para reparar una zona. ' +
        'Se votan los protocolos y se decide en quién se puede confiar. El que mienta mejor, gana.'
    ].forEach(function (paragraph) {
      wrap.appendChild(el('p', { class: 'sheet-p', text: paragraph }));
    });

    return wrap;
  }

  function rolePeekSheet() {
    const wrap = el('div', { class: 'sheet' });
    const actor = currentActorId();

    if (actor === null) {
      wrap.appendChild(el('p', { class: 'sheet-p', text: 'Todavía no hay un turno en curso.' }));
      return wrap;
    }

    wrap.appendChild(el('div', { class: 'pass-kicker', text: playerName(actor) }));
    wrap.appendChild(roleCard(E.roleFor(game, actor)));
    return wrap;
  }

  const SHEET_TITLE = { rules: 'Reglas', lore: 'Historia', role: 'Tu rol' };

  function sheetOverlay(kind) {
    let content;
    if (kind === 'rules') {
      content = rulesSheet();
    } else if (kind === 'lore') {
      content = loreSheet();
    } else {
      content = rolePeekSheet();
    }

    return overlay(
      el('div', { class: 'overlay-card sheet-card' + (kind === 'role' ? ' role-modal' : '') }, [
        el('div', { class: 'modal-head' }, [
          el('span', { class: 'modal-head-title', text: SHEET_TITLE[kind] || '' }),
          iconButton('close', 'Cerrar', closeSheet, 'modal-x')
        ]),
        content,
        el('div', { class: 'overlay-actions' }, [
          el('button', { class: 'btn btn-primary btn-wide', type: 'button', onClick: closeSheet }, ['Cerrar'])
        ])
      ])
    );
  }

  function render() {
    renderBase();
    if (ui.toast) {
      app.appendChild(el('div', { class: 'toast', role: 'status', text: ui.toast }));
    }
    if (ui.sheet) {
      app.appendChild(sheetOverlay(ui.sheet));
    }
  }

  function renderBase() {
    app.textContent = '';
    app.className = 'app screen-' + (game ? (ui.screen === 'reveal' ? 'reveal' : 'board') : ui.screen);

    if (!game) {
      if (ui.screen === 'splash') {
        app.appendChild(splashScreen());
        return;
      }
      app.appendChild(gameHeader());
      app.appendChild(setupScreen());
      app.appendChild(dock());
      return;
    }

    app.appendChild(gameHeader());

    if (ui.screen === 'reveal') {
      app.appendChild(dock());
      app.appendChild(revealOverlay());
      return;
    }

    const gv = E.publicView(game);

    const board = el('div', { class: 'board' });
    const colA = el('div', { class: 'board-col' });
    colA.appendChild(statusPanel(gv));
    colA.appendChild(tracksPanel(gv));

    const colB = el('div', { class: 'board-col' });
    colB.appendChild(actionPanel(gv));
    colB.appendChild(rosterPanel(gv));

    const colC = el('div', { class: 'board-col' });
    colC.appendChild(rolePanel(gv));
    colC.appendChild(logPanel(gv));

    board.appendChild(colA);
    board.appendChild(colB);
    board.appendChild(colC);
    app.appendChild(board);
    app.appendChild(dock());

    if (game.phase === 'game-over') {
      app.appendChild(gameOverOverlay());
      return;
    }

    if (ui.modal) {
      app.appendChild(ui.modal.kind === 'vote' ? voteModal() : investigationModal());
      return;
    }

    const actor = currentActorId();
    if (actor !== null && !isReady()) {
      app.appendChild(handoffOverlay(actor));
    }
  }

  // ---------------------------------------------------------------------- boot

  ui = freshUi();
  render();
})();
