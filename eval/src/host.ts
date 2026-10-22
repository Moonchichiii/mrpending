import { readFile, readdir } from 'node:fs/promises';
import { cpus, freemem, totalmem } from 'node:os';
import { loaded, unload } from '@pending/agent';
import type { Infer } from '@pending/agent';

const MIB = 1024 * 1024;

export const hardware = () => ({
  cpu: cpus()[0]?.model ?? 'unknown',
  threads: cpus().length,
  totalMiB: Math.round(totalmem() / MIB),
});

export const freeMiB = (): number => Math.round(freemem() / MIB);

// VS Code and a browser must be open while measuring, so the headroom is the one the recording machine has.
export async function desktop() {
  const comms = await Promise.all(
    (await readdir('/proc'))
      .filter((d) => /^\d+$/.test(d))
      .map((pid) => readFile(`/proc/${pid}/comm`, 'utf8').catch(() => '')),
  );
  const running = new Set(comms.map((c) => c.trim()));
  return {
    vscode: running.has('code'),
    browser: ['firefox', 'firefox-esr', 'chrome', 'chromium'].some((b) => running.has(b)),
  };
}

// Samples available memory after every call; the minimum is the headroom the run left.
export function sampled(infer: Infer, mem: { minFreeMiB: number }): Infer {
  return async (call, signal) => {
    const reply = await infer(call, signal);
    mem.minFreeMiB = Math.min(mem.minFreeMiB, freeMiB());
    return reply;
  };
}

// `ollama stop` and then an empty `ollama ps`: the next model loads alone.
export async function unloadAndConfirm(url: string, model: string): Promise<boolean> {
  await unload(url, model);
  for (let i = 0; i < 30; i += 1) {
    if ((await loaded(url)).length === 0) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}
