// Zone 3D world-space positions — split into own file so AircraftInspection.tsx
// can reference them without eagerly loading the Three.js bundle.
export const ZONE_3D_POSITIONS: Record<string, [number, number, number]> = {
  nose:         [-1.15,  0.08,  0    ],
  l_engine:     [ 0.05, -0.06, -0.88 ],
  r_engine:     [ 0.05, -0.06,  0.88 ],
  l_wing_tip:   [ 0.42,  0.02, -2.0  ],
  r_wing_tip:   [ 0.42,  0.02,  2.0  ],
  l_main_gear:  [ 0.15, -0.38, -0.72 ],
  r_main_gear:  [ 0.15, -0.38,  0.72 ],
  nose_gear:    [-0.88, -0.38,  0    ],
  fuselage:     [ 0.1,   0.18,  0    ],
  tail:         [ 1.05,  0.08,  0    ],
  flap_l:       [ 0.26, -0.04, -1.02 ],
  flap_r:       [ 0.26, -0.04,  1.02 ],
  pitot_tube:   [-1.02,  0.1,  -0.18 ],
  static_port:  [-0.5,  -0.02,  0.2  ],
  l_fuel_cap:   [ 0.22,  0.02, -1.4  ],
};
