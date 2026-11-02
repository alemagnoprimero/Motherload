/** Browser-only instrumentation. No production internals or guessed display-object counts. */
export function installRenderProbe(options = {}) {
  const geometry = options.geometry !== false,
    fog = options.fog !== false;
  const realNow = performance.now.bind(performance);
  const frames = [];
  window.__renderProbe = { frames, blurredFog: null, lightMap: null };
  let current = {
    draws: 0,
    clipped: 0,
    triangles: 0,
    unsupported: 0,
    uploads: 0,
    subUploads: 0,
  };
  const reset = () => ({
    draws: 0,
    clipped: 0,
    triangles: 0,
    unsupported: 0,
    uploads: 0,
    subUploads: 0,
  });
  const area = (triangle, width, height) => {
    let polygon = triangle;
    for (const [axis, bound, greater] of [
      [0, 0, true],
      [0, width, false],
      [1, 0, true],
      [1, height, false],
    ]) {
      const clipped = [];
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i],
          b = polygon[(i + 1) % polygon.length];
        const insideA = greater ? a[axis] >= bound : a[axis] <= bound;
        const insideB = greater ? b[axis] >= bound : b[axis] <= bound;
        if (insideA) clipped.push(a);
        if (insideA !== insideB) {
          const fraction = (bound - a[axis]) / (b[axis] - a[axis]);
          clipped.push([
            a[0] + (b[0] - a[0]) * fraction,
            a[1] + (b[1] - a[1]) * fraction,
          ]);
        }
      }
      polygon = clipped;
    }
    return (
      Math.abs(
        polygon.reduce((sum, a, i) => {
          const b = polygon[(i + 1) % polygon.length];
          return sum + a[0] * b[1] - b[0] * a[1];
        }, 0),
      ) / 2
    );
  };
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
    const context = getContext.call(this, kind, ...args);
    if (!context || context.__renderMeasured) return context;
    if (/webgl/.test(kind)) {
      context.__renderMeasured = true;
      const gl = context,
        buffers = new Map();
      let arrayBuffer, position, framebuffer;
      const wrap = (name, callback) => {
        const original = gl[name];
        gl[name] = function (...parameters) {
          callback(...parameters);
          return original.apply(gl, parameters);
        };
      };
      wrap("bindBuffer", (target, buffer) => {
        if (target === gl.ARRAY_BUFFER) arrayBuffer = buffer;
      });
      wrap("bindFramebuffer", (_target, value) => {
        framebuffer = value;
      });
      // GL clear remains observable when Playwright replaces requestAnimationFrame
      // with its deterministic clock. Only the screen's colour clear ends a frame.
      wrap("clear", (mask) => {
        if (!framebuffer && mask & gl.COLOR_BUFFER_BIT) {
          if (current.draws) frames.push(current);
          if (frames.length > 120) frames.shift();
          current = reset();
        }
      });
      wrap("bufferData", (target, data) => {
        if (!geometry) return;
        if (target === gl.ARRAY_BUFFER && data?.buffer)
          buffers.set(
            arrayBuffer,
            new Uint8Array(
              data.buffer,
              data.byteOffset,
              data.byteLength,
            ).slice(),
          );
      });
      wrap("bufferSubData", (target, offset, data) => {
        if (!geometry) return;
        if (target !== gl.ARRAY_BUFFER || !data?.buffer) return;
        const source = new Uint8Array(
          data.buffer,
          data.byteOffset,
          data.byteLength,
        );
        if (offset === 0) buffers.set(arrayBuffer, source.slice());
        else {
          const old = buffers.get(arrayBuffer) || new Uint8Array(0),
            next = new Uint8Array(Math.max(old.length, offset + source.length));
          next.set(old);
          next.set(source, offset);
          buffers.set(arrayBuffer, next);
        }
      });
      wrap(
        "vertexAttribPointer",
        (_index, size, type, _normalized, stride, offset) => {
          if (size === 2 && type === gl.FLOAT && offset === 0)
            position = { buffer: arrayBuffer, stride: stride || 8 };
        },
      );
      wrap("texImage2D", () => {
        current.uploads++;
      });
      wrap("texSubImage2D", () => {
        current.subUploads++;
      });
      wrap("drawArrays", (mode, first, count) => {
        if (framebuffer) return;
        current.draws++;
        if (!geometry) return;
        const bytes = position && buffers.get(position.buffer);
        if (
          mode !== gl.TRIANGLES ||
          !bytes ||
          bytes.length < (first + count - 1) * position.stride + 8
        ) {
          current.unsupported++;
          return;
        }
        const view = new DataView(
          bytes.buffer,
          bytes.byteOffset,
          bytes.byteLength,
        );
        const vertex = (index) => [
          view.getFloat32(index * position.stride, true),
          view.getFloat32(index * position.stride + 4, true),
        ];
        for (let i = first; i + 2 < first + count; i += 3) {
          current.clipped += area(
            [vertex(i), vertex(i + 1), vertex(i + 2)],
            gl.drawingBufferWidth,
            gl.drawingBufferHeight,
          );
          current.triangles++;
        }
        current.pixels = gl.drawingBufferWidth * gl.drawingBufferHeight;
      });
      wrap("drawElements", () => {
        if (!framebuffer) {
          current.draws++;
          current.unsupported++;
        }
      });
    } else if (kind === "2d" && fog) {
      context.__renderMeasured = true;
      const draw = context.drawImage;
      context.drawImage = function (...parameters) {
        const result = draw.apply(this, parameters);
        if (
          this.filter?.startsWith("blur(") &&
          this.canvas.width > 50 &&
          this.canvas.height > 50
        ) {
          const copy = document.createElement("canvas");
          copy.width = this.canvas.width;
          copy.height = this.canvas.height;
          draw.call(getContext.call(copy, "2d"), this.canvas, 0, 0);
          window.__renderProbe.blurredFog = copy;
          window.__renderProbe.lightMap = this.canvas;
        }
        return result;
      };
    }
    return context;
  };
  const request = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) =>
    request((time) => {
      const start = realNow();
      callback(time);
      current.ms = realNow() - start;
    });
}

export function readRenderProbe() {
  const probe = window.__renderProbe,
    frames = probe.frames.slice(-5);
  const mean = (field) =>
    frames.length
      ? frames.reduce((sum, f) => sum + (f[field] || 0), 0) / frames.length
      : null;
  const maxAlphaStep = (source) => {
    if (!source) return null;
    const host = document.querySelector("#campaign-game");
    const canvas = document.createElement("canvas");
    canvas.width = Number(host.dataset.viewWidth);
    canvas.height = Number(host.dataset.viewHeight);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let maximum = 0;
    for (let y = 4; y < canvas.height - 4; y++)
      for (let x = 4; x < canvas.width - 4; x++) {
        const index = (y * canvas.width + x) * 4 + 3;
        maximum = Math.max(
          maximum,
          Math.abs(data[index] - data[index + 4]),
          Math.abs(data[index] - data[index + canvas.width * 4]),
        );
      }
    return maximum;
  };
  return {
    geometryFrames: frames.length,
    clippedOverdrawScreens: frames.length
      ? frames.reduce((sum, frame) => sum + frame.clipped / frame.pixels, 0) /
        frames.length
      : null,
    triangles: mean("triangles"),
    unsupportedDraws: mean("unsupported"),
    textureUploads: mean("uploads"),
    textureSubUploads: mean("subUploads"),
    fogBlurMaximumAlphaStep: maxAlphaStep(probe.blurredFog),
    lightMapMaximumAlphaStep: maxAlphaStep(probe.lightMap),
  };
}
