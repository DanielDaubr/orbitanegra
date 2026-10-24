/*
 * Orbita Negra - rules engine
 *
 * A faithful reskin of the Secret Hitler ruleset with a space-crew theme.
 * Plain script (no ES modules) so index.html works from file://.
 *
 * Terminology mapping:
 *   crew        -> liberal
 *   infiltrator -> fascist
 *   android     -> hitler
 *   sabotage    -> fascist policy
 *   president   -> Capitán
 *   chancellor  -> the crew member designated to repair a zone ("reparador")
 *   execute     -> isolate (Aislamiento en el módulo 4)
 *
 * Nobody dies. An isolated player keeps voting and can still be Capitán or
 * reparador, but legislates in the open whenever they are the reparador.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.OrbitaEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PLAYER_COUNTS = {
    5: { crew: 3, infiltrator: 1, android: 1 },
    6: { crew: 4, infiltrator: 1, android: 1 },
    7: { crew: 4, infiltrator: 2, android: 1 },
    8: { crew: 5, infiltrator: 2, android: 1 },
    9: { crew: 5, infiltrator: 3, android: 1 },
    10: { crew: 6, infiltrator: 3, android: 1 }
  };

  // Indexed by the number of sabotage policies already enacted.
  const POWER_TABLE = {
    5: [null, null, 'investigate', 'special-election', 'isolate', 'isolate', 'win'],
    6: [null, null, 'investigate', 'special-election', 'isolate', 'isolate', 'win'],
    7: [null, 'investigate', 'investigate', 'special-election', 'isolate', 'isolate', 'win'],
    8: [null, 'investigate', 'investigate', 'special-election', 'isolate', 'isolate', 'win'],
    9: [null, 'investigate', 'investigate', 'investigate', 'special-election', 'isolate', 'win'],
    10: [null, 'investigate', 'investigate', 'investigate', 'special-election', 'isolate', 'win']
  };

  const TOTAL_POLICIES = 17;
  const SABOTAGE_POLICIES = 11;
  const CREW_POLICIES = 6;
  // Secret Hitler's 5/6 split: the crew needs 5 of its 6 repair cards,
  // the infiltrators need 6 of their 11 sabotage cards.
  const CREW_WIN_POLICIES = 5;
  const SABOTAGE_WIN_POLICIES = 6;
  const VETO_THRESHOLD = 5;
  const TRACKER_LIMIT = 3;
  const RESHUFFLE_THRESHOLD = 3;

  // ---------------------------------------------------------------- utilities

  function fail(error) {
    return { ok: false, error: error };
  }

  function isInteger(value) {
    return typeof value === 'number' && Math.floor(value) === value;
  }

  // xorshift32 with the state kept inside the serializable game state so a
  // seed plus an action sequence replays deterministically.
  function nextRandom(state) {
    let x = state.rngState | 0;
    x ^= x << 13;
    x |= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x |= 0;
    if (x === 0) {
      x = 0x9e3779b9 | 0;
    }
    state.rngState = x;
    return (x >>> 0) / 4294967296;
  }

  function shuffle(state, array) {
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = Math.floor(nextRandom(state) * (i + 1));
      const tmp = array[i];
      array[i] = array[j];
      array[j] = tmp;
    }
    return array;
  }

  function playerIds(state) {
    return state.players.map(function (player) {
      return player.id;
    });
  }

  function isPlayer(state, playerId) {
    return isInteger(playerId) && Boolean(state.players[playerId]);
  }

  function isIsolated(state, playerId) {
    return isPlayer(state, playerId) && state.players[playerId].isolated;
  }

  function nextSeatAfter(state, playerId) {
    return (playerId + 1) % state.playerCount;
  }

  function pushEvent(state, event) {
    state.events.push(event);
  }

  // ----------------------------------------------------------------- lifecycle

  function createGame(options) {
    const opts = options || {};
    const names = Array.isArray(opts.playerNames) ? opts.playerNames : [];
    const playerCount = names.length;

    if (!PLAYER_COUNTS[playerCount]) {
      throw new Error('unsupported player count: ' + playerCount);
    }

    let seed = isInteger(opts.seed) ? opts.seed | 0 : (Math.random() * 0xffffffff) | 0;
    if (seed === 0) {
      seed = 0x9e3779b9;
    }

    const state = {
      phase: 'nomination',
      playerCount: playerCount,
      players: [],
      deck: [],
      discards: [],
      policies: { crew: 0, sabotage: 0 },
      electionTracker: 0,
      presidentId: 0,
      chancellorId: null,
      previousPresidentId: null,
      previousChancellorId: null,
      pendingPower: null,
      presidentHand: [],
      chancellorHand: [],
      lastVote: null,
      investigations: [],
      events: [],
      winner: null,
      winReason: null,
      seed: seed,
      rngState: seed,
      resumeAfterId: null
    };

    for (let i = 0; i < playerCount; i += 1) {
      state.players.push({
        id: i,
        name: String(names[i] || 'Jugador ' + (i + 1)),
        role: null,
        isolated: false,
        investigated: false
      });
    }

    const distribution = PLAYER_COUNTS[playerCount];
    const rolePool = [];
    for (let c = 0; c < distribution.crew; c += 1) {
      rolePool.push('crew');
    }
    for (let f = 0; f < distribution.infiltrator; f += 1) {
      rolePool.push('infiltrator');
    }
    rolePool.push('android');
    shuffle(state, rolePool);

    for (let p = 0; p < playerCount; p += 1) {
      state.players[p].role = rolePool[p];
    }

    const deck = [];
    for (let s = 0; s < SABOTAGE_POLICIES; s += 1) {
      deck.push('sabotage');
    }
    for (let l = 0; l < CREW_POLICIES; l += 1) {
      deck.push('crew');
    }
    shuffle(state, deck);
    state.deck = deck;

    state.presidentId = Math.floor(nextRandom(state) * playerCount);
    if (state.presidentId >= playerCount) {
      state.presidentId = 0;
    }

    return state;
  }

  function roleFor(state, playerId) {
    const player = state.players[playerId];
    if (!player) {
      return null;
    }

    const allies = [];
    if (player.role === 'infiltrator') {
      for (let i = 0; i < state.players.length; i += 1) {
        const other = state.players[i];
        if (other.id !== playerId && (other.role === 'infiltrator' || other.role === 'android')) {
          allies.push(other.id);
        }
      }
    } else if (player.role === 'android') {
      for (let i = 0; i < state.players.length; i += 1) {
        const other = state.players[i];
        if (other.role === 'infiltrator') {
          allies.push(other.id);
        }
      }
    }

    return { role: player.role, allies: allies };
  }

  function eligibleChancellorIds(state) {
    const seated = playerIds(state);
    // Nobody leaves the table, so the original "5 or fewer alive" exception
    // only ever applies to 5-player games.
    const previousPresidentLimited = seated.length > 5;

    function build(limitPresident, limitChancellor) {
      const out = [];
      for (let i = 0; i < seated.length; i += 1) {
        const id = seated[i];
        if (id === state.presidentId) {
          continue;
        }
        if (limitChancellor && state.previousChancellorId !== null && id === state.previousChancellorId) {
          continue;
        }
        if (limitPresident && state.previousPresidentId !== null && id === state.previousPresidentId) {
          continue;
        }
        out.push(id);
      }
      return out;
    }

    let candidates = build(previousPresidentLimited, true);
    if (candidates.length === 0) {
      candidates = build(false, true);
    }
    if (candidates.length === 0) {
      candidates = build(false, false);
    }
    return candidates;
  }

  // ------------------------------------------------------------------ election

  function nominateChancellor(state, chancellorId) {
    if (state.phase !== 'nomination') {
      return fail('wrong-phase');
    }
    if (!isPlayer(state, chancellorId)) {
      return fail('unknown-player');
    }
    if (eligibleChancellorIds(state).indexOf(chancellorId) === -1) {
      return fail('ineligible-chancellor');
    }

    state.chancellorId = chancellorId;
    state.phase = 'voting';
    pushEvent(state, { type: 'chancellor-nominated', presidentId: state.presidentId, chancellorId: chancellorId });
    return { ok: true, chancellorId: chancellorId };
  }

  function validateVotes(state, votes) {
    if (!Array.isArray(votes)) {
      return 'invalid-votes';
    }
    const seated = playerIds(state);
    if (votes.length !== seated.length) {
      return 'vote-count';
    }

    const seen = {};
    for (let i = 0; i < votes.length; i += 1) {
      const vote = votes[i];
      if (!vote || typeof vote !== 'object') {
        return 'invalid-votes';
      }
      if (!isInteger(vote.playerId) || seated.indexOf(vote.playerId) === -1) {
        return 'invalid-voter';
      }
      if (seen[vote.playerId]) {
        return 'duplicate-vote';
      }
      if (typeof vote.yes !== 'boolean') {
        return 'invalid-vote';
      }
      seen[vote.playerId] = true;
    }

    return null;
  }

  function castVotes(state, votes) {
    if (state.phase !== 'voting') {
      return fail('wrong-phase');
    }

    const error = validateVotes(state, votes);
    if (error) {
      return fail(error);
    }

    let yes = 0;
    let no = 0;
    const recorded = [];
    for (let i = 0; i < votes.length; i += 1) {
      if (votes[i].yes) {
        yes += 1;
      } else {
        no += 1;
      }
      recorded.push({ playerId: votes[i].playerId, yes: votes[i].yes });
    }

    const passed = yes > no;
    state.lastVote = { passed: passed, yes: yes, no: no, votes: recorded };
    pushEvent(state, { type: 'vote-result', passed: passed, yes: yes, no: no });

    if (passed) {
      state.previousPresidentId = state.presidentId;
      state.previousChancellorId = state.chancellorId;
      state.electionTracker = 0;
      pushEvent(state, {
        type: 'government-elected',
        presidentId: state.presidentId,
        chancellorId: state.chancellorId
      });

      const chancellor = state.players[state.chancellorId];
      if (chancellor && chancellor.role === 'android' && state.policies.sabotage >= TRACKER_LIMIT) {
        endGame(state, 'infiltrators', 'android-chancellor');
        return { ok: true, passed: true, winner: state.winner, winReason: state.winReason };
      }

      beginLegislative(state);
      return { ok: true, passed: true, phase: state.phase };
    }

    state.chancellorId = null;
    state.electionTracker += 1;

    if (state.electionTracker >= TRACKER_LIMIT) {
      const outcome = enactTopPolicy(state, 'tracker');
      if (outcome === 'game-over') {
        return { ok: true, passed: false, winner: state.winner, winReason: state.winReason };
      }
    }

    advancePresident(state);
    state.phase = 'nomination';
    return { ok: true, passed: false, phase: state.phase, electionTracker: state.electionTracker };
  }

  // ------------------------------------------------------------------- policies

  function reshuffleDiscards(state) {
    if (state.discards.length === 0) {
      return;
    }
    // Both piles are mixed together: the leftovers already in the deck must
    // never be dropped when the discard pile comes back into play.
    const combined = state.deck.concat(state.discards);
    state.deck = shuffle(state, combined);
    state.discards = [];
    pushEvent(state, { type: 'deck-reshuffled', deckCount: state.deck.length });
  }

  function beginLegislative(state) {
    if (state.deck.length < RESHUFFLE_THRESHOLD) {
      reshuffleDiscards(state);
    }
    state.presidentHand = state.deck.splice(0, 3);
    state.chancellorHand = [];
    state.phase = 'legislative-president';
    pushEvent(state, { type: 'legislative-session', deckCount: state.deck.length });
  }

  // Returns 'game-over' | 'power' | 'advance'.
  function enactPolicy(state, policy, source) {
    if (policy === 'crew') {
      state.policies.crew += 1;
    } else {
      state.policies.sabotage += 1;
    }

    pushEvent(state, { type: 'policy-enacted', policy: policy, source: source });

    if (policy === 'crew') {
      if (state.policies.crew >= CREW_WIN_POLICIES) {
        endGame(state, 'crew', 'policies');
        return 'game-over';
      }
      return 'advance';
    }

    if (state.policies.sabotage >= SABOTAGE_WIN_POLICIES) {
      endGame(state, 'infiltrators', 'policies');
      return 'game-over';
    }

    if (source !== 'legislation') {
      return 'advance';
    }

    const slot = state.policies.sabotage;
    const power = POWER_TABLE[state.playerCount][slot];
    if (power && power !== 'win') {
      state.pendingPower = power;
      state.phase = 'power';
      pushEvent(state, { type: 'power-granted', power: power });
      return 'power';
    }

    return 'advance';
  }

  function enactTopPolicy(state, source) {
    if (state.deck.length === 0) {
      reshuffleDiscards(state);
    }
    const policy = state.deck.shift();
    state.electionTracker = 0;
    return enactPolicy(state, policy, source);
  }

  function presidentDiscard(state, policyIndex) {
    if (state.phase !== 'legislative-president') {
      return fail('wrong-phase');
    }
    if (!isInteger(policyIndex) || policyIndex < 0 || policyIndex >= state.presidentHand.length) {
      return fail('invalid-index');
    }

    const discarded = state.presidentHand.splice(policyIndex, 1)[0];
    state.discards.push(discarded);
    state.chancellorHand = state.presidentHand.slice();
    state.presidentHand = [];
    state.phase = 'legislative-chancellor';
    if (isIsolated(state, state.chancellorId)) {
      // An isolated reparador lost the right to a secret hand: the two cards
      // the Capitán passed are shown to the whole table.
      pushEvent(state, { type: 'open-hand', chancellorId: state.chancellorId, cards: state.chancellorHand.slice() });
    }
    return { ok: true, discarded: discarded, chancellorHand: state.chancellorHand.slice() };
  }

  function chancellorDiscard(state, policyIndex) {
    if (state.phase !== 'legislative-chancellor') {
      return fail('wrong-phase');
    }
    if (!isInteger(policyIndex) || policyIndex < 0 || policyIndex >= state.chancellorHand.length) {
      return fail('invalid-index');
    }

    const enacted = state.chancellorHand.splice(policyIndex, 1)[0];
    const discarded = state.chancellorHand[0];
    state.chancellorHand = [];
    state.discards.push(discarded);
    if (isIsolated(state, state.chancellorId)) {
      pushEvent(state, { type: 'open-discard', chancellorId: state.chancellorId, discarded: discarded, enacted: enacted });
    }

    const outcome = enactPolicy(state, enacted, 'legislation');
    if (outcome === 'game-over') {
      return { ok: true, enacted: enacted, winner: state.winner, winReason: state.winReason };
    }
    if (outcome === 'power') {
      return { ok: true, enacted: enacted, pendingPower: state.pendingPower };
    }

    advancePresident(state);
    state.phase = 'nomination';
    return { ok: true, enacted: enacted, phase: state.phase };
  }

  function proposeVeto(state) {
    if (state.phase !== 'legislative-chancellor') {
      return fail('wrong-phase');
    }
    if (state.policies.sabotage < VETO_THRESHOLD) {
      return fail('veto-locked');
    }

    state.phase = 'veto-request';
    pushEvent(state, { type: 'veto-proposed', chancellorId: state.chancellorId });
    return { ok: true, phase: state.phase };
  }

  function answerVeto(state, accept) {
    if (state.phase !== 'veto-request') {
      return fail('wrong-phase');
    }
    if (typeof accept !== 'boolean') {
      return fail('invalid-answer');
    }

    if (!accept) {
      pushEvent(state, { type: 'veto-refused' });
      state.phase = 'legislative-chancellor';
      return { ok: true, accepted: false, phase: state.phase };
    }

    for (let i = 0; i < state.chancellorHand.length; i += 1) {
      state.discards.push(state.chancellorHand[i]);
    }
    state.chancellorHand = [];
    pushEvent(state, { type: 'veto-accepted' });

    state.electionTracker += 1;
    if (state.electionTracker >= TRACKER_LIMIT) {
      const outcome = enactTopPolicy(state, 'veto');
      if (outcome === 'game-over') {
        return { ok: true, accepted: true, winner: state.winner, winReason: state.winReason };
      }
    }

    advancePresident(state);
    state.phase = 'nomination';
    return { ok: true, accepted: true, phase: state.phase };
  }

  // -------------------------------------------------------------------- powers

  function usePower(state, action) {
    if (state.phase !== 'power') {
      return fail('wrong-phase');
    }
    const power = state.pendingPower;
    if (!power) {
      return fail('no-power');
    }

    const targetId = action && action.targetId;
    if (!isPlayer(state, targetId)) {
      return fail('unknown-player');
    }

    if (power === 'investigate') {
      const target = state.players[targetId];
      const party = target.role === 'infiltrator' || target.role === 'android' ? 'infiltrator' : 'crew';
      target.investigated = true;
      state.investigations.push({ byId: state.presidentId, targetId: targetId, party: party });
      pushEvent(state, { type: 'power-used', power: power, targetId: targetId });

      state.pendingPower = null;
      advancePresident(state);
      state.phase = 'nomination';
      return { ok: true, power: power, targetId: targetId, party: party };
    }

    if (power === 'special-election') {
      pushEvent(state, { type: 'power-used', power: power, targetId: targetId });
      state.resumeAfterId = state.presidentId;
      state.pendingPower = null;
      state.chancellorId = null;
      state.presidentId = targetId;
      state.phase = 'nomination';
      return { ok: true, power: power, targetId: targetId, phase: state.phase };
    }

    if (power === 'isolate') {
      if (targetId === state.presidentId) {
        return fail('cannot-isolate-self');
      }
      if (state.players[targetId].isolated) {
        return fail('already-isolated');
      }
      state.players[targetId].isolated = true;
      pushEvent(state, { type: 'player-isolated', playerId: targetId });
      state.pendingPower = null;

      if (state.players[targetId].role === 'android') {
        endGame(state, 'crew', 'android-isolated');
        return { ok: true, power: power, targetId: targetId, winner: state.winner, winReason: state.winReason };
      }

      advancePresident(state);
      state.phase = 'nomination';
      return { ok: true, power: power, targetId: targetId, phase: state.phase };
    }

    return fail('unknown-power');
  }

  function isolationTargetIds(state) {
    return playerIds(state).filter(function (id) {
      return id !== state.presidentId && !state.players[id].isolated;
    });
  }

  // --------------------------------------------------------------------- turns

  function advancePresident(state) {
    let origin = state.presidentId;
    if (state.resumeAfterId !== null) {
      origin = state.resumeAfterId;
      state.resumeAfterId = null;
    }
    state.presidentId = nextSeatAfter(state, origin);
    state.chancellorId = null;
  }

  function endGame(state, winner, reason) {
    state.phase = 'game-over';
    state.winner = winner;
    state.winReason = reason;
    pushEvent(state, { type: 'game-over', winner: winner, reason: reason });
  }

  // ---------------------------------------------------------------------- views

  function publicView(state) {
    return {
      phase: state.phase,
      playerCount: state.playerCount,
      players: state.players.map(function (player) {
        return {
          id: player.id,
          name: player.name,
          isolated: player.isolated,
          investigated: player.investigated
        };
      }),
      policies: { crew: state.policies.crew, sabotage: state.policies.sabotage },
      electionTracker: state.electionTracker,
      vetoUnlocked: state.policies.sabotage >= VETO_THRESHOLD,
      deckCount: state.deck.length,
      discardCount: state.discards.length,
      presidentId: state.presidentId,
      chancellorId: state.chancellorId,
      previousPresidentId: state.previousPresidentId,
      previousChancellorId: state.previousChancellorId,
      pendingPower: state.pendingPower,
      openHand:
        (state.phase === 'legislative-chancellor' || state.phase === 'veto-request') &&
        isIsolated(state, state.chancellorId)
          ? state.chancellorHand.slice()
          : null,
      isolationTargetIds: isolationTargetIds(state),
      eligibleChancellorIds: eligibleChancellorIds(state),
      lastVote: state.lastVote
        ? {
            passed: state.lastVote.passed,
            yes: state.lastVote.yes,
            no: state.lastVote.no,
            votes: state.lastVote.votes.slice()
          }
        : null,
      events: state.events.slice(),
      winner: state.winner,
      winReason: state.winReason
    };
  }

  function privateView(state, playerId) {
    const player = state.players[playerId];
    if (!player) {
      return null;
    }

    const role = roleFor(state, playerId);
    const hand = [];
    if (state.phase === 'legislative-president' && state.presidentId === playerId) {
      hand.push.apply(hand, state.presidentHand);
    }
    if (state.phase === 'legislative-chancellor' && state.chancellorId === playerId) {
      hand.push.apply(hand, state.chancellorHand);
    }

    return {
      playerId: playerId,
      role: role.role,
      allies: role.allies,
      hand: hand,
      isolated: player.isolated,
      canVeto:
        state.phase === 'legislative-chancellor' &&
        state.chancellorId === playerId &&
        state.policies.sabotage >= VETO_THRESHOLD,
      investigations: state.investigations.filter(function (entry) {
        return entry.byId === playerId;
      })
    };
  }

  return {
    PLAYER_COUNTS: PLAYER_COUNTS,
    POWER_TABLE: POWER_TABLE,
    TOTAL_POLICIES: TOTAL_POLICIES,
    CREW_WIN_POLICIES: CREW_WIN_POLICIES,
    SABOTAGE_WIN_POLICIES: SABOTAGE_WIN_POLICIES,
    VETO_THRESHOLD: VETO_THRESHOLD,
    TRACKER_LIMIT: TRACKER_LIMIT,
    createGame: createGame,
    roleFor: roleFor,
    publicView: publicView,
    privateView: privateView,
    eligibleChancellorIds: eligibleChancellorIds,
    isolationTargetIds: isolationTargetIds,
    nominateChancellor: nominateChancellor,
    castVotes: castVotes,
    presidentDiscard: presidentDiscard,
    chancellorDiscard: chancellorDiscard,
    proposeVeto: proposeVeto,
    answerVeto: answerVeto,
    usePower: usePower
  };
});
