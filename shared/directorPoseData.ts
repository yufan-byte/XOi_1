// 原生白模人物姿势参数，沿用已部署引擎的动作相位与骨骼偏移。
export const DIRECTOR_POSE_DATA: Record<string, { poseTime:number; rigRoot:number[]; joints:Record<string,number[]>; continuousMotion:boolean }> = {
  "idle": {
    "poseTime": 0.08,
    "rigRoot": [
      0,
      0,
      0
    ],
    "joints": {},
    "continuousMotion": true
  },
  "stand_relaxed": {
    "poseTime": 0.34,
    "rigRoot": [
      0,
      0,
      0
    ],
    "joints": {},
    "continuousMotion": false
  },
  "crouch": {
    "poseTime": 0.35,
    "rigRoot": [
      0,
      0,
      0
    ],
    "joints": {
      "mixamorigHips": [
        0.15999975585937498,
        0.5600009765625,
        0
      ],
      "mixamorigLeftArm": [
        -0.028795619342473648,
        0.0654006934588603,
        0.8292728085902578
      ],
      "mixamorigLeftForeArm": [
        -0.23693435795237683,
        0.7345475293283817,
        -0.09104921258987955
      ],
      "mixamorigRightArm": [
        0.5320855359101243,
        -0.04121568060743169,
        -1.0485423770422415
      ],
      "mixamorigRightForeArm": [
        -1.571495050705541,
        -0.7134423981800843,
        0.49837097373972183
      ],
      "mixamorigLeftUpLeg": [
        0.06720266777357443,
        0.0008666212988651557,
        0.021644085969670334
      ],
      "mixamorigLeftLeg": [
        -0.5026470079344459,
        -0.07883219504212054,
        0.19778112801005593
      ],
      "mixamorigRightUpLeg": [
        -0.0762500839830151,
        0.0008858648924058381,
        0.0046341416750831504
      ],
      "mixamorigRightLeg": [
        -0.06990935634120955,
        0.0465205178623685,
        -0.2503830334239903
      ]
    },
    "continuousMotion": false
  },
  "sit": {
    "poseTime": 1,
    "rigRoot": [
      0,
      0,
      0
    ],
    "joints": {},
    "continuousMotion": false
  },
  "walk": {
    "poseTime": 0.24,
    "rigRoot": [
      0,
      0,
      0
    ],
    "joints": {},
    "continuousMotion": true
  },
  "run": {
    "poseTime": 0.24,
    "rigRoot": [
      0,
      0,
      0
    ],
    "joints": {},
    "continuousMotion": true
  },
  "wave": {
    "poseTime": 0.48,
    "rigRoot": [
      0,
      0,
      0
    ],
    "joints": {},
    "continuousMotion": true
  },
  "sad_pose": {
    "poseTime": 1,
    "rigRoot": [
      0,
      0,
      0
    ],
    "joints": {},
    "continuousMotion": false
  }
};
