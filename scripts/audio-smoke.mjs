import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { launchBrowser } from "./browser-launch.mjs";

/** Production graph rendered offline: no synthetic substitute or microphone. */
export async function runAudioSmoke(browser, base, path) {
  await mkdir(path, { recursive: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const probe = new URL("__audio-probe", base).href;
  await page.route(probe, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Offline audio probe</title>",
    }),
  );
  await page.goto(probe);
  try {
    const result = await page.evaluate(async (moduleURL) => {
      const { createCampaignAudioGraph, DEFAULT_AUDIO_MIX, AUDIO_VOICE_LIMIT } =
        await import(moduleURL);
      function measure(samples, sampleRate) {
        const size = 32768;
        const real = new Float64Array(size),
          imaginary = new Float64Array(size);
        const offset = Math.floor(sampleRate * 0.5);
        let energy = 0,
          peak = 0;
        for (let i = offset; i < samples.length; i++) {
          energy += samples[i] ** 2;
          peak = Math.max(peak, Math.abs(samples[i]));
        }
        for (let i = 0; i < size; i++)
          real[i] =
            samples[offset + i] *
            (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
        // Radix-2 FFT on a Hann-windowed settled segment.
        for (let i = 1, j = 0; i < size; i++) {
          let bit = size >> 1;
          for (; j & bit; bit >>= 1) j ^= bit;
          j ^= bit;
          if (i < j) [real[i], real[j]] = [real[j], real[i]];
        }
        for (let length = 2; length <= size; length <<= 1) {
          const angle = (-2 * Math.PI) / length;
          const cos = Math.cos(angle),
            sin = Math.sin(angle);
          for (let start = 0; start < size; start += length) {
            let wr = 1,
              wi = 0;
            for (let j = 0; j < length / 2; j++) {
              const a = start + j,
                b = a + length / 2;
              const vr = real[b] * wr - imaginary[b] * wi;
              const vi = real[b] * wi + imaginary[b] * wr;
              real[b] = real[a] - vr;
              imaginary[b] = imaginary[a] - vi;
              real[a] += vr;
              imaginary[a] += vi;
              [wr, wi] = [wr * cos - wi * sin, wr * sin + wi * cos];
            }
          }
        }
        let all = 0,
          high = 0;
        for (let i = 1; i < size / 2; i++) {
          const power = real[i] ** 2 + imaginary[i] ** 2;
          all += power;
          if ((i * sampleRate) / size > 300) high += power;
        }
        const rms = Math.sqrt(energy / (samples.length - offset));
        return {
          rms,
          dbfs: rms ? 20 * Math.log10(rms) : null,
          peak,
          above300Hz: all ? high / all : 0,
        };
      }
      const materials = [];
      for (const material of ["soil", "ice", "stone", "plate"]) {
        const offline = new OfflineAudioContext(1, 96000, 48000);
        const graph = createCampaignAudioGraph(offline);
        graph.machine({
          paused: false,
          drilling: true,
          thrusting: false,
          material,
        });
        const audio = await offline.startRendering();
        materials.push({
          material,
          ...measure(audio.getChannelData(0), audio.sampleRate),
        });
        graph.dispose();
      }
      const silent = new OfflineAudioContext(1, 96000, 48000);
      const mutedGraph = createCampaignAudioGraph(silent, {
        ...DEFAULT_AUDIO_MIX,
        sound: false,
      });
      mutedGraph.machine({ paused: false, drilling: true, thrusting: true });
      mutedGraph.cue("pickup", 4);
      const muted = measure(
        (await silent.startRendering()).getChannelData(0),
        48000,
      );
      mutedGraph.dispose();
      const cuePeaks = [];
      for (const cue of ["cut", "pickup", "warning"]) {
        const single = new OfflineAudioContext(1, 48000, 48000);
        const graph = createCampaignAudioGraph(single);
        graph.cue(cue, 4);
        const audio = await single.startRendering();
        const peak = Math.max(...Array.from(audio.getChannelData(0), Math.abs));
        cuePeaks.push({ cue, peak, dbfs: 20 * Math.log10(peak) });
        graph.dispose();
      }
      const burst = new OfflineAudioContext(1, 96000, 48000);
      const burstGraph = createCampaignAudioGraph(burst);
      const voices = [];
      for (const cue of [
        "cut",
        "pickup",
        "landing",
        "damage",
        "warning",
        "build",
        "purchase",
        "sale",
        "volatile",
        "rupture",
        "shelf",
        "powerdown",
        "travel",
        "discovery",
        "reserve",
      ]) {
        burstGraph.cue(cue, 4);
        voices.push(burstGraph.voiceCount);
      }
      const threshold = burstGraph.compressor.threshold.value;
      const ratio = burstGraph.compressor.ratio.value;
      const burstAudio = await burst.startRendering();
      const burstPeak = Math.max(
        ...Array.from(burstAudio.getChannelData(0), Math.abs),
      );
      burstGraph.dispose();
      return {
        materials,
        cuePeaks,
        muted,
        voices,
        voiceLimit: AUDIO_VOICE_LIMIT,
        threshold,
        ratio,
        burstPeak,
      };
    }, new URL("src/campaign/audio-graph.ts", base).href);
    await writeFile(`${path}/results.json`, JSON.stringify(result, null, 2));
    for (const material of result.materials) {
      assert.ok(
        material.dbfs >= -27 && material.dbfs <= -21,
        `${material.material}: ${material.dbfs.toFixed(2)} dBFS outside −24 ±3`,
      );
      assert.ok(
        material.above300Hz >= 0.4,
        `${material.material}: insufficient small-speaker energy`,
      );
      assert.ok(material.peak < 1, `${material.material}: audio clips`);
    }
    assert.equal(result.muted.rms, 0, "Mute renders digital silence");
    for (const cue of result.cuePeaks)
      assert.ok(
        cue.dbfs >= -13 && cue.dbfs <= -7,
        `${cue.cue}: ${cue.dbfs.toFixed(2)} dBFS peak outside −10 ±3`,
      );
    assert.ok(
      result.voices.every((voices) => voices <= 12),
      "Voice budget includes persistent sources",
    );
    assert.equal(result.voiceLimit, 12);
    assert.equal(result.threshold, -14);
    assert.equal(result.ratio, 6);
    assert.ok(result.burstPeak < 1, "Cue burst does not clip");
    console.log("PASS offline production audio: " + JSON.stringify(result));
    return result;
  } finally {
    await context.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const browser = await launchBrowser();
  try {
    await runAudioSmoke(
      browser,
      process.env.PREVIEW_URL || "http://127.0.0.1:5173/",
      process.env.AUDIO_ARTIFACTS || "artifacts/audio",
    );
  } finally {
    await browser.close();
  }
}
