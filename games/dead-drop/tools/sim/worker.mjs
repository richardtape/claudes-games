// Worker thread: plays one batch of matches per message.
import { parentPort } from 'node:worker_threads';
import { playBatch } from './play.mjs';

parentPort.on('message', ({ id, config, start, count }) => {
  const { stats, rounds } = playBatch(config, start, count);
  parentPort.postMessage({ id, stats, rounds });
});
