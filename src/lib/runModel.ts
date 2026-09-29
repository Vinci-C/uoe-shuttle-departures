import weights from "../data/modelWeights.json";

type WeightsJSON = {
  net_0_weight: number[][];   // [16][61]
  net_0_bias: number[];       // [16]
  net_3_weight: number[][];   // [32][16]
  net_3_bias: number[];       // [32]
  net_6_weight: number[][];   // [32][32]
  net_6_bias: number[];       // [32]
  net_9_weight: number[][];   // [16][32]
  net_9_bias: number[];       // [16]
  net_11_weight: number[][];  // [1][16]
  net_11_bias: number[];      // [1]
};

const w = weights as unknown as WeightsJSON;

export type BusynessLevel = 0 | 1 | 2 | 3 | 4;

// All 54 shuttle bus times in the exact order the model expects
// (indices 2..55 in the 61-dim feature vector)
const BUS_TIME_FEATURES = [
  "08:18", "08:35", "08:38",
  "09:05", "09:08", "09:33", "09:35", "09:53", "09:55",
  "10:13", "10:15", "10:33", "10:35", "10:53", "10:55",
  "11:13", "11:15", "11:33", "11:35", "11:53", "11:55",
  "12:13", "12:15", "12:33", "12:35", "12:53", "12:55",
  "13:13", "13:15", "13:33", "13:35", "13:53", "13:55",
  "14:13", "14:15", "14:33", "14:35", "14:53", "14:55",
  "15:13", "15:15", "15:33", "15:35", "15:53", "15:55",
  "16:23", "16:25", "16:53", "16:55",
  "17:23", "17:25", "17:53", "17:55",
  "18:25",
];

const busTimeIndex: Record<string, number> = {};
for (let i = 0; i < BUS_TIME_FEATURES.length; i++) {
  busTimeIndex[BUS_TIME_FEATURES[i]] = i + 2;
}

interface PredictParams {
  temperatureF: number;
  isRaining: 0 | 1 | 2;
  busTime: string;
  dayOfWeek: number;
  isBristoSquare: boolean;
  isKingsBuildings: boolean;
  revisionOrFlexibleWeek: boolean;
  weekOfSemester: number;
}

function encodeFeatures(params: PredictParams): Float64Array {
  const f = new Float64Array(61);

  f[0] = params.temperatureF;
  f[1] = params.isRaining;

  const idx = busTimeIndex[params.busTime];
  if (idx !== undefined) {
    f[idx] = 1;
  }

  f[56] = params.dayOfWeek;
  f[57] = params.isBristoSquare ? 1 : 0;
  f[58] = params.isKingsBuildings ? 1 : 0;
  f[59] = params.revisionOrFlexibleWeek ? 1 : 0;
  f[60] = params.weekOfSemester;

  return f;
}

function matMulVec(mat: number[][], vec: Float64Array): number[] {
  const out: number[] = [];
  for (let row = 0; row < mat.length; row++) {
    let sum = 0;
    const r = mat[row];
    for (let col = 0; col < r.length; col++) {
      sum += r[col] * vec[col];
    }
    out.push(sum);
  }
  return out;
}

function matMulVecArray(mat: number[][], vec: number[]): number[] {
  const out: number[] = [];
  for (let row = 0; row < mat.length; row++) {
    let sum = 0;
    const r = mat[row];
    for (let col = 0; col < r.length; col++) {
      sum += r[col] * vec[col];
    }
    out.push(sum);
  }
  return out;
}

function addBias(v: number[], bias: number[]): number[] {
  for (let i = 0; i < v.length; i++) {
    v[i] = v[i] + bias[i];
  }
  return v;
}

function applyReLU(v: number[]): number[] {
  for (let i = 0; i < v.length; i++) {
    v[i] = v[i] > 0 ? v[i] : 0;
  }
  return v;
}

function forwardPass(input: Float64Array): number {
  let h: number[];

  // Layer 0: Linear(61→16) + ReLU
  h = matMulVec(w.net_0_weight, input);
  h = addBias(h, w.net_0_bias);
  h = applyReLU(h);

  // Layer 3: Linear(16→32) + ReLU
  h = matMulVecArray(w.net_3_weight, h);
  h = addBias(h, w.net_3_bias);
  h = applyReLU(h);

  // Layer 6: Linear(32→32) + ReLU
  h = matMulVecArray(w.net_6_weight, h);
  h = addBias(h, w.net_6_bias);
  h = applyReLU(h);

  // Layer 9: Linear(32→16) + ReLU
  h = matMulVecArray(w.net_9_weight, h);
  h = addBias(h, w.net_9_bias);
  h = applyReLU(h);

  // Layer 11: Linear(16→1) — no activation (regression output)
  h = matMulVecArray(w.net_11_weight, h);
  h = addBias(h, w.net_11_bias);

  return h[0];
}

function ridershipToBusyness(ridership: number): BusynessLevel {
  if (ridership <= 40) return 1;
  if (ridership <= 60) return 2;
  if (ridership <= 70) return 3;
  return 4;
}

export function predict(params: PredictParams): number {
  const input = encodeFeatures(params);
  const ridership = forwardPass(input);
  return ridership;
}

export function predictBusyness(params: PredictParams): BusynessLevel {
  return ridershipToBusyness(predict(params));
}
