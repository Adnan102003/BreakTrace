import { startRoomBoard } from '../apps/demo/room-board';

const fixture = await startRoomBoard(4313, '.data/room-board-proof.txt');
console.log(`Room Board available at ${fixture.url}`);
