import { describe, expect, it } from 'vitest';
import { nextComputerAction, type Controllers } from '../engine/ai';
import { DEFAULT_WORLD_SITUATION } from '../engine/data/worldSituation';
import { INTERDEPENDENCE_DAY } from '../engine/data/interdependenceDay';
import { apply, newGame, type GameState } from '../engine/game';
import type { WorldSituation } from '../engine/types';
import { commentOn, explainPhase, scoreboard, verdict, type Comment } from './commentary';

/** Let the computers play a whole game, commentating every move. */
function watch(ws: WorldSituation): { state: GameState; comments: Comment[] } {
  const controllers: Controllers = {
    combatants: Object.fromEntries(ws.combatants.map((id) => [id, { skill: 0.8 }])),
    gameMaster: true,
  };
  let state = newGame(ws);
  const comments: Comment[] = [];
  for (let i = 0; i < 3000; i++) {
    const action = nextComputerAction(state, controllers);
    if (!action) break;
    const next = apply(state, action).state;
    comments.push(...commentOn(state, action, next));
    state = next;
  }
  return { state, comments };
}

describe('the commentary on a watched game', () => {
  const { state, comments } = watch(DEFAULT_WORLD_SITUATION);
  const texts = comments.map((c) => c.text);

  it('says what every ball was aimed at, and what it did', () => {
    const lobs = comments.filter((c) => c.kind === 'lob');
    expect(lobs).toHaveLength(state.lobs.length);
    for (const c of lobs)
      expect(c.text).toMatch(/ lobs (one warhead|a jockstrap of \d+ warheads) from .+ at /);
    expect(comments.filter((c) => c.kind === 'outcome').length).toBeGreaterThanOrEqual(
      state.lobs.length,
    );
    // The raw "lobs a warhead from" log line is replaced, not repeated.
    expect(texts.filter((t) => / lobs a warhead from /.test(t))).toEqual([]);
  });

  it('never tells the outcome of a ball before it has landed', () => {
    lobsLoop: for (const [i, c] of comments.entries()) {
      if (c.kind !== 'lob') continue;
      const outcome = comments.slice(i + 1).find((x) => x.kind === 'outcome');
      if (!outcome) continue lobsLoop;
      expect(outcome.afterLobs).toBe(c.afterLobs + 1);
    }
  });

  it('explains each phase, says who leads, and why the winner won', () => {
    for (const phase of ['summit', 'play'] as const)
      expect(texts).toContain(explainPhase(phase, state));
    expect(comments.some((c) => c.kind === 'score' && / leads/.test(c.text))).toBe(true);
    const end = comments.at(-1);
    expect(end?.kind).toBe('end');
    expect(end?.text).toContain(verdict(state));
    expect(verdict(state)).toMatch(/wins/);
  });

  it('says what a team really holds when it talks at the summit', () => {
    const talk = comments.filter((c) => c.kind === 'talk' && c.text.includes('“'));
    expect(talk.length).toBeGreaterThan(0);
    expect(talk[0]?.text).toMatch(/In fact it holds \d+ warheads/);
  });

  it('explains what a pact means', () => {
    expect(texts.some((t) => /agree a humane-war pact: neither may aim at/.test(t))).toBe(true);
  });

  it('keeps a scoreboard with the leader marked', () => {
    const rows = scoreboard(state);
    expect(rows).toHaveLength(state.situation.combatants.length);
    const leaders = rows.filter((r) => r.leads);
    expect(leaders.map((r) => r.combatant)).toEqual([state.endstat.winner]);
    expect(rows[0]?.leads).toBe(true);
  });
});

describe('the commentary on Interdependence Day', () => {
  const { state, comments } = watch(INTERDEPENDENCE_DAY);

  it('runs from the World Situation to the verdict', () => {
    expect(state.phase).toBe('ended');
    expect(comments.at(-1)?.kind).toBe('end');
    expect(comments.filter((c) => c.kind === 'lob')).toHaveLength(state.lobs.length);
  });
});
