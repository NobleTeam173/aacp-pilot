// Zone world-space positions for the ACIA generic twin GLB (acia-generic-twin.glb).
// Coordinate system: Y-up, -Z nose/forward, -X port, +X starboard. Units: metres.
// Source: aircraft-delivery/hotspots.json (delivery package, 2026-10-29).
// Positions are model-space — do not scale the aircraft independently of these values.
export const ZONE_3D_POSITIONS: Record<string, [number, number, number]> = {
  nose:         [  0,     1.8,  -5.55 ],
  l_engine:     [ -2.65,  2.1,  -1.5  ],
  r_engine:     [  2.65,  2.1,  -1.5  ],
  l_wing_tip:   [ -6.9,   1.65,  0.15 ],
  r_wing_tip:   [  6.9,   1.65,  0.15 ],
  l_main_gear:  [ -2.85,  0.55,  0.22 ],
  r_main_gear:  [  2.85,  0.55,  0.22 ],
  nose_gear:    [  0,     0.55, -3.6  ],
  fuselage:     [  0.85,  2.05,  0.9  ],
  tail:         [  0,     3.5,   5.0  ],
  flap_l:       [ -3.8,   1.42,  1.5  ],
  flap_r:       [  3.8,   1.42,  1.5  ],
  pitot_tube:   [ -0.55,  2.2,  -4.9  ],
  static_port:  [ -0.88,  1.8,  -1.05 ],
  l_fuel_cap:   [ -4.1,   2.32,  0.05 ],
};
