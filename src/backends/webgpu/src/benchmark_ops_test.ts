/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */

import * as tf from './index';
import { Tensor } from '@tensorflow/tfjs-core';

describe('Ops benchmarks', () => {
  beforeEach(async () => {
    await tf.ready;
  });

  // Performs `trials` trials, of `reps` repetitions each. At the end of each
  // trial, endTrial() is run (and included in the benchmark time). This allows
  // the cost of endTrial() to be amortized across the many iterations. This is
  // needed in particular because WebGPU readbacks are asynchronous and
  // therefore always incur latency.
  // (Plus, in Chrome right now, readbacks are very inefficient, making the
  // problem way worse.)
  // Readbacks could be avoided by using fences, but we don't have a common
  // abstraction over WebGL and WebGPU fences at the moment.
  async function time(
      trials: number, reps: number, doRep: () => Tensor[],
      endTrial: () => Promise<void>) {
    const times = [];

    let toDispose: Tensor[] = [];
    const dispose = () => {
      for (const t of toDispose) {
        t.dispose();
      }
      toDispose = [];
    };

    const trial = () => {
      for (let r = 0; r < reps; ++r) {
        toDispose = toDispose.concat(doRep());
      }
      return endTrial();
    };

    // Warm-up. Specifically, this pre-allocates enough memory for an entire
    // trial, ensuring that no allocations happen when timing a trial (if the
    // backend reuses allocations).
    await trial();
    dispose();

    for (let t = 0; t < trials; ++t) {
      const start = performance.now();
      await trial();
      times.push(performance.now() - start);
      dispose();
    }

    const mean = times.reduce((a, b) => a + b, 0) / trials;
    const min = Math.min(...times);
    const fmt = (n: number) => n.toFixed(3);
    console.log(`Mean time: ${fmt(mean)} ms -> ${fmt(mean / reps)} / rep`);
    console.log(`Min time: ${fmt(min)} ms -> ${fmt(min / reps)} / rep`);
  }

  xit('matMul', async () => {
    let a = tf.randomNormal([500, 500]);
    const b = tf.randomNormal([500, 500]);

    await time(5, 50, () => {
      const c = tf.matMul(a, b);
      const toDispose = a;
      a = c;
      return [toDispose];
    }, async () => {
      await a.data();
    });
  }, 60000);
});
