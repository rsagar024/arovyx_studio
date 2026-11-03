/**
 * A bit-exact port of CPython's `random.Random` for the parts the jobs use:
 * seeding from a string (version 2: the bytes plus their SHA-512, as a big
 * integer), `getrandbits`, `_randbelow` and `shuffle`. Its state can be saved
 * as JSON, so a shuffle sequence continues across resumable steps exactly as
 * it would have in one Python process.
 *
 * `random.Random("2026-10-16").shuffle(...)` picks the daily quiz; the app
 * never runs this, but a re-run on the same date must pick the same
 * questions as before (see `__tests__/vectors.json`, made by the Python code).
 */
import "server-only";
import { createHash } from "node:crypto";

const N = 624;
const M = 397;
const MATRIX_A = 0x9908b0df;
const UPPER_MASK = 0x80000000;
const LOWER_MASK = 0x7fffffff;

export interface PyRandomState {
  mt: number[];
  mti: number;
}

export class PyRandom {
  private mt = new Array<number>(N).fill(0);
  private mti = N + 1;

  constructor(seed?: string | PyRandomState) {
    if (typeof seed === "string") this.seed(seed);
    else if (seed) this.setState(seed);
  }

  seed(text: string): void {
    const bytes = Buffer.from(text, "utf8");
    const digest = createHash("sha512").update(bytes).digest();
    let n = BigInt("0x" + Buffer.concat([bytes, digest]).toString("hex"));
    const key: number[] = [];
    while (n > 0n) {
      key.push(Number(n & 0xffffffffn));
      n >>= 32n;
    }
    if (key.length === 0) key.push(0);
    this.initByArray(key);
  }

  getState(): PyRandomState {
    return { mt: [...this.mt], mti: this.mti };
  }

  setState(state: PyRandomState): void {
    if (!Array.isArray(state.mt) || state.mt.length !== N) throw new Error("bad PyRandom state");
    this.mt = state.mt.map((x) => x >>> 0);
    this.mti = state.mti;
  }

  private initGenrand(s: number): void {
    const mt = this.mt;
    mt[0] = s >>> 0;
    for (let i = 1; i < N; i++) {
      const prev = mt[i - 1]!;
      mt[i] = (Math.imul(1812433253, prev ^ (prev >>> 30)) + i) >>> 0;
    }
    this.mti = N;
  }

  private initByArray(key: number[]): void {
    const mt = this.mt;
    this.initGenrand(19650218);
    let i = 1;
    let j = 0;
    for (let k = Math.max(N, key.length); k > 0; k--) {
      const prev = mt[i - 1]!;
      mt[i] = ((mt[i]! ^ Math.imul(prev ^ (prev >>> 30), 1664525)) + key[j]! + j) >>> 0;
      i++;
      j++;
      if (i >= N) {
        mt[0] = mt[N - 1]!;
        i = 1;
      }
      if (j >= key.length) j = 0;
    }
    for (let k = N - 1; k > 0; k--) {
      const prev = mt[i - 1]!;
      mt[i] = ((mt[i]! ^ Math.imul(prev ^ (prev >>> 30), 1566083941)) - i) >>> 0;
      i++;
      if (i >= N) {
        mt[0] = mt[N - 1]!;
        i = 1;
      }
    }
    mt[0] = 0x80000000;
  }

  private genrandUint32(): number {
    const mt = this.mt;
    if (this.mti >= N) {
      if (this.mti === N + 1) this.initGenrand(5489);
      let kk = 0;
      for (; kk < N - M; kk++) {
        const y = (mt[kk]! & UPPER_MASK) | (mt[kk + 1]! & LOWER_MASK);
        mt[kk] = (mt[kk + M]! ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0)) >>> 0;
      }
      for (; kk < N - 1; kk++) {
        const y = (mt[kk]! & UPPER_MASK) | (mt[kk + 1]! & LOWER_MASK);
        mt[kk] = (mt[kk + (M - N)]! ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0)) >>> 0;
      }
      const y = (mt[N - 1]! & UPPER_MASK) | (mt[0]! & LOWER_MASK);
      mt[N - 1] = (mt[M - 1]! ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0)) >>> 0;
      this.mti = 0;
    }
    let y = mt[this.mti++]!;
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  /** `getrandbits(k)` for 0 <= k <= 32. */
  getrandbits(k: number): number {
    if (k < 0 || k > 32) throw new Error("getrandbits supports 0..32 bits");
    if (k === 0) return 0;
    return this.genrandUint32() >>> (32 - k);
  }

  /** `_randbelow_with_getrandbits(n)`: uniform in [0, n). */
  randbelow(n: number): number {
    const k = n.toString(2).length; // n.bit_length() for n >= 1
    let r = this.getrandbits(k);
    while (r >= n) r = this.getrandbits(k);
    return r;
  }

  /** `shuffle(x)`, in place. */
  shuffle<T>(x: T[]): void {
    for (let i = x.length - 1; i > 0; i--) {
      const j = this.randbelow(i + 1);
      const tmp = x[i]!;
      x[i] = x[j]!;
      x[j] = tmp;
    }
  }
}
