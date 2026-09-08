import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, CircleDashed, Clock3, ExternalLink, Play, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { api } from '../api';
import './agent-center.css';

type AgentWorkflow = {
  key: string;
  file: string;
  name: string;
  description: string;
  label: string;
  cadence: string;
  actionsUrl: string;
  available: boolean;
  error?: string | null;
  lastRun?: {
    status: string;
    conclusion: string | null;
    createdAt: string;
    updatedAt: string;
    htmlUrl: string;
    runNumber: number;
    event: string;
  } | null;
};

function date(value?: string | null) {
  if (!value) return 'Henüz çalışmadı';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}

function workflowState(workflow: AgentWorkflow) {
  if (!workflow.available) return { label: 'Merge bekliyor', tone: 'warn', Icon: CircleDashed };
  if (workflow.lastRun?.status === 'queued' || workflow.lastRun?.status === 'in_progress') return { label: 'Çalışıyor', tone: 'running', Icon: Activity };
  if (workflow.lastRun?.conclusion === 'success') return { label: 'Başarılı', tone: 'ok', Icon: CheckCircle2 };
  if (workflow.lastRun?.conclusion) return { label: 'Başarısız', tone: 'error', Icon: XCircle };
  return { label: 'Henüz çalışmadı', tone: 'neutral', Icon: CircleDashed };
}

export function AgentCenter() {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [runningWorkflow, setRunningWorkflow] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setError('');
    try {
      setData(await api<any>('/api/ai-agents'));
    } catch (e: any) {
      setError(e.message || 'AI ajan durumu okunamadı.');
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const workflows: AgentWorkflow[] = data?.workflows || [];
  const issues: any[] = data?.issues || [];
  const successful = useMemo(() => workflows.filter(workflow => workflow.lastRun?.conclusion === 'success').length, [workflows]);
  const running = useMemo(() => workflows.filter(workflow => ['queued', 'in_progress'].includes(workflow.lastRun?.status || '')).length, [workflows]);
  const urgentIssues = Number(data?.issueCounts?.acil || 0);

  const runWorkflow = async (workflow: AgentWorkflow) => {
    const inputs: Record<string, string> = {};
    if (workflow.file === 'agent-triyaj.yml' || workflow.file === 'agent-kod-yazici.yml') {
      const issueNumber = window.prompt(`${workflow.name} için Issue numarası:`);
      if (!issueNumber) return;
      inputs.issue_number = issueNumber.trim();
    }
    if (workflow.file === 'agent-yuk-testi.yml') {
      const vus = window.prompt('Staging yük testi sanal kullanıcı sayısı:', '1000');
      if (!vus) return;
      inputs.sanal_kullanici_sayisi = vus.trim();
    }
    setBusy(true);
    setRunningWorkflow(workflow.file);
    setError('');
    setNotice('');
    try {
      const result = await api<any>('/api/ai-agents/dispatch', { method: 'POST', body: JSON.stringify({ workflow: workflow.file, inputs }) });
      setNotice(result.message || `${workflow.name} ajanı tetiklendi.`);
      window.setTimeout(() => void load(), 2500);
    } catch (e: any) {
      setError(e.message || `${workflow.name} ajanı tetiklenemedi.`);
    } finally {
      setBusy(false);
      setRunningWorkflow('');
    }
  };

  return <>
    <div className="page-head agent-page-head">
      <div>
        <span className="eyebrow">ANUNEX · AI OPERASYON</span>
        <h1>AI Ajan Merkezi</h1>
        <p>7/24 çalışan GitHub ajanlarının son durumunu, açtıkları Issue kayıtlarını ve manuel tetikleme bağlantılarını tek ekranda izleyin.</p>
      </div>
      <button className="ghost" onClick={() => void load()} disabled={busy}><RefreshCw size={16} /> Yenile</button>
    </div>

    {error && <div className="alert error">{error}</div>}
    {notice && <div className="alert success"><CheckCircle2 size={17} /> {notice}</div>}
    {data?.warning && <div className="alert warning"><AlertTriangle size={17} /><div><strong>GitHub durumu kısmen okunamadı.</strong><span>{data.warning}</span></div></div>}

    <div className="summary-strip agent-summary">
      <div className="kpi-card"><span>Tanımlı ajan</span><strong>{workflows.length || '—'}</strong></div>
      <div className="kpi-card"><span>Son başarılı</span><strong>{successful || '—'}</strong></div>
      <div className="kpi-card"><span>Şu an çalışan</span><strong>{running || '0'}</strong></div>
      <div className="kpi-card"><span>Açık ajan Issue</span><strong>{issues.length || '0'}</strong></div>
      <div className="kpi-card"><span>Acil</span><strong className={urgentIssues ? 'agent-danger-number' : ''}>{urgentIssues || '0'}</strong></div>
    </div>

    <div className="panel agent-connection-panel">
      <div className="panel-head">
        <div><h2>Bağlantı ve güvenlik durumu</h2><p>Panel GitHub Actions verisini okur. Workflow secret değerleri güvenlik nedeniyle panelden okunmaz.</p></div>
        <ShieldCheck className="agent-panel-icon" />
      </div>
      <div className="agent-connection-grid">
        <Connection label="GitHub API" ready={Boolean(data?.setup?.githubToken && data?.apiReachable)} detail={data?.apiReachable ? data.repository : 'GITHUB_AGENT_TOKEN gerekli'} />
        <Connection label="Onay Worker" ready={Boolean(data?.setup?.onayWorkerUrl)} detail={data?.setup?.onayWorkerUrl ? 'URL tanımlı' : 'ONAY_WORKER_URL gerekli'} />
        <Connection label="Production güvenliği" ready detail="Deploy workflow’u panelden tetiklenmez" />
      </div>
      {!data?.configured && <div className="alert warning" style={{ marginTop: 14 }}><AlertTriangle size={17} /><div><strong>Panel henüz GitHub’a bağlanmadı.</strong><span>Cloudflare Worker’a GITHUB_AGENT_TOKEN Secret’ını ekleyin; token yalnızca bu allowlist’teki ajan workflow’ları için kullanılır.</span></div></div>}
      <div className="agent-setup-note"><strong>Actions Secret kontrol listesi</strong><span>ONAY_WORKER_SECRET · TWILIO_AUTH_TOKEN · ANTHROPIC_API_KEY · CLOUDFLARE_API_TOKEN</span><small>Bu değerler GitHub’da saklanır ve bilerek bu panele taşınmaz. Ayrıntılı kurulum için GitHub Actions workflow açıklamalarını kullanın.</small></div>
    </div>

    <div className="section-head agent-section-head"><div><h2>Ajanlar</h2><p>Durum bilgisi 60 saniyede bir yenilenir. “Actions’ta aç” düğmesi GitHub’ın standart Run workflow ekranına götürür.</p></div></div>
    <div className="agent-grid">
      {workflows.map(workflow => {
        const state = workflowState(workflow);
        const StateIcon = state.Icon;
        return <article className={`agent-card ${state.tone}`} key={workflow.file}>
          <div className="agent-card-top"><div className="agent-avatar"><Activity size={20} /></div><span className={`status ${state.tone === 'ok' ? 'ok' : state.tone === 'error' ? 'off' : state.tone === 'warn' ? 'warn' : 'neutral'}`}><StateIcon size={13} /> {state.label}</span></div>
          <span className="eyebrow">{workflow.cadence}</span>
          <h3>{workflow.name}</h3>
          <p>{workflow.description}</p>
          <div className="agent-card-meta"><span><Clock3 size={14} /> Son çalışma</span><strong>{date(workflow.lastRun?.updatedAt || workflow.lastRun?.createdAt)}</strong></div>
          {workflow.error && <small className="agent-inline-error">{workflow.error}</small>}
          <div className="agent-card-actions"><a className="secondary subtle" href={workflow.actionsUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Actions’ta aç</a><button className="primary subtle" disabled={busy || !workflow.available} onClick={() => void runWorkflow(workflow)}>{runningWorkflow === workflow.file ? <RefreshCw size={14} className="spin" /> : <Play size={14} />} Çalıştır</button></div>
        </article>;
      })}
    </div>

    <div className="section-head agent-section-head"><div><h2>Açık ajan Issue’ları</h2><p>İzleyici, içerik tarama, yük testi ve kod ajanlarının açtığı kayıtlar burada gruplanır.</p></div></div>
    <div className="table-card agent-issues-table">
      <table><thead><tr><th>Issue</th><th>Etiket</th><th>Güncellendi</th><th /></tr></thead><tbody>
        {issues.map(issue => <tr key={issue.number}><td><strong>#{issue.number} · {issue.title}</strong></td><td><div className="agent-labels">{issue.labels.map((label: string) => <span className="pill" key={label}>{label}</span>)}</div></td><td>{date(issue.updatedAt)}</td><td><a className="link-button" href={issue.htmlUrl} target="_blank" rel="noreferrer">Aç <ExternalLink size={13} /></a></td></tr>)}
      </tbody></table>
      {!issues.length && <div className="empty">Açık ajan Issue’su yok.</div>}
    </div>
  </>;
}

function Connection({ label, ready, detail }: { label: string; ready: boolean; detail: string }) {
  return <div className={`agent-connection ${ready ? 'ready' : 'missing'}`}><span>{ready ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}{label}</span><strong>{ready ? 'Hazır' : 'Eksik'}</strong><small>{detail}</small></div>;
}
