import { readFile, readdir } from 'node:fs/promises';
import { PROMPT_VERSION } from '@pending/agent';
import { Build } from '@pending/contract';
import { expect, test } from 'vitest';
import { galleryPlan, verified } from './gallery';
import { Matrix, Results, matrixMarkdown, resultsMarkdown } from './results';
import { loadScenarios } from './scenarios';

// The committed evidence of issue #10: the matrix, every configuration it names and the gallery exported from them.
const RESULTS = new URL('../results/', import.meta.url);
const GALLERY = new URL('../../apps/web/public/gallery/', import.meta.url);
const MATRIX = '2026-10-22-eval.json';
const read = async (url: URL): Promise<unknown> => {
  const raw: unknown = JSON.parse(await readFile(url, 'utf8'));
  return raw;
};

async function evidence() {
  const m = Matrix.parse(await read(new URL(MATRIX, RESULTS)));
  const configs = await Promise.all(
    m.configurations.map(async (c) => Results.parse(await read(new URL(c.file, RESULTS)))),
  );
  return { m, configs };
}

test('the committed matrix and every configuration it names pass the results schema', async () => {
  const { m, configs } = await evidence();
  if (m.status !== 'complete') throw new Error(`the committed matrix is ${m.status}`);
  expect(configs.map((r) => [r.experiment, r.model.id, r.promptVersion, r.matrix])).toEqual(
    m.configurations.map((c) => [c.experiment, c.model, c.promptVersion, MATRIX]),
  );
  for (const r of configs) {
    expect(r.k).toEqual(m.k);
    expect(r.stoppedAtDeadline).toBe(false);
    expect(r.rows).toHaveLength(r.runs.length);
  }
});

test('every committed summary is exactly what the results files generate, so no number is typed by hand', async () => {
  const { m, configs } = await evidence();
  const md = (stem: string) => readFile(new URL(`${stem}.md`, RESULTS), 'utf8');
  const matrixStem = MATRIX.replace(/\.json$/, '');
  expect(await md(matrixStem)).toBe(matrixMarkdown(m, configs, matrixStem));
  for (const [i, c] of m.configurations.entries()) {
    const stem = c.file.replace(/\.json$/, '');
    const r = configs[i];
    if (r === undefined) throw new Error(`${c.file} was not read`);
    expect(await md(stem)).toBe(resultsMarkdown(r, stem));
  }
});

test('each committed gallery record is a verified build with Ollama provenance, the one --gallery picks', async () => {
  const { m, configs } = await evidence();
  const plan = galleryPlan(m, configs, await loadScenarios(), {
    model: 'gemma4:e2b',
    promptVersion: PROMPT_VERSION,
  });
  expect(plan.mismatches).toEqual([]);
  expect(plan.missing).toEqual([]);
  const files = (await readdir(GALLERY)).filter((f) => f.endsWith('.json')).toSorted();
  expect(files).toEqual(plan.picks.map((p) => `${p.form}.json`).toSorted());
  for (const { form, build } of plan.picks) {
    const record = Build.parse(await read(new URL(`${form}.json`, GALLERY)));
    expect(record).toEqual(build);
    expect(verified(record)).toBe(true);
    const shipped = configs.find(
      (r) => r.model.id === record.model.id && r.promptVersion === record.promptVersion,
    );
    expect(record.model).toMatchObject({ digest: shipped?.model.digest, runtime: shipped?.model.runtime });
  }
});
