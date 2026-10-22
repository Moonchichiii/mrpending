// Gemma spike (issue #8): one model, one prompt version, the five scenarios, one model loaded at a time.
//   bun run eval/src/spike.ts --model gemma4:e2b --prompt v1            native Ollama loop, experiments A/B and C
//   bun run eval/src/spike.ts --model gemma4:e2b --prompt v2 --mastra   what Mastra sends to Ollama, design only
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { cpus, freemem, totalmem } from 'node:os';
import { parseArgs } from 'node:util';
import {
  EVAL_REPAIRS,
  LOCAL_CALL_TIMEOUT_MS,
  PROMPT_VERSIONS,
  SETTINGS,
  designPrompt,
  inspectCompatRequest,
  instructions,
  loaded,
  mastraInfer,
  ollamaInfer,
  parseEnv,
  pendingAgent,
  provenance,
  runBuild,
  unload,
} from '@pending/agent';
import type { Infer, PromptVersion } from '@pending/agent';
import { BlueprintPartial, DesignReply, Form } from '@pending/contract';
import { gate, recorded, summarize } from './metrics';
import type { ScenarioRun, Summary } from './metrics';
import { capturingProxy } from './proxy';

// No 12B without a measured reason and the maintainer's approval.
const MODELS = ['gemma4:e2b', 'gemma4:e4b'] as const;
const ROOT = new URL('../', import.meta.url);
const MIB = 1024 * 1024;

const say = (line: string) => process.stdout.write(`${line}\n`);
const isModel = (m: string | undefined): m is (typeof MODELS)[number] => MODELS.some((x) => x === m);
const isPrompt = (p: string | undefined): p is PromptVersion => PROMPT_VERSIONS.some((x) => x === p);

async function scenarios(): Promise<[string, Form][]> {
  const raw: unknown = JSON.parse(await readFile(new URL('scenarios.json', ROOT), 'utf8'));
  if (typeof raw !== 'object' || raw === null) throw new Error('scenarios.json is not an object');
  return Object.entries(raw).map(([id, form]) => {
    if (!/^[a-z]{1,16}$/.test(id)) throw new Error(`scenario id ${id} is not a short lowercase word`);
    return [id, Form.parse(form)];
  });
}

// VS Code and a browser must be open while measuring, so the headroom is the one the recording machine has.
async function desktop() {
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
function sampled(infer: Infer, mem: { minFreeMiB: number }): Infer {
  return async (call, signal) => {
    const reply = await infer(call, signal);
    mem.minFreeMiB = Math.min(mem.minFreeMiB, Math.round(freemem() / MIB));
    return reply;
  };
}

async function unloadAndConfirm(url: string, model: string): Promise<boolean> {
  await unload(url, model);
  for (let i = 0; i < 30; i += 1) {
    if ((await loaded(url)).length === 0) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function mastraCheck(url: string, model: string, version: PromptVersion, forms: [string, Form][]) {
  const proxy = await capturingProxy(url);
  const agent = pendingAgent(version, {
    providerId: 'ollama',
    modelId: model,
    url: proxy.url,
    apiKey: 'ollama',
  });
  const results = [];
  for (const [scenario, form] of forms) {
    let partials = 0;
    let partialsParsing = 0;
    const infer = mastraInfer(agent, (partial) => {
      partials += 1;
      const blueprint =
        typeof partial === 'object' && partial !== null && 'blueprint' in partial ? partial.blueprint : {};
      if (BlueprintPartial.safeParse(blueprint).success) partialsParsing += 1;
    });
    const sent = proxy.bodies.length;
    try {
      const reply = await infer(
        { kind: 'design', system: instructions(version), prompt: designPrompt(form) },
        AbortSignal.timeout(LOCAL_CALL_TIMEOUT_MS),
      );
      const parsed = DesignReply.safeParse(reply.value);
      results.push({
        scenario,
        partials,
        partialsParsing,
        objectParses: parsed.success,
        timing: reply.timing,
      });
    } catch (error) {
      results.push({
        scenario,
        partials,
        partialsParsing,
        objectParses: false,
        error: String(error).slice(0, 300),
      });
    }
    const body = proxy.bodies[sent];
    if (body !== undefined)
      Object.assign(results[results.length - 1] ?? {}, { request: inspectCompatRequest(body, 'design') });
  }
  proxy.close();
  return results;
}

function markdown(title: string, s: Summary, verdict: ReturnType<typeof gate>): string {
  const pct = ({ hits, n }: { hits: number; n: number }) => `${hits}/${n}`;
  const row = (name: string, l: Summary['latency']['design']) =>
    `| ${name} | ${l.wallMs.n} | ${l.wallMs.p50?.toFixed(0) ?? '-'} | ${l.wallMs.p95?.toFixed(0) ?? '-'} | ${l.warmMs.p95?.toFixed(0) ?? '-'} | ${l.promptMs.p50?.toFixed(0) ?? '-'} | ${l.evalMs.p50?.toFixed(0) ?? '-'} | ${l.evalTokens.p50 ?? '-'} |`;
  return [
    `# ${title}`,
    '',
    `Schema-valid design replies ${pct(s.schema.designReplies)}, repair replies ${pct(s.schema.repairReplies)}; scenarios designed ${pct(s.schema.scenariosDesigned)}.`,
    `Catalogue-valid first time ${pct(s.catalogue.firstTime)}, within the repair budget ${pct(s.catalogue.withinBudget)}; violation kinds ${JSON.stringify(s.catalogue.violationKinds)}.`,
    `Simulated failures ${s.simulator.simulatedFailures}; outcome-changing repairs ${s.simulator.outcomeChangingRepairs}; pressed ${s.simulator.pressed}/${s.simulator.scenarios.length}.`,
    `Cold load ${s.latency.coldLoadMs?.toFixed(0) ?? '-'} ms.`,
    '',
    '| call | n | wall p50 ms | wall p95 ms | warm p95 ms | prompt p50 ms | eval p50 ms | eval tokens p50 |',
    '|---|---|---|---|---|---|---|---|',
    row('design', s.latency.design),
    row('repair', s.latency.repair),
    '',
    '| scenario | end | attempts (outcome@failedAt, handovers) |',
    '|---|---|---|',
    ...s.simulator.scenarios.map(
      (sc) =>
        `| ${sc.scenario} | ${sc.end} | ${sc.attempts.map((a) => `${a.outcome}${a.failedAt === undefined ? '' : `@${a.failedAt}`} h${a.handovers}`).join(' → ')} |`,
    ),
    '',
    `GO checks: ${JSON.stringify(verdict)}`,
    '',
  ].join('\n');
}

async function main() {
  const { values } = parseArgs({
    options: { model: { type: 'string' }, prompt: { type: 'string' }, mastra: { type: 'boolean' } },
  });
  // The spike measures local inference only and serves no page, so those two settings are fixed here.
  const env = parseEnv({ ...process.env, INFERENCE_MODE: 'local', WEB_ORIGIN: 'http://127.0.0.1:5173' });
  if (!isModel(values.model)) throw new Error(`--model must be one of ${MODELS.join(', ')}`);
  if (!isPrompt(values.prompt)) throw new Error(`--prompt must be one of ${PROMPT_VERSIONS.join(', ')}`);
  const model = values.model;
  const version = values.prompt;
  const url = env.OLLAMA_URL;

  const before = await loaded(url);
  if (before.length > 0)
    throw new Error(
      `a model is already loaded (${before.map((m) => m.name).join(', ')}); ollama stop it first`,
    );
  const prov = await provenance(url, model);
  const forms = await scenarios();
  const context = {
    model,
    promptVersion: version,
    settings: { ...SETTINGS, think: false, repairs: EVAL_REPAIRS, callTimeoutMs: LOCAL_CALL_TIMEOUT_MS },
    provenance: prov,
    hardware: {
      cpu: cpus()[0]?.model ?? 'unknown',
      threads: cpus().length,
      totalMiB: Math.round(totalmem() / MIB),
    },
    desktop: await desktop(),
    startedAt: new Date().toISOString(),
  };
  const stem = `${context.startedAt.slice(0, 10)}-${model.replace(':', '-')}-${version}${values.mastra === true ? '-mastra' : ''}`;
  await mkdir(new URL('results/', ROOT), { recursive: true });

  if (values.mastra === true) {
    const mastra = await mastraCheck(url, model, version, forms).finally(() => unload(url, model));
    const unloaded = await unloadAndConfirm(url, model);
    await writeFile(
      new URL(`results/${stem}.json`, ROOT),
      `${JSON.stringify({ ...context, mastra, unloaded }, null, 2)}\n`,
    );
    say(`wrote results/${stem}.json`);
    return;
  }

  const mem = { minFreeMiB: Math.round(freemem() / MIB) };
  const infer = sampled(ollamaInfer(url, model), mem);
  const runs: ScenarioRun[] = [];
  let resident: Awaited<ReturnType<typeof loaded>> = [];
  try {
    for (const [scenario, form] of forms) {
      say(`${scenario}: designing`);
      // A timeout or transport error ends that scenario only; its finished attempts stay and it counts against the gate.
      const { run } = await recorded(
        scenario,
        runBuild({
          id: `${stem}-${scenario}`.slice(0, 32),
          form,
          system: instructions(version),
          promptVersion: version,
          model: { mode: 'local', id: model, host: 'ollama', digest: prov.digest, runtime: prov.runtime },
          repairs: EVAL_REPAIRS,
          infer,
          signal: new AbortController().signal,
          now: () => new Date(),
        }),
      );
      runs.push({ scenario, run });
      say(`${scenario}: ${run.end}, ${run.calls.length} calls`);
      if (resident.length === 0) resident = await loaded(url);
    }
  } finally {
    await unload(url, model);
  }
  const unloaded = await unloadAndConfirm(url, model);
  const summary = summarize(runs, forms.length);
  const verdict = gate(summary);
  const record = { ...context, resident, memory: mem, unloaded, summary, gate: verdict, runs };
  await writeFile(new URL(`results/${stem}.json`, ROOT), `${JSON.stringify(record, null, 2)}\n`);
  await writeFile(new URL(`results/${stem}.md`, ROOT), markdown(stem, summary, verdict));
  say(`wrote results/${stem}.json and .md; go=${verdict.go}`);
}

await main();
