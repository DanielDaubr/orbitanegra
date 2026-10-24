'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');

const SABOTAGE_TOTAL = 11;
const CREW_TOTAL = 6;

function makeGame(count, seed) {
  const names = [];
  for (let i = 0; i < count; i += 1) {
    names.push('P' + i);
  }
  return E.createGame({ playerNames: names, seed: seed === undefined ? 42 : seed });
}

// Nobody leaves the table, so every player votes, isolated or not.
function allVotes(state, yes) {
  return state.players
    .map(function (p) {
      return { playerId: p.id, yes: yes };
    });
}

function passGovernment(state) {
  const candidate = E.eligibleChancellorIds(state)[0];
  assert.notEqual(candidate, undefined, 'expected at least one eligible chancellor');
  assert.equal(E.nominateChancellor(state, candidate).ok, true);
  return E.castVotes(state, allVotes(state, true));
}

function failGovernment(state) {
  const candidate = E.eligibleChancellorIds(state)[0];
  E.nominateChancellor(state, candidate);
  return E.castVotes(state, allVotes(state, false));
}

function playerWithRole(state, role) {
  return state.players.filter(function (p) {
    return p.role === role;
  })[0];
}

function conservation(state) {
  return (
    state.policies.crew +
    state.policies.sabotage +
    state.deck.length +
    state.discards.length +
    state.presidentHand.length +
    state.chancellorHand.length
  );
}

/*
 * Builds a legal board state. Every policy is pulled from the pool that still
 * holds it, so the 17-policy conservation rule holds from the very first draw
 * instead of being broken by hand-written fixtures.
 */
function makeTable(config) {
  const state = makeGame(config.players || 5, config.seed === undefined ? 1 : config.seed);
  const policies = config.policies || { crew: 0, sabotage: 0 };
  const crewEnacted = policies.crew || 0;
  const sabotageEnacted = policies.sabotage || 0;

  const pool = [];
  for (let i = 0; i < SABOTAGE_TOTAL - sabotageEnacted; i += 1) {
    pool.push('sabotage');
  }
  for (let i = 0; i < CREW_TOTAL - crewEnacted; i += 1) {
    pool.push('crew');
  }

  function pull(kind) {
    const index = pool.indexOf(kind);
    if (index === -1) {
      throw new Error('fixture asked for a ' + kind + ' policy the deck no longer holds');
    }
    return pool.splice(index, 1)[0];
  }

  function pullAll(list) {
    return (list || []).map(pull);
  }

  state.policies = { crew: crewEnacted, sabotage: sabotageEnacted };
  state.presidentHand = pullAll(config.presidentHand);
  state.chancellorHand = pullAll(config.chancellorHand);
  state.discards = pullAll(config.discards);
  state.deck = pool;
  return state;
}

function enactThroughChancellor(state, presidentIndex, chancellorIndex) {
  state.phase = 'legislative-president';
  const discarded = E.presidentDiscard(state, presidentIndex);
  assert.equal(discarded.ok, true, 'president discard failed: ' + discarded.error);
  return E.chancellorDiscard(state, chancellorIndex);
}

// ---------------------------------------------------------------- setup & deck

test('role distribution is correct for every supported player count', function () {
  for (let count = 5; count <= 10; count += 1) {
    const state = makeGame(count);
    const tally = { crew: 0, infiltrator: 0, android: 0 };
    state.players.forEach(function (p) {
      tally[p.role] += 1;
    });

    assert.equal(state.players.length, count, 'player total for ' + count);
    assert.equal(tally.android, 1, 'exactly one android for ' + count);
    assert.equal(tally.crew, E.PLAYER_COUNTS[count].crew, 'crew count for ' + count);
    assert.equal(tally.infiltrator, E.PLAYER_COUNTS[count].infiltrator, 'infiltrator count for ' + count);
  }
});

test('unsupported player counts throw', function () {
  assert.throws(function () {
    makeGame(4);
  }, /unsupported player count/);
  assert.throws(function () {
    makeGame(11);
  }, /unsupported player count/);
});

test('policy deck holds 11 sabotage and 6 crew policies', function () {
  const state = makeGame(5);
  assert.equal(state.deck.length, 17);
  assert.equal(state.deck.filter(function (p) { return p === 'sabotage'; }).length, 11);
  assert.equal(state.deck.filter(function (p) { return p === 'crew'; }).length, 6);
});

test('the same seed produces the same deal', function () {
  const a = makeGame(7, 1234);
  const b = makeGame(7, 1234);
  assert.deepEqual(a.deck, b.deck);
  assert.deepEqual(
    a.players.map(function (p) { return p.role; }),
    b.players.map(function (p) { return p.role; })
  );
});

// -------------------------------------------------------------------- election

test('a tied vote fails and a majority passes', function () {
  const six = makeGame(6, 7);
  E.nominateChancellor(six, E.eligibleChancellorIds(six)[0]);
  const tied = six.players.map(function (p) {
    return { playerId: p.id, yes: p.id < 3 };
  });
  const tieResult = E.castVotes(six, tied);
  assert.equal(tieResult.ok, true);
  assert.equal(tieResult.passed, false);

  const five = makeGame(5, 7);
  E.nominateChancellor(five, E.eligibleChancellorIds(five)[0]);
  const majority = five.players.map(function (p) {
    return { playerId: p.id, yes: p.id < 3 };
  });
  assert.equal(E.castVotes(five, majority).passed, true);
});

test('three failed elections enact the top policy with no power', function () {
  const state = makeGame(7, 99);
  const deckBefore = state.deck.slice();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    failGovernment(state);
  }

  assert.equal(state.electionTracker, 0, 'tracker resets after the forced policy');
  assert.equal(state.policies.crew + state.policies.sabotage, 1);
  assert.equal(state.pendingPower, null, 'tracker policies never grant a power');
  assert.notEqual(state.phase, 'power');

  const enacted = state.events.filter(function (event) {
    return event.type === 'policy-enacted';
  });
  assert.equal(enacted.length, 1);
  assert.equal(enacted[0].source, 'tracker');
  assert.equal(enacted[0].policy, deckBefore[0], 'the top deck policy is the one enacted');
  assert.equal(conservation(state), 17);
});

test('term limits block the previous chancellor and president', function () {
  const state = makeGame(6, 11);
  state.presidentId = 0;
  state.previousPresidentId = 1;
  state.previousChancellorId = 2;

  const eligible = E.eligibleChancellorIds(state);
  assert.equal(eligible.indexOf(0), -1, 'current president is never eligible');
  assert.equal(eligible.indexOf(1), -1, 'previous president is ineligible with 6 players');
  assert.equal(eligible.indexOf(2), -1, 'previous chancellor is ineligible');
  assert.ok(eligible.indexOf(3) !== -1, 'an untarnished player stays eligible');
});

test('in a five player game the previous president stays eligible', function () {
  const state = makeGame(5, 11);
  state.presidentId = 0;
  state.previousPresidentId = 1;
  state.previousChancellorId = 2;

  const eligible = E.eligibleChancellorIds(state);
  assert.ok(eligible.indexOf(1) !== -1, 'previous president is eligible with 5 players');
  assert.equal(eligible.indexOf(2), -1, 'previous chancellor stays ineligible');
  assert.equal(eligible.indexOf(0), -1, 'current president stays ineligible');
});

// ------------------------------------------------------------------ legislature

test('legislative flow moves three policies to two to one', function () {
  const state = makeGame(5, 21);
  passGovernment(state);

  assert.equal(state.phase, 'legislative-president');
  assert.equal(state.presidentHand.length, 3);

  const afterPresident = E.presidentDiscard(state, 0);
  assert.equal(afterPresident.ok, true);
  assert.equal(state.phase, 'legislative-chancellor');
  assert.equal(state.chancellorHand.length, 2);
  assert.equal(state.discards.length, 1);

  const expected = state.chancellorHand[0];
  const before = state.policies[expected];
  E.chancellorDiscard(state, 0);

  assert.equal(state.policies[expected], before + 1);
  assert.equal(state.chancellorHand.length, 0);
  assert.equal(conservation(state), 17);
});

test('the power table matches the player count', function () {
  assert.equal(E.POWER_TABLE[5][1], null, '5 players: first sabotage grants nothing');
  assert.equal(E.POWER_TABLE[5][2], 'investigate');
  assert.equal(E.POWER_TABLE[7][1], 'investigate', '7 players: first sabotage investigates');
  assert.equal(E.POWER_TABLE[9][1], 'investigate');
  assert.equal(E.POWER_TABLE[9][3], 'investigate', '9 players: three investigates');
  assert.equal(E.POWER_TABLE[9][4], 'special-election', '9 players: special election on slot 4');
  assert.equal(E.POWER_TABLE[9][5], 'isolate');
  assert.equal(E.POWER_TABLE[10][5], 'isolate');
  assert.equal(E.POWER_TABLE[5][4], 'isolate');
  Object.keys(E.POWER_TABLE).forEach(function (count) {
    assert.equal(E.POWER_TABLE[count].indexOf('execute'), -1, count + ' players: nobody is executed');
  });
});

test('the power table drives the granted power end to end', function () {
  const state = makeTable({
    players: 5,
    seed: 4,
    policies: { crew: 0, sabotage: 1 },
    presidentHand: ['sabotage', 'sabotage', 'sabotage']
  });
  state.presidentId = 0;
  state.chancellorId = 1;

  enactThroughChancellor(state, 0, 0);

  assert.equal(state.policies.sabotage, 2);
  assert.equal(state.pendingPower, 'investigate', 'slot 2 in a 5 player game investigates');
  assert.equal(state.phase, 'power');
});

// ---------------------------------------------------------------- win conditions

test('the android wins as chancellor only once three sabotage policies are enacted', function () {
  function electAndroidWith(sabotage) {
    const state = makeTable({ players: 5, seed: 5, policies: { crew: 0, sabotage: sabotage } });
    const android = playerWithRole(state, 'android');
    state.previousPresidentId = null;
    state.previousChancellorId = null;
    state.phase = 'nomination';
    state.presidentId = (android.id + 1) % 5;
    state.chancellorId = null;

    E.nominateChancellor(state, android.id);
    return E.castVotes(state, allVotes(state, true));
  }

  const winning = electAndroidWith(3);
  assert.equal(winning.winner, 'infiltrators');
  assert.equal(winning.winReason, 'android-chancellor');

  const notYet = electAndroidWith(2);
  assert.notEqual(notYet.winner, 'infiltrators');
  assert.equal(notYet.phase, 'legislative-president');
});

test('isolating the android wins immediately for the crew', function () {
  const state = makeTable({ players: 7, seed: 77, policies: { crew: 0, sabotage: 4 } });
  const android = playerWithRole(state, 'android');
  state.pendingPower = 'isolate';
  state.phase = 'power';
  state.presidentId = playerWithRole(state, 'crew').id;

  const result = E.usePower(state, { targetId: android.id });
  assert.equal(result.ok, true);
  assert.equal(state.winner, 'crew');
  assert.equal(state.winReason, 'android-isolated');
  assert.equal(state.phase, 'game-over');
});

test('isolation keeps the player at the table and never reveals their role', function () {
  const state = makeTable({ players: 7, seed: 78, policies: { crew: 0, sabotage: 4 } });
  const crew = playerWithRole(state, 'crew');
  state.pendingPower = 'isolate';
  state.phase = 'power';
  state.presidentId = playerWithRole(state, 'infiltrator').id;

  E.usePower(state, { targetId: crew.id });
  assert.equal(state.players[crew.id].isolated, true);
  assert.equal(state.players.length, 7, 'nobody leaves the table');
  assert.equal(state.phase, 'nomination');
  assert.equal(state.winner, null);
  assert.equal(JSON.stringify(state.events).indexOf('"role"'), -1);
  assert.equal(E.publicView(state).players[crew.id].isolated, true, 'isolation is public');
});

test('the Capitán cannot isolate themselves or an already isolated player', function () {
  const state = makeTable({ players: 7, seed: 79, policies: { crew: 0, sabotage: 4 } });
  state.pendingPower = 'isolate';
  state.phase = 'power';
  state.presidentId = 0;
  state.players[3].isolated = true;
  const snapshot = JSON.stringify(state);

  assert.equal(E.usePower(state, { targetId: 0 }).error, 'cannot-isolate-self');
  assert.equal(E.usePower(state, { targetId: 3 }).error, 'already-isolated');
  assert.equal(JSON.stringify(state), snapshot, 'rejected isolations must not mutate state');
  assert.equal(E.isolationTargetIds(state).indexOf(0), -1);
  assert.equal(E.isolationTargetIds(state).indexOf(3), -1);
  assert.equal(E.isolationTargetIds(state).length, 5);
});

test('isolated players still vote and can serve as Capitán or reparador', function () {
  const state = makeGame(6, 80);
  state.players.forEach(function (p) {
    if (p.id !== state.presidentId) {
      p.isolated = true;
    }
  });
  state.players[state.presidentId].isolated = true;

  const eligible = E.eligibleChancellorIds(state);
  assert.ok(eligible.length > 0, 'isolated players remain eligible as reparador');
  assert.equal(E.nominateChancellor(state, eligible[0]).ok, true);
  const result = E.castVotes(state, allVotes(state, true));
  assert.equal(result.ok, true, 'every isolated player votes');
  assert.equal(state.lastVote.yes, 6);
  assert.equal(state.phase, 'legislative-president');
});

test('an isolated reparador legislates in the open', function () {
  const state = makeTable({
    players: 6,
    seed: 81,
    policies: { crew: 1, sabotage: 1 },
    presidentHand: ['sabotage', 'crew', 'sabotage']
  });
  state.presidentId = 0;
  state.chancellorId = 1;
  state.phase = 'legislative-president';
  state.players[1].isolated = true;

  assert.equal(E.publicView(state).openHand, null, 'the Capitán hand is never public');

  assert.equal(E.presidentDiscard(state, 0).ok, true);
  const view = E.publicView(state);
  assert.deepEqual(view.openHand, ['crew', 'sabotage'], 'the two received cards are public');
  const shown = state.events.filter(function (e) { return e.type === 'open-hand'; });
  assert.equal(shown.length, 1);
  assert.deepEqual(shown[0].cards, ['crew', 'sabotage']);

  E.chancellorDiscard(state, 1);
  const discard = state.events.filter(function (e) { return e.type === 'open-discard'; });
  assert.equal(discard.length, 1, 'the discard is logged publicly');
  assert.equal(discard[0].discarded, 'crew');
  assert.equal(discard[0].enacted, 'sabotage');
  assert.equal(E.publicView(state).openHand, null, 'nothing stays open after the session');
  assert.equal(conservation(state), 17);
});

test('a reparador who is not isolated keeps a secret hand', function () {
  const state = makeTable({
    players: 6,
    seed: 82,
    policies: { crew: 0, sabotage: 0 },
    presidentHand: ['sabotage', 'crew', 'sabotage']
  });
  state.presidentId = 0;
  state.chancellorId = 1;
  state.phase = 'legislative-president';

  assert.equal(E.presidentDiscard(state, 0).ok, true);
  assert.equal(E.publicView(state).openHand, null);
  assert.equal(E.chancellorDiscard(state, 0).ok, true);
  const leaks = state.events.filter(function (e) { return e.type === 'open-hand' || e.type === 'open-discard'; });
  assert.equal(leaks.length, 0, 'a normal reparador never exposes cards');
});

test('six crew policies win for the crew', function () {
  const state = makeTable({
    players: 5,
    seed: 3,
    policies: { crew: 5, sabotage: 0 },
    presidentHand: ['sabotage', 'sabotage', 'crew']
  });
  state.chancellorId = 1;

  // The president ditches a sabotage card, leaving the chancellor a crew
  // policy at index 1 to enact as the sixth crew policy.
  state.phase = 'legislative-president';
  E.presidentDiscard(state, 0);
  assert.deepEqual(state.chancellorHand, ['sabotage', 'crew']);
  E.chancellorDiscard(state, 1);

  assert.equal(state.policies.crew, 6);
  assert.equal(state.policies.sabotage, 0);
  assert.equal(state.winner, 'crew');
  assert.equal(state.winReason, 'policies');
});

test('six sabotage policies win for the infiltrators', function () {
  const state = makeTable({
    players: 9,
    seed: 3,
    policies: { crew: 0, sabotage: 5 },
    presidentHand: ['sabotage', 'sabotage', 'sabotage']
  });
  state.chancellorId = 1;

  enactThroughChancellor(state, 0, 0);

  assert.equal(state.policies.sabotage, 6);
  assert.equal(state.winner, 'infiltrators');
  assert.equal(state.winReason, 'policies');
});

// ------------------------------------------------------------------------ veto

test('veto unlocks at five sabotage policies', function () {
  const locked = makeTable({
    policies: { crew: 0, sabotage: 4 },
    chancellorHand: ['crew', 'crew']
  });
  locked.phase = 'legislative-chancellor';
  const lockedResult = E.proposeVeto(locked);
  assert.equal(lockedResult.ok, false);
  assert.equal(lockedResult.error, 'veto-locked');
  assert.equal(locked.phase, 'legislative-chancellor');

  const unlocked = makeTable({
    policies: { crew: 0, sabotage: 5 },
    chancellorHand: ['crew', 'crew']
  });
  unlocked.phase = 'legislative-chancellor';
  const unlockedResult = E.proposeVeto(unlocked);
  assert.equal(unlockedResult.ok, true);
  assert.equal(unlocked.phase, 'veto-request');
});

test('an accepted veto discards both policies and advances the tracker', function () {
  const state = makeTable({
    seed: 8,
    policies: { crew: 1, sabotage: 5 },
    chancellorHand: ['crew', 'sabotage']
  });
  state.phase = 'legislative-chancellor';
  state.electionTracker = 0;

  E.proposeVeto(state);
  const result = E.answerVeto(state, true);

  assert.equal(result.accepted, true);
  assert.equal(state.policies.sabotage, 5, 'no policy is enacted by a veto');
  assert.equal(state.policies.crew, 1);
  assert.equal(state.chancellorHand.length, 0);
  assert.equal(state.discards.length, 2);
  assert.equal(state.electionTracker, 1);
  assert.equal(conservation(state), 17);
});

test('a refused veto returns control to the chancellor', function () {
  const state = makeTable({
    seed: 8,
    policies: { crew: 0, sabotage: 5 },
    chancellorHand: ['crew', 'crew']
  });
  state.phase = 'legislative-chancellor';

  E.proposeVeto(state);
  const result = E.answerVeto(state, false);

  assert.equal(result.accepted, false);
  assert.equal(state.phase, 'legislative-chancellor');
  assert.equal(state.chancellorHand.length, 2);
});

// ------------------------------------------------------------------ deck shuffle

test('the deck reshuffles from discards without losing the leftover cards', function () {
  const discards = [];
  for (let i = 0; i < 9; i += 1) discards.push('sabotage');
  for (let i = 0; i < 6; i += 1) discards.push('crew');

  const state = makeTable({ seed: 33, discards: discards });
  assert.equal(state.deck.length, 2, 'precondition: fewer than three policies remain');
  assert.equal(conservation(state), 17);

  passGovernment(state);

  assert.equal(state.phase, 'legislative-president');
  assert.equal(state.presidentHand.length, 3);
  assert.equal(state.deck.length, 14, 'two leftovers plus fifteen discards, minus the three drawn');
  assert.equal(state.discards.length, 0);
  assert.equal(conservation(state), 17);
});

test('no reshuffle happens while three or more policies remain', function () {
  const discards = [];
  for (let i = 0; i < 8; i += 1) discards.push('sabotage');
  for (let i = 0; i < 6; i += 1) discards.push('crew');

  const state = makeTable({ seed: 34, discards: discards });
  assert.equal(state.deck.length, 3);

  passGovernment(state);

  assert.equal(state.deck.length, 0, 'exactly three were drawn and nothing was reshuffled');
  assert.equal(state.discards.length, 14, 'the discard pile was not burned');
  assert.equal(conservation(state), 17);
});

// ------------------------------------------------------------------ validation

test('illegal calls are rejected without mutating state', function () {
  const state = makeGame(6, 55);
  const snapshot = JSON.stringify(state);

  assert.equal(E.castVotes(state, allVotes(state, true)).error, 'wrong-phase');
  assert.equal(E.presidentDiscard(state, 0).error, 'wrong-phase');
  assert.equal(E.chancellorDiscard(state, 0).error, 'wrong-phase');
  assert.equal(E.proposeVeto(state).error, 'wrong-phase');
  assert.equal(E.answerVeto(state, true).error, 'wrong-phase');
  assert.equal(E.usePower(state, { targetId: 1 }).error, 'wrong-phase');
  assert.equal(E.nominateChancellor(state, state.presidentId).error, 'ineligible-chancellor');
  assert.equal(E.nominateChancellor(state, 99).error, 'unknown-player');

  assert.equal(JSON.stringify(state), snapshot, 'rejected calls must not mutate state');
});

test('malformed ballots are rejected', function () {
  const state = makeGame(5, 12);
  E.nominateChancellor(state, E.eligibleChancellorIds(state)[0]);
  const snapshot = JSON.stringify(state);

  assert.equal(E.castVotes(state, []).error, 'vote-count');
  assert.equal(
    E.castVotes(state, allVotes(state, true).concat([{ playerId: 0, yes: true }])).error,
    'vote-count'
  );

  const duplicated = allVotes(state, true);
  duplicated[1] = { playerId: duplicated[0].playerId, yes: true };
  assert.equal(E.castVotes(state, duplicated).error, 'duplicate-vote');

  assert.equal(
    E.castVotes(state, state.players.map(function (p) { return { playerId: p.id, yes: 'yes' }; })).error,
    'invalid-vote'
  );

  assert.equal(JSON.stringify(state), snapshot);
});

// ---------------------------------------------------------------------- views

test('roleFor reveals the right allies', function () {
  const state = makeGame(9, 808);
  const android = playerWithRole(state, 'android');
  const infiltrators = state.players.filter(function (p) {
    return p.role === 'infiltrator';
  });
  const crew = playerWithRole(state, 'crew');

  const androidView = E.roleFor(state, android.id);
  assert.equal(androidView.role, 'android');
  assert.equal(androidView.allies.length, infiltrators.length);
  assert.equal(androidView.allies.indexOf(android.id), -1, 'the android is never their own ally');

  infiltrators.forEach(function (f) {
    const view = E.roleFor(state, f.id);
    assert.ok(view.allies.indexOf(android.id) !== -1, 'infiltrators know the android');
    assert.equal(view.allies.length, infiltrators.length);
  });

  assert.deepEqual(E.roleFor(state, crew.id).allies, []);
});

test('the public view never leaks hidden roles or hands', function () {
  const state = makeGame(8, 61);
  passGovernment(state);
  const view = E.publicView(state);

  const serialized = JSON.stringify(view);
  assert.equal(serialized.indexOf('android'), -1);
  assert.equal(serialized.indexOf('infiltrator'), -1);
  assert.equal(serialized.indexOf('"role"'), -1);
  assert.equal(Object.prototype.hasOwnProperty.call(view, 'presidentHand'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(view, 'chancellorHand'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(view, 'deck'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(view, 'investigations'), false);

  const privateView = E.privateView(state, state.presidentId);
  assert.equal(privateView.hand.length, 3, 'the president sees their own hand');

  const bystander = state.players.filter(function (p) {
    return p.id !== state.presidentId;
  })[0];
  assert.equal(E.privateView(state, bystander.id).hand.length, 0, 'others see nothing');
});

test('investigations are private to the president who ran them', function () {
  const state = makeTable({ players: 7, seed: 42, policies: { crew: 0, sabotage: 1 } });
  state.pendingPower = 'investigate';
  state.phase = 'power';
  state.presidentId = playerWithRole(state, 'crew').id;
  const investigatingId = state.presidentId;
  const target = playerWithRole(state, 'android');

  const result = E.usePower(state, { targetId: target.id });
  assert.equal(result.party, 'infiltrator', 'the android reads as an infiltrator');

  const privateView = E.privateView(state, investigatingId);
  assert.equal(privateView.investigations.length, 1);
  assert.equal(privateView.investigations[0].party, 'infiltrator');
  assert.equal(privateView.investigations[0].targetId, target.id);

  const other = state.players.filter(function (p) {
    return p.id !== investigatingId;
  })[0];
  assert.equal(E.privateView(state, other.id).investigations.length, 0);
  assert.equal(JSON.stringify(E.publicView(state)).indexOf('"party"'), -1);
});

// ------------------------------------------------------------------- fuzz test

function randomMove(state, rand) {
  if (state.phase === 'nomination') {
    const ids = E.eligibleChancellorIds(state);
    assert.ok(ids.length > 0, 'nomination phase must always offer a candidate');
    const pick = ids[Math.floor(rand() * ids.length)];
    const result = E.nominateChancellor(state, pick);
    assert.equal(result.ok, true, 'nomination failed: ' + result.error);
    return;
  }

  if (state.phase === 'voting') {
    const votes = state.players
      .map(function (p) {
        return { playerId: p.id, yes: rand() < 0.55 };
      });
    const result = E.castVotes(state, votes);
    assert.equal(result.ok, true, 'vote failed: ' + result.error);
    return;
  }

  if (state.phase === 'legislative-president') {
    const result = E.presidentDiscard(state, Math.floor(rand() * 3));
    assert.equal(result.ok, true, 'president discard failed: ' + result.error);
    return;
  }

  if (state.phase === 'legislative-chancellor') {
    if (state.policies.sabotage >= E.VETO_THRESHOLD && rand() < 0.35) {
      const result = E.proposeVeto(state);
      assert.equal(result.ok, true, 'veto proposal failed: ' + result.error);
      return;
    }
    const result = E.chancellorDiscard(state, Math.floor(rand() * 2));
    assert.equal(result.ok, true, 'chancellor discard failed: ' + result.error);
    return;
  }

  if (state.phase === 'veto-request') {
    const result = E.answerVeto(state, rand() < 0.5);
    assert.equal(result.ok, true, 'veto answer failed: ' + result.error);
    return;
  }

  if (state.phase === 'power') {
    const pool = state.pendingPower === 'isolate'
      ? E.isolationTargetIds(state)
      : state.players.map(function (p) { return p.id; });
    assert.ok(pool.length > 0, 'a power must always have a target');
    const target = pool[Math.floor(rand() * pool.length)];
    const result = E.usePower(state, { targetId: target });
    assert.equal(result.ok, true, 'power use failed: ' + result.error);
    return;
  }

  assert.fail('unexpected phase: ' + state.phase);
}

function checkInvariants(state, label) {
  assert.ok(state.policies.crew >= 0 && state.policies.crew <= 6, label + ': crew policies out of range');
  assert.ok(
    state.policies.sabotage >= 0 && state.policies.sabotage <= 6,
    label + ': sabotage policies out of range'
  );
  assert.ok(!(state.policies.crew === 6 && state.policies.sabotage === 6), label + ': both sides reached six');

  assert.equal(conservation(state), 17, label + ': policy conservation broken');

  state.deck.concat(state.discards, state.presidentHand, state.chancellorHand).forEach(function (policy) {
    assert.ok(policy === 'crew' || policy === 'sabotage', label + ': unknown policy ' + policy);
  });

  const androidCount = state.players.filter(function (p) {
    return p.role === 'android';
  }).length;
  assert.equal(androidCount, 1, label + ': android count');

  const isolated = state.players.filter(function (p) {
    return p.isolated;
  });
  assert.ok(isolated.length <= 2, label + ': at most two isolations exist in the power table');
  state.players.forEach(function (p) {
    assert.equal(p.alive, undefined, label + ': nobody has a life flag any more');
  });
  if (state.phase !== 'game-over') {
    assert.ok(
      isolated.every(function (p) { return p.role !== 'android'; }),
      label + ': an isolated android must have ended the game'
    );
  }

  const view = E.publicView(state);
  const chancellorIsolated = state.chancellorId !== null && state.players[state.chancellorId].isolated;
  if ((state.phase === 'legislative-chancellor' || state.phase === 'veto-request') && chancellorIsolated) {
    assert.deepEqual(view.openHand, state.chancellorHand, label + ': isolated reparador hand must be public');
  } else {
    assert.equal(view.openHand, null, label + ': a hand leaked into the public view');
  }

  if (state.phase !== 'game-over') {
    if (state.phase === 'power' && state.pendingPower === 'isolate') {
      assert.ok(E.isolationTargetIds(state).length > 0, label + ': isolation without a target');
    }

    if (state.phase !== 'power') {
      assert.equal(state.pendingPower, null, label + ': pendingPower outside the power phase');
    } else {
      assert.notEqual(state.pendingPower, null, label + ': power phase without a pending power');
    }

    if (state.phase === 'legislative-president') {
      assert.equal(state.presidentHand.length, 3, label + ': president hand size');
    }
    if (state.phase === 'legislative-chancellor') {
      assert.equal(state.chancellorHand.length, 2, label + ': chancellor hand size');
    }
    if (state.phase === 'nomination') {
      assert.ok(E.eligibleChancellorIds(state).length > 0, label + ': no eligible chancellor available');
    }
  }
}

test('fuzz: 200 seeded games always reach game over with invariants intact', function () {
  let seedState = 2024;
  function rand() {
    seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
    return seedState / 0x7fffffff;
  }

  const outcomes = { crew: 0, infiltrators: 0 };
  const stepBudget = 4000;

  for (let game = 0; game < 200; game += 1) {
    const count = 5 + (game % 6);
    const state = E.createGame({
      playerNames: Array.from({ length: count }, function (_, i) {
        return 'G' + game + 'P' + i;
      }),
      seed: game * 7919 + 13
    });

    let steps = 0;
    while (state.phase !== 'game-over') {
      steps += 1;
      assert.ok(steps < stepBudget, 'game ' + game + ' exceeded the step budget in phase ' + state.phase);
      randomMove(state, rand);
      checkInvariants(state, 'game ' + game + ' step ' + steps);
    }

    assert.ok(state.winner === 'crew' || state.winner === 'infiltrators', 'game ' + game + ' ended oddly');
    assert.notEqual(state.winReason, null);
    checkInvariants(state, 'game ' + game + ' final');
    outcomes[state.winner] += 1;
  }

  assert.equal(outcomes.crew + outcomes.infiltrators, 200);
  assert.ok(outcomes.crew > 0, 'crew should win some games');
  assert.ok(outcomes.infiltrators > 0, 'infiltrators should win some games');
});
