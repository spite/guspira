// The randomness behind label-click randomisation. Kept behind `setRandomSource` so a
// sketch using a seeded PRNG (seedrandom and friends) gets reproducible randomize clicks
// instead of two different sources of chance.

let source = Math.random;

export function setRandomSource(fn) {
  source = fn;
}

export const random = () => source();

export const randomInRange = (min, max) => min + source() * (max - min);

export const randomElement = (array) => array[Math.floor(source() * array.length)];

export const randomBool = (chance = 0.5) => source() < chance;

export function randomHexColor() {
  const channel = () =>
    Math.floor(source() * 256)
      .toString(16)
      .padStart(2, "0");
  return `#${channel()}${channel()}${channel()}`;
}
