import { describe, expect, it } from "vitest";
import { trimmedSourceCrop } from "../src/campaign/render/cave-crop";

const authored = { width: 1024, height: 384 };
const frame = {
  realWidth: 1024,
  realHeight: 384,
  x: 0,
  y: 100,
  cutWidth: 1024,
  cutHeight: 180,
};

describe("cave source crops", () => {
  it("intersects full-source coordinates with the atlas trim", () => {
    expect(
      trimmedSourceCrop(
        frame,
        { x: 40.5, y: 80, width: 100.25, height: 60 },
        authored,
      ),
    ).toEqual({ x: 40.5, y: 100, width: 100.25, height: 40 });
  });
  it("rejects empty trim intersections before Phaser samples page zero", () => {
    expect(
      trimmedSourceCrop(
        frame,
        { x: 0, y: 0, width: 100, height: 100 },
        authored,
      ),
    ).toBeUndefined();
    expect(
      trimmedSourceCrop(
        frame,
        { x: 0, y: 300, width: 100, height: 50 },
        authored,
      ),
    ).toBeUndefined();
  });
  it("uses the source density rather than the atlas page density", () => {
    const dense = Object.fromEntries(
      Object.entries(frame).map(([key, value]) => [key, value * 1.5]),
    ) as typeof frame;
    expect(
      trimmedSourceCrop(
        dense,
        { x: 40, y: 120, width: 100, height: 40 },
        authored,
      ),
    ).toEqual({ x: 60, y: 180, width: 150, height: 60 });
    expect(
      trimmedSourceCrop(
        frame,
        { x: 40, y: 120, width: 100, height: 40 },
        authored,
      ),
    ).toEqual({ x: 40, y: 120, width: 100, height: 40 });
  });
});
