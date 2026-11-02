/** Shared physical constants: simulation and navigation must use the same costs. */
export const MOTION = {
  idleEnergy: 0.063,
  axisEnergy: 0.126,
  drillingEnergy: 0.252,
  massDivisor: 80,
  groundBase: 5,
  verticalBase: 6,
  verticalExponent: 0.75,
  groundMax: 10,
  verticalMax: 12,
} as const;

export function motionProfile(engine: number, cargoMass: number) {
  const power = engine / 150;
  const massFactor = 1 + Math.max(0, cargoMass) / MOTION.massDivisor;
  return {
    power,
    massFactor,
    groundSpeed: Math.min(
      MOTION.groundMax,
      MOTION.groundBase * Math.sqrt(power),
    ),
    verticalSpeed:
      Math.min(
        MOTION.verticalMax,
        MOTION.verticalBase * power ** MOTION.verticalExponent,
      ) / massFactor,
    movementEnergy: MOTION.axisEnergy * massFactor,
  };
}

export interface ReturnInput {
  x: number;
  y: number;
  dockX: number;
  width: number;
  engine: number;
  cargoMass: number;
  energy: number;
  cutRemaining?: number;
  cutEnergy?: number;
  cutEndY?: number;
  /** Geometry is checked by the caller; no drilling upward is assumed. */
  reachable?: boolean;
}

export function estimateReturnEnergy(input: ReturnInput) {
  const profile = motionProfile(input.engine, input.cargoMass);
  const rows = Math.max(0, (input.cutEndY ?? input.y) + 0.36);
  const wrapped =
    ((((input.dockX - input.x + input.width / 2) % input.width) + input.width) %
      input.width) -
    input.width / 2;
  // The bay accepts the entire illuminated parking zone, not a single pixel.
  const distance = Math.max(0, Math.abs(wrapped) - 1.5);
  const climb = rows > 0.01 ? rows / profile.verticalSpeed + 0.35 : 0;
  const drive = distance > 0 ? distance / profile.groundSpeed + 0.3 : 0;
  const cutRemaining = Math.max(0, input.cutRemaining ?? 0);
  const estimate =
    climb * (profile.movementEnergy + MOTION.idleEnergy) +
    drive * profile.movementEnergy +
    cutRemaining *
      ((input.cutEnergy ?? MOTION.drillingEnergy) + MOTION.idleEnergy);
  const margin = input.energy - estimate;
  const buffer = Math.max(
    1,
    cutRemaining *
      ((input.cutEnergy ?? MOTION.drillingEnergy) + MOTION.idleEnergy),
  );
  const reachable = input.reachable !== false;
  const state =
    !reachable || margin <= 0
      ? "stranded"
      : margin <= buffer
        ? "turn"
        : margin <= 2 * buffer
          ? "plan"
          : "ok";
  return { estimate, margin, buffer, state, reachable } as const;
}

export function cutDuration(input: {
  material: number;
  row: number;
  down: boolean;
  drill: number;
  worldId: string;
  augerId: string | null;
  precision?: boolean;
}) {
  const auger =
    input.material === 1
      ? input.worldId === "W02" && input.augerId === "W02-R1"
        ? 0.55
        : input.worldId === "W01" && input.augerId === "W01-R1"
          ? 0.9
          : 1
      : 1;
  return Math.max(
    0.25,
    ((input.down ? 1 : 0.75) *
      (input.material === 4 ? 2.5 : input.material === 2 ? 1.85 : 1) *
      Math.min(5, 1 + Math.max(0, input.row) / 80) *
      auger *
      (input.precision ? 1.35 : 1)) /
      (input.drill / 2),
  );
}
