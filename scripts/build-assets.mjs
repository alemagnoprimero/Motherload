import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const renderDirectory = resolve(root, ".cache/asset-renders");
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} exited with status ${result.status}`);
}

// Node orchestrates the offline build. Actual mesh creation, PBR materials,
// orthographic rendering and GLB export run in Blender, not in the game browser.
run(process.env.BLENDER_PATH || "blender", [
  "--background",
  "--factory-startup",
  "--python-exit-code",
  "1",
  "--python",
  "assets/source/render_assets.py",
  "--",
  "--output",
  renderDirectory,
  "--samples",
  process.env.ASSET_SAMPLES || "64",
]);
run(process.env.PYTHON_PATH || "python3", [
  "assets/source/pack_assets.py",
  renderDirectory,
  resolve(root, "assets/generated"),
]);
