'use strict';

/*
 * End-to-end smoke test for the UI layer.
 *
 * There is no browser here, so this boots js/engine.js + js/ui.js inside a Node
 * VM with a tiny DOM shim and then plays whole games by clicking whatever the
 * UI renders. If the view layer throws, dead-ends, forgets a control for some
 * phase, or leaks a role on a pass screen, this goes RED.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeText(data) {
  return {
    kind: 'text',
    data: String(data),
    get textContent() {
      return this.data;
    },
    set textContent(value) {
      this.data = String(value);
    }
  };
}

function makeElement(tag) {
  const node = {
    kind: 'element',
    tagName: String(tag).toLowerCase(),
    children: [],
    attrs: {},
    listeners: {},
    className: '',
    parentNode: null,
    scrollIntoView: function () {},
    appendChild: function (child) {
      child.parentNode = node;
      node.children.push(child);
      return child;
    },
    setAttribute: function (key, value) {
      node.attrs[key] = value;
      if (key === 'id') {
        node.attrs.id = value;
      }
    },
    addEventListener: function (type, handler) {
      node.listeners[type] = node.listeners[type] || [];
      node.listeners[type].push(handler);
    }
  };

  Object.defineProperty(node, 'textContent', {
    get: function () {
      return node.children
        .map(function (child) {
          return child.textContent;
        })
        .join('');
    },
    set: function (value) {
      node.children = [];
      const text = value === null || value === undefined ? '' : String(value);
      if (text !== '') {
        node.children.push(makeText(text));
      }
    }
  });

  return node;
}

function walk(node, visit) {
  visit(node);
  (node.children || []).forEach(function (child) {
    walk(child, visit);
  });
}

function boot(seed) {
  const documentRoot = makeElement('html');
  const appNode = makeElement('main');
  appNode.setAttribute('id', 'app');
  documentRoot.appendChild(appNode);

  // The engine seeds itself from Math.random when it is created without a seed,
  // so an unseeded Math would make every game in this file different on every
  // run. That turns "12 games without a dead end" into a coin flip.
  const deterministicMath = {};
  Object.getOwnPropertyNames(Math).forEach(function (key) {
    deterministicMath[key] = Math[key];
  });
  deterministicMath.random = makeRandom(seed === undefined ? 0x5eed1234 : seed);

  const sandbox = {
    console: console,
    Math: deterministicMath,
    confirm: function () {
      return true;
    },
    setTimeout: function () {
      return 0;
    },
    document: {
      createElement: makeElement,
      createTextNode: makeText,
      getElementById: function (id) {
        let found = null;
        walk(documentRoot, function (node) {
          if (!found && node.kind === 'element' && node.attrs && node.attrs.id === id) {
            found = node;
          }
        });
        return found;
      }
    }
  };

  // ui.js reads window.OrbitaEngine; make window an alias of the global object
  // so the UMD engine's global assignment is visible through it.
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  vm.createContext(sandbox);

  const engineSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'engine.js'), 'utf8');
  const uiSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui.js'), 'utf8');

  vm.runInContext(engineSource, sandbox, { filename: 'engine.js' });
  vm.runInContext(uiSource, sandbox, { filename: 'ui.js' });

  assert.ok(sandbox.OrbitaEngine, 'engine failed to expose itself as a browser global');

  return { root: documentRoot, sandbox: sandbox };
}

function elementsByClass(root, fragment) {
  const out = [];
  walk(root, function (node) {
    if (node.kind === 'element' && node.className && node.className.indexOf(fragment) !== -1) {
      out.push(node);
    }
  });
  return out;
}

function clickableButtons(root) {
  const out = [];
  walk(root, function (node) {
    if (node.kind === 'element' && node.tagName === 'button' && node.listeners.click) {
      out.push(node);
    }
  });
  return out;
}

function findByLabel(root, predicate) {
  return clickableButtons(root).find(function (button) {
    return predicate(button.textContent, button);
  });
}

function hasLabel(root, label) {
  return Boolean(
    findByLabel(root, function (text) {
      return text === label;
    })
  );
}

function click(node) {
  node.listeners.click.forEach(function (handler) {
    handler({ target: node });
  });
}

function clickLabel(root, label) {
  const button = findByLabel(root, function (text) {
    return text === label;
  });
  assert.ok(button, 'expected a "' + label + '" button');
  click(button);
}

function buttonsByClass(root, fragment) {
  return clickableButtons(root).filter(function (button) {
    return button.className.indexOf(fragment) !== -1;
  });
}

function makeRandom(seed) {
  let state = seed >>> 0;
  return function rand() {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const ROLE_CLASSES = ['crew', 'infiltrator', 'android'];

function roleClassOf(node) {
  const tokens = String(node.className || '').split(/\s+/);
  return ROLE_CLASSES.find(function (name) {
    return tokens.indexOf(name) !== -1;
  });
}

function roleCardOnScreen(root) {
  const cards = elementsByClass(root, 'role-card');
  assert.equal(cards.length, 1, 'exactly one role card must be on screen');
  const shown = roleClassOf(cards[0]);
  assert.ok(shown, 'the role card must carry a role class, got: ' + cards[0].className);
  return shown;
}

/**
 * Records the role a player was shown during their own turn, so we can prove
 * that (a) every actor can see their role, (b) it never changes, and (c) it
 * matches the role revealed at the end of the game.
 */
function recordPeek(root, observations) {
  const shown = roleCardOnScreen(root);
  const kicker = elementsByClass(root, 'pass-kicker')[0];
  assert.ok(kicker, 'the role sheet must name whose role it is');
  const name = kicker.textContent.trim();
  assert.ok(name.length > 0, 'the role sheet has an empty player name');

  if (observations[name] && observations[name] !== shown) {
    assert.fail('player "' + name + '" was shown ' + observations[name] + ' earlier and ' + shown + ' now');
  }
  observations[name] = shown;
  return { name: name, role: shown };
}

function finalRoles(root) {
  const rows = elementsByClass(root, 'reveal-row');
  const map = {};
  rows.forEach(function (row) {
    const role = roleClassOf(row);
    assert.ok(role, 'a game-over row is missing its role class: ' + row.className);
    const nameNode = elementsByClass(row, 'rname')[0];
    assert.ok(nameNode, 'a game-over row is missing the player name');
    map[nameNode.textContent.trim()] = role;
  });
  return map;
}

/** Dismisses every setup reveal and lands on the first turn. */
function clearSetupReveals(root) {
  for (let i = 0; i < 6; i += 1) {
    click(
      findByLabel(root, function (text) {
        return text.indexOf('— ver mi rol') !== -1;
      })
    );
    click(
      findByLabel(root, function (text) {
        return text.indexOf('Listo') === 0;
      })
    );
  }
}

function playOneGame(seed, seen) {
  const root = boot(seed).root;
  const rand = makeRandom(seed);
  const observations = {};

  // The role control stays available for the whole turn, so the driver must
  // exercise it exactly once per turn instead of clicking it forever.
  let turnId = 0;
  let peekedTurn = -1;

  clickLabel(root, 'Iniciar');
  clickLabel(root, 'Iniciar misión');
  seen.start += 1;

  for (let step = 0; step < 10000; step += 1) {
    const flat = root.textContent;
    if (flat.indexOf('Gana la Tripulación') !== -1 || flat.indexOf('Ganan los Infiltrados') !== -1) {
      return {
        winner: flat.indexOf('Gana la Tripulación') !== -1 ? 'crew' : 'infiltrators',
        observations: observations,
        revealed: finalRoles(root)
      };
    }

    // An open sheet covers the board, so nothing underneath may be clicked.
    if (elementsByClass(root, 'sheet').length > 0) {
      if (elementsByClass(root, 'role-card').length > 0) {
        recordPeek(root, observations);
        seen.rolePeek += 1;
      }
      clickLabel(root, 'Cerrar');
      seen.sheetClose += 1;
      continue;
    }

    let button = findByLabel(root, function (text) {
      return text.indexOf('— ver mi rol') !== -1;
    });
    if (button) {
      click(button);
      seen.initialReveal += 1;
      continue;
    }

    button = findByLabel(root, function (text) {
      return text.indexOf('Listo') === 0;
    });
    if (button) {
      click(button);
      seen.initialRevealDismiss += 1;
      continue;
    }

    button = findByLabel(root, function (text) {
      return text.indexOf('Soy ') === 0;
    });
    if (button) {
      if (flat.indexOf('quedó aislado en el módulo 4') !== -1) {
        seen.isolatedGames.add(seed);
      }
      assert.equal(
        elementsByClass(root, 'role-card').length,
        0,
        'the pass screen leaked a role card before the hand-off was confirmed'
      );
      click(button);
      seen.handoff += 1;
      turnId += 1;
      continue;
    }

    if (hasLabel(root, 'Ver rol') && peekedTurn !== turnId) {
      peekedTurn = turnId;
      clickLabel(root, 'Ver rol');
      seen.rolePeekOpen += 1;
      continue;
    }

    button = findByLabel(root, function (text) {
      return text === 'Continuar';
    });
    if (button) {
      click(button);
      seen.voteResult += 1;
      continue;
    }

    button = findByLabel(root, function (text) {
      return text.indexOf('Entendido') === 0;
    });
    if (button) {
      click(button);
      seen.investigationResult += 1;
      continue;
    }

    const yes = findByLabel(root, function (text) {
      return text === 'Apruebo';
    });
    const no = findByLabel(root, function (text) {
      return text === 'Rechazo';
    });
    if (yes && no) {
      click(rand() < 0.55 ? yes : no);
      seen.vote += 1;
      continue;
    }

    const accept = findByLabel(root, function (text) {
      return text === 'Aceptar';
    });
    const reject = findByLabel(root, function (text) {
      return text === 'Rechazar';
    });
    if (accept && reject) {
      click(rand() < 0.5 ? accept : reject);
      seen.vetoAnswer += 1;
      continue;
    }

    const cards = buttonsByClass(root, 'policy-card');
    if (cards.length > 0) {
      if (elementsByClass(root, 'open-hand').length > 0) {
        seen.openHand += 1;
      }
      click(cards[Math.floor(rand() * cards.length)]);
      seen.policy += 1;
      continue;
    }

    const propose = findByLabel(root, function (text) {
      return text.indexOf('Proponer anulación') !== -1;
    });
    if (propose && rand() < 0.3) {
      click(propose);
      seen.vetoPropose += 1;
      continue;
    }

    const confirm = findByLabel(root, function (text) {
      return text.indexOf('Confirmar') === 0;
    });
    if (confirm) {
      click(confirm);
      seen.confirm += 1;
      continue;
    }

    const picks = buttonsByClass(root, 'selectable');
    if (picks.length > 0) {
      click(picks[Math.floor(rand() * picks.length)]);
      seen.pick += 1;
      continue;
    }

    assert.fail('UI dead end at step ' + step + ' — visible text: ' + flat.slice(0, 200));
  }

  assert.fail('game did not finish within the step budget');
}

test('the UI can play whole games without dead ends', function () {
  const seen = {
    start: 0,
    initialReveal: 0,
    initialRevealDismiss: 0,
    handoff: 0,
    rolePeekOpen: 0,
    rolePeek: 0,
    sheetClose: 0,
    vote: 0,
    voteResult: 0,
    policy: 0,
    pick: 0,
    vetoPropose: 0,
    vetoAnswer: 0,
    investigationResult: 0,
    confirm: 0,
    openHand: 0,
    isolatedGames: new Set()
  };

  const outcomes = { crew: 0, infiltrators: 0 };
  const games = 24;

  for (let i = 0; i < games; i += 1) {
    const result = playOneGame(i * 7919 + 17, seen);
    outcomes[result.winner] += 1;

    const names = Object.keys(result.observations);
    assert.equal(names.length, 6, 'all six players must be able to see their own role during play');

    names.forEach(function (name) {
      assert.equal(
        result.observations[name],
        result.revealed[name],
        'the role shown to ' + name + ' mid-game must match the role revealed at the end'
      );
    });

    assert.equal(Object.keys(result.revealed).length, 6, 'every role is revealed at game over');
  }

  assert.equal(outcomes.crew + outcomes.infiltrators, games);
  assert.equal(seen.start, games, 'every game must start from the setup screen');
  assert.equal(seen.initialReveal, games * 6, 'each of the six players reveals a role once at setup');
  assert.equal(seen.initialRevealDismiss, games * 6, 'each setup reveal is dismissed once');
  assert.ok(seen.handoff > games * 5, 'the pass-the-device ceremony must run on every turn');
  assert.ok(seen.rolePeekOpen > games, 'the in-turn role button must be offered');
  assert.ok(seen.rolePeek > games, 'the in-turn role button must actually show a role');
  assert.ok(seen.vote > games * 5, 'voting must happen');
  assert.ok(seen.voteResult > games, 'vote tallies must be shown');
  assert.ok(seen.policy > games, 'policies must actually be enacted');
  assert.ok(seen.pick > games, 'nominations and power targets must be selectable');
  assert.equal(seen.confirm, seen.pick, 'every pick is confirmed before it takes effect');
  assert.ok(seen.isolatedGames.size > 0, 'some games must reach an isolation in the módulo 4');
  assert.ok(seen.openHand > 0, 'an isolated reparador must legislate with the cards in the open');
  assert.ok(outcomes.crew > 0, 'the crew victory screen must be reachable');
  assert.ok(outcomes.infiltrators > 0, 'the infiltrator victory screen must be reachable');
});

test('the setup reveal never shows another player their role', function () {
  const root = boot().root;

  clickLabel(root, 'Iniciar');
  clickLabel(root, 'Iniciar misión');

  for (let i = 0; i < 6; i += 1) {
    const passScreen = root.textContent;
    assert.ok(passScreen.indexOf('ver mi rol') !== -1);
    assert.equal(passScreen.indexOf('Tripulante'), -1, 'no role leaks before the player takes the device');
    assert.equal(passScreen.indexOf('Infiltrado'), -1, 'no role leaks before the player takes the device');
    assert.equal(passScreen.indexOf('Androide'), -1, 'no role leaks before the player takes the device');

    click(
      findByLabel(root, function (text) {
        return text.indexOf('— ver mi rol') !== -1;
      })
    );

    const roleScreen = root.textContent;
    const shown =
      roleScreen.indexOf('Tripulante') !== -1 ||
      roleScreen.indexOf('Infiltrado') !== -1 ||
      roleScreen.indexOf('Androide') !== -1;
    assert.ok(shown, 'the role must be visible right after taking the device');

    click(
      findByLabel(root, function (text) {
        return text.indexOf('Listo') === 0;
      })
    );
  }

  assert.ok(root.textContent.indexOf('Registro de sistemas') !== -1, 'the board renders after the reveal');
});

test('the splash screen opens the rules', function () {
  const root = boot().root;

  assert.ok(hasLabel(root, 'Iniciar'), 'the splash screen offers to start');
  clickLabel(root, 'Cómo se juega');
  assert.ok(elementsByClass(root, 'sheet')[0].textContent.indexOf('Cómo se juega') !== -1);
  clickLabel(root, 'Cerrar');
  assert.equal(elementsByClass(root, 'sheet').length, 0, 'the sheet closes');
  assert.ok(hasLabel(root, 'Iniciar'), 'the splash screen is still there');
});

test('the rules sheet opens before the game starts', function () {
  const root = boot().root;
  clickLabel(root, 'Iniciar');

  clickLabel(root, 'Reglas');

  const sheetText = elementsByClass(root, 'sheet')[0].textContent;
  assert.ok(sheetText.indexOf('Cómo se juega') !== -1, 'the rules sheet has a title');
  assert.ok(sheetText.indexOf('Reparto de roles') !== -1, 'the rules document the role distribution');
  assert.ok(sheetText.indexOf('Alerta de motín') !== -1, 'the rules document the election tracker');
  assert.ok(sheetText.indexOf('Anulación conjunta') !== -1, 'the rules document the veto');
  assert.ok(sheetText.indexOf('Poderes del Capitán') !== -1, 'the rules document the presidential powers');

  const roleRows = elementsByClass(root, 'rules-table')[0].textContent;
  ['5', '6', '7', '8', '9', '10'].forEach(function (count) {
    assert.ok(roleRows.indexOf(count) !== -1, 'the role table is missing the ' + count + ' player row');
  });

  clickLabel(root, 'Cerrar');
  assert.equal(elementsByClass(root, 'sheet').length, 0, 'the sheet closes');
  assert.ok(hasLabel(root, 'Iniciar misión'), 'the setup screen is still there');
});

test('the lore sheet opens before the game starts', function () {
  const root = boot().root;
  clickLabel(root, 'Iniciar');

  clickLabel(root, 'Historia');

  const sheetText = elementsByClass(root, 'sheet')[0].textContent;
  assert.ok(sheetText.indexOf('Órbita Negra') !== -1, 'the lore names the station');
  assert.ok(sheetText.indexOf('Androide') !== -1, 'the lore introduces the android');
  assert.ok(sheetText.indexOf('Bitácora') !== -1, 'the lore is framed as a ships log');

  clickLabel(root, 'Cerrar');
  assert.equal(elementsByClass(root, 'sheet').length, 0, 'the sheet closes');
});

test('rules and lore stay reachable once the game is running', function () {
  const root = boot().root;

  clickLabel(root, 'Iniciar');
  clickLabel(root, 'Iniciar misión');
  clearSetupReveals(root);

  assert.ok(hasLabel(root, 'Reglas'), 'rules must be reachable mid-game');
  assert.ok(hasLabel(root, 'Historia'), 'lore must be reachable mid-game');

  clickLabel(root, 'Reglas');
  assert.ok(elementsByClass(root, 'sheet')[0].textContent.indexOf('Cómo se juega') !== -1);
  clickLabel(root, 'Cerrar');

  clickLabel(root, 'Historia');
  assert.ok(elementsByClass(root, 'sheet')[0].textContent.indexOf('Bitácora') !== -1);
  clickLabel(root, 'Cerrar');

  assert.equal(elementsByClass(root, 'sheet').length, 0);
});

test('the role button appears only on the acting players turn', function () {
  const root = boot().root;

  clickLabel(root, 'Iniciar');
  clickLabel(root, 'Iniciar misión');
  clearSetupReveals(root);

  // The section is always in the same place, but before the hand-off is
  // confirmed the device is still in the previous player's hands, so no role
  // control may exist.
  assert.ok(
    root.textContent.indexOf('Tu rol') !== -1,
    'the role section must be its own titled panel'
  );
  assert.equal(hasLabel(root, 'Ver rol'), false, 'no role peek before the hand-off');

  const passButton = findByLabel(root, function (text) {
    return text.indexOf('Soy ') === 0;
  });
  assert.ok(passButton, 'the turn must offer the hand-off confirmation');
  const actorName = passButton.textContent.replace(/^Soy /, '').trim();

  click(passButton);

  assert.ok(hasLabel(root, 'Ver rol'), 'the acting player must be able to consult their role');

  clickLabel(root, 'Ver rol');

  const kicker = elementsByClass(root, 'pass-kicker')[0];
  assert.ok(kicker, 'the role sheet names the player');
  assert.equal(kicker.textContent.trim(), actorName, 'the sheet shows the acting players own role');
  assert.ok(roleClassOf(elementsByClass(root, 'role-card')[0]), 'the sheet shows an actual role');

  clickLabel(root, 'Cerrar');
  assert.equal(elementsByClass(root, 'role-card').length, 0, 'the role hides again after closing');
  assert.ok(hasLabel(root, 'Ver rol'), 'the control stays available for the rest of the turn');
});

test('the game over screen reveals every role', function () {
  const root = boot().root;

  clickLabel(root, 'Iniciar');
  clickLabel(root, 'Iniciar misión');

  const rand = makeRandom(991);

  for (let step = 0; step < 6000; step += 1) {
    const flat = root.textContent;
    if (flat.indexOf('Gana la Tripulación') !== -1 || flat.indexOf('Ganan los Infiltrados') !== -1) {
      assert.equal(Object.keys(finalRoles(root)).length, 6, 'all six players are revealed at the end');
      return;
    }

    let button = findByLabel(root, function (text) {
      return text.indexOf('— ver mi rol') !== -1 || text.indexOf('Listo') === 0 || text.indexOf('Soy ') === 0;
    });
    if (!button) {
      button = findByLabel(root, function (text) {
        return text === 'Continuar' || text.indexOf('Entendido') === 0;
      });
    }
    if (!button) {
      const yes = findByLabel(root, function (text) {
        return text === 'Apruebo';
      });
      const no = findByLabel(root, function (text) {
        return text === 'Rechazo';
      });
      if (yes && no) {
        button = rand() < 0.5 ? yes : no;
      }
    }
    if (!button) {
      const accept = findByLabel(root, function (text) {
        return text === 'Aceptar';
      });
      const reject = findByLabel(root, function (text) {
        return text === 'Rechazar';
      });
      if (accept && reject) {
        button = rand() < 0.5 ? accept : reject;
      }
    }
    if (!button) {
      const cards = buttonsByClass(root, 'policy-card');
      if (cards.length) {
        button = cards[0];
      }
    }
    if (!button) {
      button = findByLabel(root, function (text) {
        return text.indexOf('Confirmar') === 0;
      });
    }
    if (!button) {
      const picks = buttonsByClass(root, 'selectable');
      if (picks.length) {
        button = picks[0];
      }
    }

    assert.ok(button, 'UI dead end at step ' + step + ': ' + flat.slice(0, 160));
    click(button);
  }

  assert.fail('game did not finish within the step budget');
});
