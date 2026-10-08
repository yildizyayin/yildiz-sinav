import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const yaml = readFileSync('.github/actions/agent-report/action.yml', 'utf8');
const script = yaml.split('        script: |\n')[1].split('\n').map(line => line.replace(/^          /, '')).join('\n');
const execute = new (Object.getPrototypeOf(async function () {}).constructor)('require', 'github', 'context', 'core', 'process', script);
const footer = '_Bu Issue ilgili GitHub Actions ajanı tarafından idempotent olarak güncellenir._';
const report = { number: 7, user: { type: 'Bot' }, labels: ['ci'], body: '<!-- anunex-agent-report:ci -->\n<!-- anunex-agent-report-ref:refs%2Fheads%2Ffeat%2Freview -->' };
const protectedIssues = [
  { ...report, number: 1, labels: [{ name: 'ajan-talimatı' }, { name: 'ci' }] },
  { ...report, number: 2, body: '## AI Ajan Talimatı\nGörev' },
  { ...report, number: 3, pull_request: { url: 'pr' } },
  { ...report, number: 4, user: { type: 'User' } },
  { ...report, number: 5, body: 'İlgisiz bot görevi' },
];
async function run(status: string, candidates: unknown[], ref = 'refs/heads/feat/review') {
  const updates: any[] = [], comments: any[] = [], created: any[] = [];
  const issues = {
    createLabel: async () => ({}), listForRepo: () => {},
    update: async (value: any) => { updates.push(value); },
    createComment: async (value: any) => { comments.push(value); },
    create: async (value: any) => { created.push(value); return { data: { number: 10 } }; },
  };
  await execute(() => ({ existsSync: () => true, readFileSync: () => 'Kontrol sonucu' }),
    { rest: { issues }, paginate: async () => candidates }, { repo: { owner: 'test', repo: 'test' }, ref, sha: 'abc123', runId: 42 },
    { info: () => {} }, { env: { REPORT_LABEL: 'ci', REPORT_TITLE: 'Rapor', REPORT_STATUS: status } });
  return { updates, comments, created };
}
describe('agent report ownership', () => {
  it('keeps other-branch reports and adopts legacy reports only on main', async () => {
    const legacy = { ...report, number: 9, body: `## Ücretsiz AI ajan raporu\n${footer}` };
    const other = { ...report, number: 10, body: report.body.replace('feat%2Freview', 'main') };
    const review = await run('success', [legacy, other, report]);
    expect(review.updates.map(value => value.issue_number)).toEqual([7]);
    const main = await run('success', [legacy, report, other], 'refs/heads/main');
    expect(main.updates.map(value => value.issue_number)).toEqual([9, 10]);
  });

  it('closes only its own report without completing instructions, PRs or unrelated issues', async () => {
    const result = await run('success', [...protectedIssues, report]);
    expect(result.updates.map(value => [value.issue_number, value.state])).toEqual([[7, 'closed']]);
    expect(result.created).toEqual([]);
  });
  it('updates and comments only on the report even when instructions appear first', async () => {
    const result = await run('warning', [...protectedIssues, report]);
    expect(result.updates.map(value => value.issue_number)).toEqual([7]);
    expect(result.comments.map(value => value.issue_number)).toEqual([7]);
    expect(result.updates[0].body).toContain('<!-- anunex-agent-report:ci -->');
    expect(result.updates[0].body).toContain('**Commit:** abc123');
    expect(result.updates[0].body).toContain('**Dal:** refs/heads/feat/review');
    expect(result.updates[0].body).toContain('/actions/runs/42');
  });
  it('creates a separate marked report when only protected issues exist', async () => {
    const result = await run('warning', protectedIssues);
    expect(result.updates).toEqual([]);
    expect(result.created).toHaveLength(1);
    expect(result.created[0].body).toContain('<!-- anunex-agent-report:ci -->');
  });
  it('recognizes marked reports only for the current agent label', async () => {
    const result = await run('success', [{ ...report, body: '<!-- anunex-agent-report:other -->' }, { ...report, number: 8, body: report.body }]);
    expect(result.updates.map(value => value.issue_number)).toEqual([8]);
  });
});
