import test from 'node:test';
import assert from 'node:assert/strict';
import { compareByKg, shoppingList } from '../examples/offline-walkthrough.mjs';
test('unit comparison normalizes grams to kg and orders ties by pack price', () => {
  const ranked = compareByKg([{ name:'A', grams:500, cents:180 },{ name:'B', grams:1000, cents:320 },{ name:'C', grams:750, cents:270 }]);
  assert.deepEqual(ranked.map(x=>x.name), ['B','A','C']);
  assert.equal(ranked[0].eurPerKg, 3.2);
  assert.equal(ranked[1].eurPerKg, 3.6);
});
test('invalid units fail rather than fabricate a comparable price', () => {
  for (const grams of [0,-1,0.5,NaN,'500']) assert.throws(()=>compareByKg([{name:'X',grams,cents:100}]));
});
test('draft list uses integer cents and never purchases', () => {
  const list=shoppingList({name:'Example',grams:1000,cents:320},2);
  assert.equal(list.exampleTotalCents,640); assert.equal(list.purchased,false);
  assert.throws(()=>shoppingList({name:'Example',grams:1000,cents:320},0));
});
