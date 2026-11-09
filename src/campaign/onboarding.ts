export interface CoachContext {
  mined: number;
  cargo: number;
  atDock: boolean;
  banked: number;
  credits: number;
  milestone: number;
  energyRatio: number;
  upgraded: boolean;
  row: number;
}
const COACH = [
  "Hold Down to drill.",
  "Collect the marked seam.",
  "Hold Up. Return home.",
  "Enter the illuminated bay.",
  "Unload and sell cargo.",
  "Fund the first construction.",
  "Refuel before heading out.",
  "Follow seam B's marker.",
  "Fill your hold again.",
  "Return and sell again.",
  "Install the larger tank.",
  "Keep a return reserve.",
] as const;
/** Pure, ordered guide. UI stores the cursor in pilot preferences, never the campaign. */
export function coachStep(context: CoachContext, cursor: number) {
  const done = [
    context.mined > 0,
    context.cargo >= 7,
    context.row < 0,
    context.atDock,
    context.banked >= 3,
    context.milestone >= 1,
    context.energyRatio >= 0.95 && context.milestone >= 1,
    context.row >= 0 && context.milestone >= 1,
    context.cargo >= 7,
    context.atDock && context.credits >= 6000,
    context.upgraded,
    context.upgraded && !context.atDock,
  ];
  const index = Math.max(0, Math.min(COACH.length, cursor));
  return {
    index,
    text: COACH[index] ?? "",
    complete: index >= COACH.length,
    next: index < COACH.length && done[index] ? index + 1 : index,
  };
}
