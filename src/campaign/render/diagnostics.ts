import Phaser from "phaser";
/** Counts actual GL draw submissions, including masks, rather than estimating from sprites. */
export class RenderDiagnostics {
  drawCalls: number | undefined;
  frameMilliseconds = 0;
  private restore?: () => void;
  private stopTiming: () => void;
  constructor(
    scene: Phaser.Scene,
    onFrame?: (milliseconds: number, dt: number) => void,
  ) {
    let started: number | undefined;
    const start = () => {
      started = performance.now();
    };
    const finish = (_renderer: unknown, _time: number, delta: number) => {
      if (started === undefined) return;
      this.frameMilliseconds = performance.now() - started;
      onFrame?.(this.frameMilliseconds, delta / 1000);
      started = undefined;
    };
    scene.game.events.on("prestep", start);
    scene.game.events.on("postrender", finish);
    this.stopTiming = () => {
      scene.game.events.off("prestep", start);
      scene.game.events.off("postrender", finish);
    };
    if (scene.game.renderer.type !== Phaser.WEBGL) return;
    const gl = (scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).gl;
    const arrays = gl.drawArrays,
      elements = gl.drawElements;
    let current = 0;
    gl.drawArrays = function (mode, first, count) {
      current++;
      arrays.call(gl, mode, first, count);
    };
    gl.drawElements = function (mode, count, type, offset) {
      current++;
      elements.call(gl, mode, count, type, offset);
    };
    const before = () => {
      current = 0;
    };
    const after = () => {
      this.drawCalls = current;
    };
    scene.game.events.on("prerender", before);
    scene.game.events.on("postrender", after);
    this.restore = () => {
      gl.drawArrays = arrays;
      gl.drawElements = elements;
      scene.game.events.off("prerender", before);
      scene.game.events.off("postrender", after);
    };
  }
  destroy() {
    this.stopTiming();
    this.restore?.();
  }
}
