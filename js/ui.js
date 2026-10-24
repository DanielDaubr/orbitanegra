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

  // ------------------------------------------------------------------ content

  const ROLE_INFO = {
    crew: {
      label: 'Tripulante',
      glyph: '⬡',
      text:
        'Sos parte de la tripulación leal. Ganás si se promulgan 6 directivas de ' +
        'Tripulación o si el Androide es expulsado por la esclusa.'
    },
    infiltrator: {
      label: 'Infiltrado',
      glyph: '⬢',
      text:
        'Saboteás la nave desde adentro. Conocés a tus cómplices y al Androide. ' +
        'Ganás con 6 directivas de Sabotaje o si el Androide llega a Primer Oficial ' +
        'con 3 o más sabotajes ya promulgados.'
    },
    android: {
      label: 'El Androide',
      glyph: '◎',
      text:
        'Nadie sabe quién sos, salvo los Infiltrados. Si te expulsan, pierden en el acto. ' +
        'Si te nombran Primer Oficial con 3 o más sabotajes, ganás antes de que se ' +
        'promulgue ninguna directiva.'
    }
  };

  const POLICY_INFO = {
    crew: { label: 'Tripulación', glyph: '◈' },
    sabotage: { label: 'Sabotaje', glyph: '✖' }
  };

  const POWER_SHORT = {
    investigate: 'Escáner',
    'special-election': 'Cadena',
    execute: 'Esclusa',
    win: 'Fin'
  };

  const POWER_LONG = {
    investigate: 'Escáner biométrico',
    'special-election': 'Cadena de mando',
    execute: 'Expulsión por la esclusa'
  };

  const POWER_HINT = {
    investigate: 'Elegí a un jugador para conocer si pertenece a la Tripulación o a los Infiltrados. El Androide se lee como infiltrado.',
    'special-election': 'Elegí a cualquier jugador para que asuma como Capitán en el próximo gobierno. Después la cadena vuelve a su orden normal.',
    execute: 'Elegí a un jugador para expulsarlo por la esclusa. Su rol no se revela.'
  };

  const PHASE_LABEL = {
    nomination: 'Nominación',
    voting: 'Votación del gobierno',
    'legislative-president': 'Sesión legislativa',
    'legislative-chancellor': 'Sesión legislativa',
    'veto-request': 'Anulación conjunta',
    power: 'Poder presidencial',
    'game-over': 'Partida terminada'
  };

  const WIN_REASON = {
    policies: 'por completar la tabla de directivas',
    'android-executed': 'porque expulsaron al Androide',
    'android-chancellor': 'porque el Androide llegó a Primer Oficial'
  };

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
      screen: 'setup',
      revealIndex: 0,
      revealShown: false,
      sheet: null,
      readyKey: null,
      voteIndex: 0,
      votes: [],
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

  function playerName(id) {
    if (!game || !game.players[id]) {
      return '???';
    }
    return game.players[id].name;
  }

  function aliveIds() {
    return game.players
      .filter(function (p) {
        return p.alive;
      })
      .map(function (p) {
        return p.id;
      });
  }

  function currentActorId() {
    if (!game || game.phase === 'game-over') {
      return null;
    }
    const phase = game.phase;
    if (phase === 'voting') {
      const voters = aliveIds();
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
    ui.readyKey = null;
    ui.modal = null;
    ui.voteIndex = 0;
    ui.votes = [];
    render();
  }

  function restart() {
    if (game && !window.confirm('¿Abandonar la partida en curso?')) {
      return;
    }
    game = null;
    ui = freshUi();
    render();
  }

  function topbar() {
    const bar = el('div', { class: 'topbar' }, [
      el('div', { class: 'brand' }, [
        el('span', { class: 'dot' }),
        el('span', { text: 'Órbita Negra' }),
        el('small', { text: 'protocolo de sabotaje' })
      ])
    ]);

    const actions = el('div', { class: 'topbar-actions' });
    actions.appendChild(
      el(
        'button',
        { class: 'btn btn-ghost btn-sm', type: 'button', onClick: function () { openSheet('rules'); } },
        ['Reglas']
      )
    );
    actions.appendChild(
      el(
        'button',
        { class: 'btn btn-ghost btn-sm', type: 'button', onClick: function () { openSheet('lore'); } },
        ['Historia']
      )
    );
    if (game) {
      actions.appendChild(
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: restart }, ['Nueva partida'])
      );
    }
    bar.appendChild(actions);
    return bar;
  }

  function setupScreen() {
    const screen = el('div', { class: 'setup' });

    screen.appendChild(
      el('div', { class: 'hero' }, [
        el('h1', { text: 'Órbita Negra' }),
        el('p', {
          text:
            'La nave se está partiendo. Hay infiltrados a bordo y uno de ustedes es el Androide. ' +
            'Gobiernen juntos, promulguen directivas y descubran quién sabotea antes de que sea tarde.'
        })
      ])
    );

    const panel = el('div', { class: 'panel' });

    const countField = el('div', { class: 'field' }, [
      el('span', { class: 'field-label', text: 'Cantidad de jugadores' })
    ]);
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
    countField.appendChild(grid);
    panel.appendChild(countField);

    const namesField = el('div', { class: 'field' }, [
      el('span', { class: 'field-label', text: 'Tripulación' })
    ]);
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
      namesField.appendChild(
        el('div', { class: 'name-row' }, [el('span', { class: 'name-index', text: String(i + 1) }), input])
      );
    }
    panel.appendChild(namesField);

    panel.appendChild(
      el('button', { class: 'btn btn-primary btn-wide', type: 'button', onClick: startGame }, [
        'Iniciar misión'
      ])
    );

    panel.appendChild(
      el('div', { class: 'role-legend' }, [
        el('span', { text: '5–10 jugadores' }),
        el('span', { text: 'un solo dispositivo' }),
        el('span', { text: 'roles ocultos' })
      ])
    );

    screen.appendChild(panel);
    return screen;
  }

  // ------------------------------------------------------------------- reveal

  function roleCard(role) {
    const info = ROLE_INFO[role.role];
    const allies =
      role.allies.length > 0
        ? el('div', { class: 'role-allies' }, [
            el('span', { text: role.role === 'android' ? 'Tus infiltrados: ' : 'Tus cómplices: ' }),
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
      el('div', { class: 'role-glyph', text: info.glyph }),
      el('div', { class: 'role-name', text: info.label }),
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
        el('div', { class: 'overlay-card' }, [
          el('div', { class: 'pass-kicker', text: 'Entrega del dispositivo · ' + (ui.revealIndex + 1) + ' de ' + ids.length }),
          el('div', { class: 'pass-name', text: playerName(id) }),
          el('p', {
            class: 'pass-hint',
            text: 'Tomá el dispositivo y asegurate de que nadie más esté mirando la pantalla.'
          }),
          el('div', { class: 'overlay-actions' }, [
            el(
              'button',
              {
                class: 'btn btn-primary',
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
      el('div', { class: 'overlay-card' }, [
        el('div', { class: 'pass-kicker', text: playerName(id) }),
        roleCard(role),
        el('div', { class: 'overlay-actions' }, [
          el(
            'button',
            {
              class: 'btn btn-primary',
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

  function tracksPanel(gv) {
    const panel = el('div', { class: 'panel' });

    panel.appendChild(
      el('div', { class: 'panel-title' }, [
        el('span', { text: 'Registro de sistemas' }),
        el('span', { class: 'counters' }, [
          el('span', {}, [document.createTextNode('Mazo '), el('b', { text: String(gv.deckCount) })]),
          el('span', {}, [document.createTextNode('Descartes '), el('b', { text: String(gv.discardCount) })])
        ])
      ])
    );

    const crewTrack = el('div', { class: 'track' }, [
      el('div', { class: 'track-name', text: 'Tripulación · 6 para ganar' })
    ]);
    const crewCells = el('div', { class: 'track-cells' });
    for (let i = 0; i < 6; i += 1) {
      crewCells.appendChild(
        el(
          'div',
          { class: 'cell' + (i < gv.policies.crew ? ' filled crew' : '') + (i === gv.policies.crew ? ' upcoming' : '') },
          [el('span', { class: 'cell-icon', text: i < gv.policies.crew ? POLICY_INFO.crew.glyph : '' }), el('span', { text: String(i + 1) })]
        )
      );
    }
    crewTrack.appendChild(crewCells);
    panel.appendChild(crewTrack);

    const sabotageTrack = el('div', { class: 'track' }, [
      el('div', { class: 'track-name', text: 'Sabotaje · 6 para ganar' })
    ]);
    const sabotageCells = el('div', { class: 'track-cells' });
    for (let i = 0; i < 6; i += 1) {
      const power = E.POWER_TABLE[gv.playerCount][i + 1];
      const filled = i < gv.policies.sabotage;
      const upcoming = i === gv.policies.sabotage;
      const label = power === 'win' ? POWER_SHORT.win : power ? POWER_SHORT[power] : '—';
      sabotageCells.appendChild(
        el(
          'div',
          {
            class:
              'cell' +
              (filled ? ' filled sabotage' : '') +
              (upcoming ? ' upcoming' : '') +
              (power === 'win' ? ' terminal' : '')
          },
          [el('span', { class: 'cell-icon', text: filled ? POLICY_INFO.sabotage.glyph : '' }), el('span', { text: label })]
        )
      );
    }
    sabotageTrack.appendChild(sabotageCells);
    panel.appendChild(sabotageTrack);

    const pips = el('div', { class: 'meter-pips' });
    for (let i = 0; i < E.TRACKER_LIMIT; i += 1) {
      pips.appendChild(el('span', { class: 'pip' + (i < gv.electionTracker ? ' on' : '') }));
    }
    panel.appendChild(
      el('div', { class: 'meter' }, [
        el('div', { class: 'track-name', text: 'Alerta de motín' }),
        pips,
        el('span', {
          class: 'meter-text',
          text: gv.electionTracker === 0 ? 'estable' : gv.electionTracker + '/3'
        })
      ])
    );

    return panel;
  }

  function rosterPanel(gv) {
    const panel = el('div', { class: 'panel' });
    panel.appendChild(
      el('div', { class: 'panel-title' }, [el('span', { text: 'Tripulación' })])
    );

    const roster = el('div', { class: 'roster' });
    gv.players.forEach(function (player) {
      const flags = el('div', { class: 'pflags' });
      if (player.id === gv.presidentId) {
        flags.appendChild(el('span', { class: 'badge president', text: 'Capitán' }));
      }
      if (player.id === gv.chancellorId) {
        flags.appendChild(el('span', { class: 'badge chancellor', text: '1.º Oficial' }));
      }
      if (!player.alive) {
        flags.appendChild(el('span', { class: 'badge dead', text: 'esclusa' }));
      }
      if (player.investigated) {
        flags.appendChild(el('span', { class: 'badge scanned', text: 'escaneado' }));
      }

      roster.appendChild(
        el(
          'div',
          {
            class:
              'player-card' +
              (player.id === gv.presidentId ? ' is-president' : '') +
              (player.id === gv.chancellorId ? ' is-chancellor' : '') +
              (!player.alive ? ' is-dead' : '')
          },
          [el('div', { class: 'pname', text: player.name }), flags]
        )
      );
    });
    panel.appendChild(roster);
    return panel;
  }

  function statusPanel(gv) {
    const panel = el('div', { class: 'panel' });
    panel.appendChild(el('div', { class: 'panel-title' }, [el('span', { text: 'Estado de la nave' })]));

    const rows = [
      ['Fase', PHASE_LABEL[gv.phase] || gv.phase],
      ['Capitán', playerName(gv.presidentId)],
      ['1.º Oficial', gv.chancellorId === null ? 'sin nombrar' : playerName(gv.chancellorId)],
      ['A bordo', String(aliveIds().length) + ' de ' + gv.playerCount],
      ['Anulación', gv.vetoUnlocked ? 'habilitada' : 'bloqueada']
    ];

    const stack = el('div', { class: 'stack' });
    rows.forEach(function (row) {
      stack.appendChild(
        el('div', { class: 'row' }, [
          el('span', { class: 'muted', text: row[0] }),
          el('span', { class: 'spacer' }),
          el('span', { text: row[1] })
        ])
      );
    });
    panel.appendChild(stack);
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

    const panel = el('div', { class: 'panel' });
    panel.appendChild(el('div', { class: 'panel-title' }, [el('span', { text: 'Tu rol' })]));

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
    panel.appendChild(el('p', { class: 'role-hint', text: 'Solo lo ves vos.' }));

    return panel;
  }

  function describeEvent(event) {
    switch (event.type) {
      case 'chancellor-nominated':
        return {
          cls: '',
          text: playerName(event.presidentId) + ' nominó a ' + playerName(event.chancellorId) + ' como Primer Oficial.'
        };
      case 'vote-result':
        return {
          cls: event.passed ? 'tag-crew' : 'tag-sabotage',
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
        return { cls: '', text: 'Se entregan 3 directivas al Capitán.' };
      case 'policy-enacted':
        return {
          cls: event.policy === 'crew' ? 'tag-crew' : 'tag-sabotage',
          text:
            'Directiva de ' +
            POLICY_INFO[event.policy].label +
            (event.source === 'tracker'
              ? ' promulgada por la alerta de motín.'
              : event.source === 'veto'
                ? ' promulgada por la anulación forzada.'
                : ' promulgada.')
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
        return { cls: 'tag-sabotage', text: 'Orden de esclusa contra ' + playerName(event.targetId) + '.' };
      case 'player-executed':
        return { cls: 'tag-sabotage', text: playerName(event.playerId) + ' salió por la esclusa.' };
      case 'veto-proposed':
        return { cls: '', text: 'El Primer Oficial propone anular las directivas.' };
      case 'veto-accepted':
        return { cls: 'tag-power', text: 'El Capitán acepta la anulación: no se promulga nada.' };
      case 'veto-refused':
        return { cls: '', text: 'El Capitán rechaza la anulación.' };
      case 'deck-reshuffled':
        return { cls: '', text: 'Se rebarajan las directivas descartadas.' };
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
    const panel = el('div', { class: 'panel' });
    panel.appendChild(el('div', { class: 'panel-title' }, [el('span', { text: 'Bitácora' })]));

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
          log.appendChild(el('div', { class: 'log-entry ' + entry.cls, text: entry.text }));
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
    const box = el('div', { class: 'notes' }, [el('div', { text: 'Tu expediente personal' })]);
    view.investigations.forEach(function (entry) {
      box.appendChild(
        el('div', { class: 'note-row' }, [
          el('span', { text: playerName(entry.targetId) }),
          el('b', { text: entry.party === 'infiltrator' ? 'infiltrado' : 'tripulante' })
        ])
      );
    });
    return box;
  }

  function playerChoices(ids, onPick, danger) {
    const list = el('div', { class: 'roster' });
    ids.forEach(function (id) {
      list.appendChild(
        el(
          'button',
          {
            class: 'player-card selectable' + (danger ? ' danger' : ''),
            type: 'button',
            onClick: function () {
              onPick(id);
            }
          },
          [
            el('div', { class: 'pname', text: playerName(id) }),
            el('div', { class: 'pflags' }, [
              el('span', { class: 'badge', text: id === game.presidentId ? 'capitán' : 'a bordo' })
            ])
          ]
        )
      );
    });
    return list;
  }

  function policyCards(hand, onPick) {
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
            el('span', { class: 'glyph', text: POLICY_INFO[policy].glyph }),
            el('span', { class: 'plabel', text: POLICY_INFO[policy].label })
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
    const voters = aliveIds();
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

  function actionPanel(gv) {
    if (gv.phase === 'game-over') {
      return el('div', {});
    }

    const actor = currentActorId();
    if (actor === null) {
      return el('div', { class: 'panel' }, [
        el('div', { class: 'action-wait', text: 'Procesando…' })
      ]);
    }

    const container = el('div', { class: 'action', id: 'action' });

    if (!isReady()) {
      container.appendChild(el('div', { class: 'action-title', text: 'Esperando jugada' }));
      container.appendChild(
        el('div', { class: 'action-wait', text: 'Pasale el dispositivo a ' + playerName(actor) + '.' })
      );
      return container;
    }

    const phase = gv.phase;

    if (phase === 'nomination') {
      container.appendChild(el('div', { class: 'action-title', text: 'Nombrá al Primer Oficial' }));
      container.appendChild(
        el('div', {
          class: 'action-sub',
          text: 'Capitán ' + playerName(actor) + ', elegí quién te acompaña en este gobierno.'
        })
      );
      container.appendChild(playerChoices(E.eligibleChancellorIds(game), doNominate, false));
      return container;
    }

    if (phase === 'voting') {
      container.appendChild(
        el('div', { class: 'vote-progress', text: 'Voto ' + (ui.voteIndex + 1) + ' de ' + aliveIds().length })
      );
      container.appendChild(el('div', { class: 'action-title', text: 'Votá el gobierno' }));
      container.appendChild(
        el('div', {
          class: 'action-sub',
          text:
            'Capitán ' + playerName(gv.presidentId) + ' propone a ' +
            playerName(gv.chancellorId) + ' como Primer Oficial. Se aprueba con más votos a favor que en contra.'
        })
      );
      container.appendChild(
        el('div', { class: 'vote-row' }, [
          el('button', { class: 'vote-btn yes', type: 'button', onClick: function () { doVote(true); } }, ['Apruebo']),
          el('button', { class: 'vote-btn no', type: 'button', onClick: function () { doVote(false); } }, ['Rechazo'])
        ])
      );
      return container;
    }

    if (phase === 'legislative-president') {
      container.appendChild(el('div', { class: 'action-title', text: 'Descartá una directiva' }));
      container.appendChild(
        el('div', {
          class: 'action-sub',
          text: 'Capitán ' + playerName(actor) + ', tenés 3 directivas. Descartá una en secreto y pasale las otras 2 al Primer Oficial.'
        })
      );
      container.appendChild(policyCards(game.presidentHand, doPresidentDiscard));
      return container;
    }

    if (phase === 'legislative-chancellor') {
      container.appendChild(el('div', { class: 'action-title', text: 'Promulgá una directiva' }));
      container.appendChild(
        el('div', {
          class: 'action-sub',
          text: 'Primer Oficial ' + playerName(actor) + ', elegí cuál de las 2 directivas entra en vigencia. La otra se descarta.'
        })
      );
      container.appendChild(policyCards(game.chancellorHand, doChancellorDiscard));

      if (gv.vetoUnlocked) {
        container.appendChild(
          el('div', { class: 'stack', style: 'margin-top:16px' }, [
            el('button', { class: 'btn btn-ghost btn-wide', type: 'button', onClick: doProposeVeto }, [
              'Proponer anulación conjunta'
            ]),
            el('div', {
              class: 'muted',
              style: 'font-size:12px',
              text: 'Si el Capitán acepta, se descartan las dos directivas y sube la alerta de motín.'
            })
          ])
        );
      }
      return container;
    }

    if (phase === 'veto-request') {
      container.appendChild(el('div', { class: 'action-title', text: 'Anulación conjunta' }));
      container.appendChild(
        el('div', {
          class: 'action-sub',
          text:
            'El Primer Oficial ' + playerName(gv.chancellorId) +
            ' quiere anular las directivas. Capitán ' + playerName(actor) + ', ¿aceptás?'
        })
      );
      container.appendChild(
        el('div', { class: 'vote-row' }, [
          el('button', { class: 'vote-btn yes', type: 'button', onClick: function () { doAnswerVeto(true); } }, ['Aceptar']),
          el('button', { class: 'vote-btn no', type: 'button', onClick: function () { doAnswerVeto(false); } }, ['Rechazar'])
        ])
      );
      return container;
    }

    if (phase === 'power') {
      const power = gv.pendingPower;
      const danger = power === 'execute';
      container.appendChild(
        el('div', { class: 'action-title', text: POWER_LONG[power] || 'Poder presidencial' })
      );
      container.appendChild(el('div', { class: 'action-sub', text: POWER_HINT[power] || '' }));
      container.appendChild(playerChoices(aliveIds(), doUsePower, danger));
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
        el('span', { class: 'vote-chip ' + (entry.yes ? 'yes' : 'no'), text: playerName(entry.playerId) })
      );
    });
    card.appendChild(chips);

    if (!vote.passed) {
      card.appendChild(
        el('p', {
          class: 'pass-hint',
          text:
            game.electionTracker === 0
              ? 'La alerta de motín llegó al máximo: se promulgó la directiva de arriba del mazo.'
              : 'Alerta de motín: ' + game.electionTracker + ' de ' + E.TRACKER_LIMIT + '.'
        })
      );
    }

    card.appendChild(
      el('div', { class: 'overlay-actions' }, [
        el(
          'button',
          {
            class: 'btn btn-primary',
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
              class: 'btn btn-primary',
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
      nomination: 'Tiene que nominar al Primer Oficial.',
      voting: 'Tiene que emitir su voto en secreto.',
      'legislative-president': 'Tiene que descartar una directiva en secreto.',
      'legislative-chancellor': 'Tiene que promulgar una directiva.',
      'veto-request': 'Tiene que responder a la propuesta de anulación.',
      power: 'Tiene que resolver su poder presidencial.'
    };

    return overlay(
      el('div', { class: 'overlay-card' }, [
        el('div', { class: 'pass-kicker', text: 'Nuevo turno' }),
        el('div', { class: 'pass-name', text: playerName(actorId) }),
        el('p', { class: 'pass-hint', text: reasons[game.phase] || 'Es su turno.' }),
        el('div', { class: 'overlay-actions' }, [
          el('button', { class: 'btn btn-primary', type: 'button', onClick: markReady }, [
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
      el('h2', { class: 'win-title ' + (crewWon ? 'crew' : 'infiltrators'), text: crewWon ? 'Gana la Tripulación' : 'Ganan los Infiltrados' }),
      el('p', { class: 'win-reason', text: WIN_REASON[game.winReason] || '' })
    ]);

    const list = el('div', { class: 'reveal-list' });
    game.players.forEach(function (player) {
      const info = ROLE_INFO[player.role];
      list.appendChild(
        el('div', { class: 'reveal-row ' + player.role + (player.role === 'android' ? ' was-android' : '') }, [
          el('span', { class: 'rname', text: player.name }),
          el('span', { class: 'badge' + (player.alive ? '' : ' dead'), text: player.alive ? 'a bordo' : 'esclusa' }),
          el('span', { class: 'rrole', text: info.label })
        ])
      );
    });
    card.appendChild(list);

    card.appendChild(
      el('div', { class: 'overlay-actions' }, [
        el('button', { class: 'btn btn-primary', type: 'button', onClick: restart }, ['Nueva partida'])
      ])
    );

    return overlay(card);
  }

  // -------------------------------------------------------------------- render

  // -------------------------------------------------------------------- sheets

  const RULES_SECTIONS = [
    {
      title: 'Objetivo',
      body:
        'A bordo hay dos bandos. La Tripulación leal gana si se promulgan 6 directivas de ' +
        'Tripulación o si el Androide sale por la esclusa. Los Infiltrados ganan si se ' +
        'promulgan 6 directivas de Sabotaje, o si el Androide llega a Primer Oficial con ' +
        '3 o más sabotajes ya promulgados.'
    },
    {
      title: 'El gobierno',
      body:
        'En cada ronda el Capitán nombra a un Primer Oficial y todos votan en secreto. El ' +
        'gobierno se aprueba solo si hay más votos a favor que en contra: un empate lo ' +
        'rechaza.'
    },
    {
      title: 'La sesión legislativa',
      body:
        'Si el gobierno se aprueba, el Capitán roba 3 directivas y descarta una en secreto. ' +
        'Le pasa las 2 restantes al Primer Oficial, que descarta otra y promulga la última. ' +
        'Cuando queden menos de 3 directivas en el mazo, se mezclan con los descartes.'
    },
    {
      title: 'Alerta de motín',
      body:
        'Cada gobierno rechazado sube un nivel de la alerta. Al tercero la nave toma el ' +
        'control: se promulga la primera directiva del mazo, sin poder presidencial, y la ' +
        'alerta vuelve a cero.'
    },
    {
      title: 'Expulsión por la esclusa',
      body:
        'Si un poder manda a alguien a la esclusa, queda fuera del juego: no vota y no puede ' +
        'ser nombrado. Su rol nunca se revela. Si expulsan al Androide, gana la Tripulación ' +
        'en el acto.'
    },
    {
      title: 'Anulación conjunta',
      body:
        'Cuando ya hay 5 sabotajes promulgados, el Primer Oficial puede proponer anular el ' +
        'gobierno. Si el Capitán acepta, ambos descartan sus manos sin promulgar nada y la ' +
        'alerta sube un nivel. Si rechaza, sigue la sesión legislativa normal.'
    },
    {
      title: 'Límites de mandato',
      body:
        'El Primer Oficial del gobierno anterior no puede repetir en el siguiente. El Capitán ' +
        'anterior tampoco, salvo que queden 5 jugadores o menos a bordo. El Capitán en ' +
        'ejercicio nunca puede ser su propio Primer Oficial.'
    }
  ];

  function rolesTable() {
    const table = el('table', { class: 'rules-table' });
    table.appendChild(
      el('thead', {}, [
        el('tr', {}, [
          el('th', { text: 'Jugadores' }),
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
    const head = el('tr', {}, [el('th', { text: 'Jugadores' })]);
    for (let sabotage = 1; sabotage <= 5; sabotage += 1) {
      head.appendChild(el('th', { text: 'Sab. ' + sabotage }));
    }
    table.appendChild(el('thead', {}, [head]));

    const body = el('tbody', {});
    groups.forEach(function (group) {
      const row = el('tr', {}, [el('th', { class: 'rowhead', text: group[0] })]);
      for (let sabotage = 1; sabotage <= 5; sabotage += 1) {
        const power = group[1][sabotage];
        row.appendChild(el('td', { text: power ? POWER_LONG[power] || 'Fin' : '—' }));
      }
      body.appendChild(row);
    });
    table.appendChild(body);
    return table;
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
    wrap.appendChild(rolesTable());

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
    wrap.appendChild(powersTable());

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
        'Junto a él, uno o más infiltrados abrieron la esclusa desde adentro.',
      'No hay comunicación con la Tierra. No hay nave de rescate. Solo queda el protocolo: ' +
        'cada ronda se nombra un Capitán y un Primer Oficial, se votan las directivas y se ' +
        'decide quién sigue respirando. El que mienta mejor, gana.'
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
    wrap.appendChild(el('p', { class: 'pass-hint', text: 'Tu rol, solo para vos.' }));
    wrap.appendChild(roleCard(E.roleFor(game, actor)));
    return wrap;
  }

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
      el('div', { class: 'overlay-card sheet-card' }, [
        content,
        el('div', { class: 'overlay-actions' }, [
          el('button', { class: 'btn btn-primary', type: 'button', onClick: closeSheet }, ['Cerrar'])
        ])
      ])
    );
  }

  function render() {
    renderBase();
    if (ui.sheet) {
      app.appendChild(sheetOverlay(ui.sheet));
    }
  }

  function renderBase() {
    app.textContent = '';

    if (!game) {
      app.appendChild(topbar());
      app.appendChild(setupScreen());
      if (ui.toast) {
        app.appendChild(
          overlay(el('div', { class: 'overlay-card' }, [el('p', { class: 'pass-hint', text: ui.toast })]))
        );
      }
      return;
    }

    app.appendChild(topbar());

    if (ui.screen === 'reveal') {
      app.appendChild(revealOverlay());
      return;
    }

    const gv = E.publicView(game);

    const board = el('div', { class: 'board' });
    const main = el('div', { class: 'board-main' });
    main.appendChild(tracksPanel(gv));
    main.appendChild(rosterPanel(gv));
    main.appendChild(actionPanel(gv));

    const side = el('div', { class: 'board-side' });
    side.appendChild(statusPanel(gv));
    side.appendChild(rolePanel(gv));
    side.appendChild(logPanel(gv));

    board.appendChild(main);
    board.appendChild(side);
    app.appendChild(board);

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
