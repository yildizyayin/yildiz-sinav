// Only local source/test auditors may use the operator-configured review branch.
const SOURCE_AUDITORS = new Set(['agent-ci-saglik.yml', 'agent-tenant-guvenlik.yml', 'agent-kvkk-denetim.yml', 'agent-d1-sema.yml']);
export function agentDispatchRef(workflow: string, configuredRef?: string): string {
  if (!SOURCE_AUDITORS.has(workflow)) return 'main';
  const ref = configuredRef?.trim() || 'main';
  if (ref.length > 200 || !/^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(ref) || ref.includes('..') || ref.includes('//') || ref.endsWith('/') || ref.endsWith('.') || ref.split('/').some(part => part.endsWith('.lock') || part.startsWith('.'))) {
    throw new Error('Ajan denetim dalı yapılandırması geçersiz.');
  }
  return ref;
}
