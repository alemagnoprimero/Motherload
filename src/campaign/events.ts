export interface SaleLine {
  itemId: string;
  name: string;
  count: number;
  value: number;
}
export interface SaleReceipt {
  total: number;
  creditsBefore: number;
  creditsAfter: number;
  packages: number;
  lines: SaleLine[];
}
interface EventBase {
  worldId: string;
  x: number;
  y: number;
  at: number;
}
export type CampaignEvent = EventBase &
  (
    | {
        type: "interaction";
        action: "cut-start" | "footing" | "hold-full";
        direction?: "left" | "right" | "down";
      }
    | {
        type: "cut";
        material: "soil" | "ice" | "stone" | "plate";
        direction: "left" | "right" | "down";
      }
    | {
        type: "pickup";
        itemId: string;
        name: string;
        tier: number;
        relic: boolean;
        value: number;
      }
    | { type: "landing"; speed: number }
    | { type: "damage"; amount: number; cause: string }
    | {
        type: "volatile";
        phase: "warning" | "preserved" | "ruptured";
        duration?: number;
      }
    | { type: "shelf" | "pressure"; phase: "warning" | "burst"; id: string }
    | {
        type: "mission";
        id: string;
        phase: "surveyed" | "collected" | "banked";
      }
    | { type: "sale"; receipt: SaleReceipt }
    | { type: "install"; id: string }
    | { type: "construction"; milestone: number }
    | { type: "travel"; destination: string }
    | { type: "reserve"; amount: number }
    | {
        type: "discovery";
        id: string;
        name: string;
        kind: "site" | "log" | "cache" | "anomaly" | "hollow" | "contract";
      }
    | { type: "disabled"; cause: "energy" | "hull" }
  );
export type CampaignEventPayload = CampaignEvent extends infer E
  ? E extends EventBase
    ? Omit<E, keyof EventBase>
    : never
  : never;
