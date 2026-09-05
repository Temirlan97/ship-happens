import { describe, it, expect, beforeEach } from 'vitest';
import { loadGame } from '../helpers/loadGame.js';
import { installFakeImage } from '../helpers/fakeImage.js';

let Game, PATH, ctx;

beforeEach(() => {
  Game = loadGame();
  PATH = Game.Path;
  PATH.relayout(1600, 1000);
  ctx = document.getElementById('gameCanvas').getContext('2d');
});

describe('PATH.drawBackground — no art loaded (flat-fill + procedural fallback)', () => {
  it('draws the whole scene (background, tiles, road trace, motes, board, product) without throwing', () => {
    expect(() => PATH.drawBackground(ctx)).not.toThrow();
  });

  it('is stable across repeated frames (motes/markers are built lazily once, then reused)', () => {
    PATH.drawBackground(ctx);
    expect(() => PATH.drawBackground(ctx)).not.toThrow();
  });
});

describe('PATH.drawBackground — real tile/prop art loaded', () => {
  beforeEach(async () => {
    installFakeImage();
    await new Promise((resolve) => Game.Assets.loadAll(resolve));
  });

  it('draws the seamless background image branch without throwing', () => {
    expect(() => PATH.drawBackground(ctx)).not.toThrow();
  });

  it('draws straight, corner, and decor-prop tiles (all real-art branches in drawGroundTiles) without throwing', () => {
    // A fresh relayout forces buildTileMap() to re-roll (and, with art
    // loaded, actually draw) every tile variant across the whole board —
    // straight horizontal/vertical path runs, the 4 corner turns, plain
    // floor, and the sparse decor-prop layer.
    PATH.relayout(1600, 1000);
    expect(() => PATH.drawBackground(ctx)).not.toThrow();
  });
});
