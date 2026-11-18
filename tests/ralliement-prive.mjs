import assert from 'node:assert/strict';
import { view } from '../lib/match.mjs';
import { CendreSim as Sim } from '../public/game/sim.js';

const s = Sim.create();
const buildingType = Sim.BUILDINGS[1][1].id;
s.rubies[1] = 1000;
assert(Sim.construct(s, 1, buildingType, 'main_1'));
const building = s.slots[1].find((slot) => slot.occupe);
assert(building);

const baseRally = { x: 1234, y: 567 };
const buildingRally = { x: 1350, y: 650 };
assert(Sim.setRally(s, 1, { kind: 'setRally', buildingId: 'main_1', ...baseRally }));
assert(Sim.setRally(s, 1, { kind: 'setRally', buildingId: building.id, ...buildingRally }));

s.visible[0].fill(1);
const opponentView = view(s, 0);
assert.equal(Object.hasOwn(opponentView.bases[1], 'rally'), false);
assert(opponentView.slots[1].some((slot) => slot.id === building.id));
assert(opponentView.slots[1].every((slot) => !Object.hasOwn(slot, 'rally')));

s.visible[0].fill(0);
assert.equal(Object.hasOwn(view(s, 0).bases[1], 'rally'), false);

const ownerView = view(s, 1);
assert.deepEqual(ownerView.bases[1].rally, baseRally);
assert.deepEqual(ownerView.slots[1].find((slot) => slot.id === building.id)?.rally, buildingRally);
