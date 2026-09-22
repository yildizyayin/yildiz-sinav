import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Save, ScanLine, Trash2 } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";

type PrintField = {
  key: string;
  xMm?: number;
  yMm?: number;
  fontSizePt?: number;
  columnPitchMm?: number;
  rowPitchMm?: number;
  digits?: number;
};

const FIELD_OPTIONS = [
  ["studentName", "Ad Soyad"],
  ["studentNumber", "Öğrenci No"],
  ["class", "Sınıf"],
  ["section", "Şube"],
  ["institutionCode", "Kurum Kodu"],
  ["bookletCode", "Kitapçık Kodu"],
  ["examTitle", "Sınav Adı"],
  ["examCode", "Sınav Kodu"],
  ["qr", "QR"],
  ["barcode", "Barkod"],
  ["studentNumberBubbles", "Öğrenci No Baloncukları"],
] as const;

function parseJson(value: unknown) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

export function OpticalDesign() {
  const [searchParams] = useSearchParams();
  const requestedVersionId = searchParams.get("versionId") || "";
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState(requestedVersionId);
  const [version, setVersion] = useState<any>(null);
  const [fields, setFields] = useState<PrintField[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const loadCatalog = async () => {
    const result = await api<any>("/api/optical-definitions");
    const definitions = result.templates || [];
    const details = await Promise.all(
      definitions.map((item: any) =>
        api<any>(`/api/optical-definitions/${item.id}`).catch(() => null),
      ),
    );
    const versions = details.flatMap((detail: any) =>
      (detail?.versions || []).map((item: any) => ({
        ...item,
        templateId: detail.template?.id,
        templateName: detail.template?.name,
        templateStatus: detail.template?.status,
      })),
    );
    setTemplates(versions);
    if (!selectedVersionId && versions[0]?.id) setSelectedVersionId(versions[0].id);
  };

  const loadVersion = async (id: string) => {
    const result = await api<any>(`/api/optical-definition-versions/${id}`);
    setVersion(result);
    const print = parseJson(result.version?.print_fields);
    setFields(
      Array.isArray(print?.fields)
        ? print.fields.map((field: any) => ({
            key: String(field.key || "studentName"),
            xMm: Number(field.xMm ?? field.x ?? 0),
            yMm: Number(field.yMm ?? field.y ?? 0),
            fontSizePt: Number(field.fontSizePt || 9),
            columnPitchMm: field.columnPitchMm,
            rowPitchMm: field.rowPitchMm,
            digits: field.digits,
          }))
        : [],
    );
  };

  useEffect(() => {
    void loadCatalog().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!selectedVersionId) return;
    void loadVersion(selectedVersionId).catch((e) => setError(e.message));
  }, [selectedVersionId]);

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === selectedVersionId),
    [templates, selectedVersionId],
  );
  const pageWidth = Number(version?.version?.page_width_mm || 210);
  const pageHeight = Number(version?.version?.page_height_mm || 297);
  const updateField = (index: number, patch: Partial<PrintField>) =>
    setFields((current) =>
      current.map((field, itemIndex) =>
        itemIndex === index ? { ...field, ...patch } : field,
      ),
    );
  const save = async () => {
    if (!selectedVersionId || !fields.length) {
      setError("En az bir baskı alanı ekleyin.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/api/optical-definition-versions/${selectedVersionId}/print`, {
        method: "PUT",
        body: JSON.stringify({ definition: { fields } }),
      });
      setNotice("Baskı şablonu kaydedildi. Optik Basma ekranı bu sürümü kullanabilir.");
      await loadVersion(selectedVersionId);
      await loadCatalog();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="optical-design-page">
      <div className="page-head optical-design-head">
        <div>
          <span className="eyebrow">PHOBOS · OPTİK FORM TASARIMCISI</span>
          <h1>Optik Form Tasarımcısı</h1>
        </div>
        <div className="optical-design-actions">
          <Link className="ghost" to="/opticals"><ArrowLeft size={16} /> Optik Tanımla</Link>
          <Link className="secondary" to="/optical-prepare"><ScanLine size={16} /> Optik Basma</Link>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}
      <div className="panel optical-design-selector">
        <label>
          Optik sürümü
          <select value={selectedVersionId} onChange={(event) => setSelectedVersionId(event.target.value)}>
            <option value="">Optik sürümü seçin</option>
            {templates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.templateName} · {item.version}{item.active ? " · AKTİF" : " · TASLAK"}
              </option>
            ))}
          </select>
        </label>
        <div className="alert info">
          Aynı optik sürümü dosya/kamera okuma ve kişiye özel baskıda paylaşılır;
          bu ekrandaki baskı alanları okuma tanımından bağımsız düzenlenir.
        </div>
      </div>
      {version && (
        <>
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Baskı alanları</h2>
                <p>
                  X/Y değerleri milimetredir. Aktif sürüm kilitliyse önce Optik
                  Tanımlama ekranından yeni sürüm kopyalayın.
                </p>
              </div>
              <span className={`status ${version.version?.active ? "warn" : "ok"}`}>
                {version.version?.active ? "Yayında · kilitli" : "Taslak düzenlenebilir"}
              </span>
            </div>
            {version.version?.active && <div className="alert warning">Yayındaki sürüm değiştirilemez. Yeni sürüm açarak baskı tasarımını güncelleyin.</div>}
            {!fields.length && <div className="alert warning">Henüz baskı alanı yok. Alan ekleyerek taslağı tamamlayın.</div>}
            <div className="optical-design-fields">
              {fields.map((field, index) => (
                <div className="optical-design-field" key={`${field.key}-${index}`}>
                  <label>Alan<select disabled={Boolean(version.version?.active)} value={field.key} onChange={(event) => updateField(index, { key: event.target.value })}>{FIELD_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label>X mm<input disabled={Boolean(version.version?.active)} type="number" step="0.1" value={field.xMm ?? 0} onChange={(event) => updateField(index, { xMm: Number(event.target.value) })} /></label>
                  <label>Y mm<input disabled={Boolean(version.version?.active)} type="number" step="0.1" value={field.yMm ?? 0} onChange={(event) => updateField(index, { yMm: Number(event.target.value) })} /></label>
                  <label>Yazı pt<input disabled={Boolean(version.version?.active)} type="number" step="0.5" value={field.fontSizePt ?? 9} onChange={(event) => updateField(index, { fontSizePt: Number(event.target.value) })} /></label>
                  <button className="ghost" disabled={Boolean(version.version?.active)} onClick={() => setFields((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /> Sil</button>
                </div>
              ))}
            </div>
            <div className="optical-design-toolbar">
              <button className="secondary" disabled={Boolean(version.version?.active)} onClick={() => setFields((current) => [...current, { key: "studentName", xMm: 15, yMm: 15, fontSizePt: 9 }])}><Plus size={16} /> Alan ekle</button>
              <button className="primary" disabled={busy || Boolean(version.version?.active) || !fields.length} onClick={() => void save()}><Save size={16} /> Baskı şablonunu kaydet</button>
            </div>
          </div>
          <div className="panel">
            <div className="panel-head"><div><h2>Sayfa önizlemesi</h2><p>{pageWidth} × {pageHeight} mm · Koordinatlar baskıdaki gerçek sayfa ölçüsüne göre gösterilir.</p></div><ScanLine /></div>
            <div className="optical-design-preview-shell"><div className="optical-design-sheet" style={{ aspectRatio: `${pageWidth} / ${pageHeight}` }}>{fields.map((field, index) => <div className="optical-design-preview-field" key={`${field.key}-preview-${index}`} style={{ left: `${Number(field.xMm || 0) / pageWidth * 100}%`, top: `${Number(field.yMm || 0) / pageHeight * 100}%`, fontSize: `${Math.max(7, Number(field.fontSizePt || 9))}px` }}>{FIELD_OPTIONS.find(([value]) => value === field.key)?.[1] || field.key}</div>)}</div></div>
          </div>
        </>
      )}
      {!version && <div className="panel"><div className="empty-state"><ScanLine size={24} /><strong>Bir optik sürümü seçin</strong><span>Baskı alanlarını düzenlemek için listeden taslak veya aktif sürüm seçin.</span></div></div>}
      {selectedTemplate?.templateStatus === "ARCHIVED" && <div className="alert warning">Arşivlenmiş optik yalnızca görüntülenebilir.</div>}
    </div>
  );
}
