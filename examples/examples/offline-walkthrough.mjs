#!/usr/bin/env node
// Offline teaching example. Invented products and prices, never Tesco data.
const products = [
  { name: 'Example porridge oats A', grams: 500, cents: 180 },
  { name: 'Example porridge oats B', grams: 1000, cents: 320 },
  { name: 'Example porridge oats C', grams: 750, cents: 270 }
];
export function compareByKg(rows) {
  return rows.map(row => {
    if (!Number.isSafeInteger(row.grams) || row.grams <= 0 || !Number.isSafeInteger(row.cents) || row.cents < 0) throw new Error('Positive whole grams and nonnegative whole cents are required');
    return { ...row, eurPerKg: row.cents * 10 / row.grams };
  }).sort((a, b) => a.eurPerKg - b.eurPerKg || a.cents - b.cents);
}
export function shoppingList(row, quantity) {
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Quantity must be a positive integer');
  return { item: row.name, quantity, packGrams: row.grams, exampleTotalCents: row.cents * quantity, purchased: false };
}
const ranked = compareByKg(products);
console.log('OFFLINE SYNTHETIC EXAMPLE. NOT TESCO PRODUCTS OR PRICES.');
console.log('1. Search example: porridge oats. No network request is made.');
for (const row of ranked) console.log(`${row.name} | ${row.grams} g | EUR ${(row.cents / 100).toFixed(2)} | EUR ${row.eurPerKg.toFixed(2)}/kg`);
console.log('2. Compare only equivalent products and the same unit.');
console.log('3. Draft shopping list, not a basket or order:');
console.log(JSON.stringify(shoppingList(ranked[0], 2), null, 2));
console.log('Live prices, stock, promotions, eligibility and delivery remain unverified.');
