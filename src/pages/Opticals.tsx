import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  CircleAlert,
  CopyPlus,
  FileText,
  FileUp,
  FlaskConical,
  MousePointer2,
  MoreVertical,
  Pencil,
  Plus,
  Save,
  ScanLine,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { api } from "../api";
import { Link } from "react-router-dom";
import { analyzeFixedWidthSample } from "../lib/guidedDefinitions";
import {
  buildManualParserDefinition,
  defaultManualAnswerBlocks,
  defaultManualFields,
  type ManualOpticalField,
  type ManualAnswerBlock,
} from "../lib/opticalManual";

type Section = "parser" | "camera" | "fiducials";
type Method = "FMT" | "PHOTO" | "TXT" | "MANUAL";
type Suggestion = { xPct: number; yPct: number; wPct: number; hPct: number };
type Region = {
  id: string;
  type: string;
  subjectCode?: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
};
type AnswerRange = { subjectCode: string; start: number; end: number };
type PrintField = { key: string; xMm: number; yMm: number };

const EXAMPLES: Record<Section, unknown> = {
  parser: {
    type: "fixed-width",
    recordLength: 120,
    fields: {
      student_number: { start: 0, end: 8 },
      name: { start: 8, end: 38 },
      class: { start: 38, end: 42 },
      booklet: { start: 42, end: 43 },
    },
    answers: { MAT: { start: 43, end: 63 } },
  },
  camera: {
    regions: [
      {
        id: "answers-main",
        type: "answers",
        xMm: 20,
        yMm: 80,
        widthMm: 160,
        heightMm: 150,
      },
    ],
  },
  fiducials: {
    targets: [
      [8, 8],
      [202, 8],
      [8, 289],
    ],
  },
};

function pretty(value: unknown) {
  if (!value) return "";
  try {
    return JSON.stringify(
      typeof value === "string" ? JSON.parse(value) : value,
      null,
      2,
    );
  } catch {
    return String(value);
  }
}
function parseJson(value: unknown): any {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}
function assetLabel(value: string) {
  return value === "BLANK_FORM"
    ? "Boş Form / Baskı Tabanı"
    : value === "FMT_SAMPLE"
      ? "TXT / DAT / FMT Örneği"
      : "Baskı Tabanı";
}

function manualFieldFromDefinition(
  fields: ManualOpticalField[],
  definition: any,
) {
  return fields.map((field) => {
    const saved = definition?.fields?.[field.key];
    if (!saved) return field;
    const start = Number(saved.start || 0);
    const end = Number(saved.end || start);
    return { ...field, enabled: true, start, length: Math.max(0, end - start) };
  });
}

function manualAnswersFromDefinition(
  blocks: ManualAnswerBlock[],
  definition: any,
) {
  const saved = definition?.answers || {};
  const known = blocks.map((block) => {
    const match =
      saved[block.code] ||
      saved[block.code.replace("TEST-", "TEST")] ||
      saved[block.label] ||
      saved[block.label.toUpperCase()];
    if (!match) return block;
    const start = Number(match.start || 0);
    const end = Number(match.end || start);
    return {
      ...block,
      enabled: true,
      start,
      length: Math.max(0, end - start),
      questionCount: Number(match.questionCount || end - start),
      options: Number(match.options || 5) === 4 ? (4 as const) : (5 as const),
    };
  });
  const knownCodes = new Set(
    known.filter((block) => block.enabled).map((block) => block.code),
  );
  for (const [code, value] of Object.entries<any>(saved)) {
    if (knownCodes.has(code)) continue;
    const targetIndex = known.findIndex((block) => !block.enabled);
    if (targetIndex < 0) break;
    const start = Number(value.start || 0);
    const end = Number(value.end || start);
    known[targetIndex] = {
      code,
      label: value.label || code,
      enabled: true,
      start,
      length: Math.max(0, end - start),
      questionCount: Number(value.questionCount || end - start),
      options: Number(value.options || 5) === 4 ? 4 : 5,
    };
    knownCodes.add(code);
  }
  return known;
}

async function detectDenseRegions(file: File): Promise<Suggestion[]> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 720 / bitmap.width),
    width = Math.max(1, Math.round(bitmap.width * scale)),
    height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    return [];
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const data = ctx.getImageData(0, 0, width, height).data;
  const cols = 24,
    rows = 34,
    cw = width / cols,
    ch = height / rows;
  const active = Array.from({ length: rows }, () =>
    Array<boolean>(cols).fill(false),
  );
  for (let gy = 0; gy < rows; gy++)
    for (let gx = 0; gx < cols; gx++) {
      let dark = 0,
        total = 0;
      const x0 = Math.floor(gx * cw),
        x1 = Math.ceil((gx + 1) * cw),
        y0 = Math.floor(gy * ch),
        y1 = Math.ceil((gy + 1) * ch);
      for (let y = y0; y < Math.min(height, y1); y += 2)
        for (let x = x0; x < Math.min(width, x1); x += 2) {
          const i = (y * width + x) * 4;
          const lum =
            0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          if (lum < 145) dark++;
          total++;
        }
      active[gy][gx] = total > 0 && dark / total > 0.075;
    }
  const seen = Array.from({ length: rows }, () =>
      Array<boolean>(cols).fill(false),
    ),
    out: Suggestion[] = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (!active[y][x] || seen[y][x]) continue;
      const stack: Array<[number, number]> = [[x, y]];
      seen[y][x] = true;
      let minX = x,
        maxX = x,
        minY = y,
        maxY = y,
        count = 0;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        count++;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        for (const [nx, ny] of [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ] as Array<[number, number]>)
          if (
            nx >= 0 &&
            ny >= 0 &&
            nx < cols &&
            ny < rows &&
            active[ny][nx] &&
            !seen[ny][nx]
          ) {
            seen[ny][nx] = true;
            stack.push([nx, ny]);
          }
      }
      if (count < 2) continue;
      const w = maxX - minX + 1,
        h = maxY - minY + 1;
      if (w * h > cols * rows * 0.35) continue;
      out.push({
        xPct: (minX / cols) * 100,
        yPct: (minY / rows) * 100,
        wPct: (w / cols) * 100,
        hPct: (h / rows) * 100,
      });
    }
  return out.sort((a, b) => b.wPct * b.hPct - a.wPct * a.hPct).slice(0, 16);
}

export function Opticals() {
  const [templates, setTemplates] = useState<any[]>([]),
    [templateDetail, setTemplateDetail] = useState<any>(null),
    [versionDetail, setVersionDetail] = useState<any>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState(""),
    [selectedVersionId, setSelectedVersionId] = useState(""),
    [method, setMethod] = useState<Method>("FMT");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [openCardMenu, setOpenCardMenu] = useState<string | null>(null);
  const [newTemplate, setNewTemplate] = useState({
      name: "",
      vendor: "",
      version: "v1",
      pageWidthMm: 210,
      pageHeightMm: 297,
    }),
    [newVersion, setNewVersion] = useState("");
  const [editTemplate, setEditTemplate] = useState({ name: "", vendor: "" });
  const [photo, setPhoto] = useState<File | null>(null),
    [photoUrl, setPhotoUrl] = useState(""),
    [suggestions, setSuggestions] = useState<Suggestion[]>([]),
    [regions, setRegions] = useState<Region[]>([]);
  const [fiducials, setFiducials] = useState<Array<[number, number]>>([]),
    [drawMode, setDrawMode] = useState<"REGION" | "FIDUCIAL">("REGION"),
    [regionKind, setRegionKind] = useState("answers"),
    [regionSubject, setRegionSubject] = useState("MAT");
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Suggestion | null>(null);
  const [sample, setSample] = useState<File | null>(null),
    [sampleText, setSampleText] = useState(""),
    [fixed, setFixed] = useState<any>(null),
    [parserTest, setParserTest] = useState<any>(null);
  const [fmtFile, setFmtFile] = useState<File | null>(null),
    [fmtDefinition, setFmtDefinition] = useState<any>(null);
  const [fieldRanges, setFieldRanges] = useState({
      tcknStart: 0,
      tcknEnd: 0,
      studentStart: 0,
      studentEnd: 0,
      nameStart: 0,
      nameEnd: 0,
      classStart: 0,
      classEnd: 0,
      bookletStart: 0,
      bookletEnd: 0,
    }),
    [answerRanges, setAnswerRanges] = useState<AnswerRange[]>([]);
  const [manualRecordLength, setManualRecordLength] = useState(0),
    [manualIndexBase, setManualIndexBase] = useState<0 | 1>(0);
  const [manualFields, setManualFields] =
      useState<ManualOpticalField[]>(defaultManualFields),
    [manualAnswers, setManualAnswers] = useState<ManualAnswerBlock[]>(
      defaultManualAnswerBlocks,
    );
  const [printFields, setPrintFields] = useState<PrintField[]>([]),
    [advanced, setAdvanced] = useState<Record<Section, string>>({
      parser: "",
      camera: "",
      fiducials: "",
    });
  const selectedVersion = versionDetail?.version,
    readiness = versionDetail?.readiness,
    pageW = Number(selectedVersion?.page_width_mm || 210),
    pageH = Number(selectedVersion?.page_height_mm || 297);

  const loadTemplates = async () => {
    const r = await api<any>("/api/optical-definitions");
    setTemplates(r.templates || []);
  };
  const loadTemplate = async (id: string) => {
    const r = await api<any>(`/api/optical-definitions/${id}`);
    setTemplateDetail(r);
    setEditTemplate({
      name: r.template?.name || "",
      vendor: r.template?.vendor || "",
    });
    if (
      !selectedVersionId ||
      !(r.versions || []).some((v: any) => v.id === selectedVersionId)
    )
      setSelectedVersionId(r.versions?.[0]?.id || "");
  };
  const loadVersion = async (id: string) => {
    const r = await api<any>(`/api/optical-definition-versions/${id}`);
    setVersionDetail(r);
    setParserTest(null);
    const camera = parseJson(r.version.camera_geometry),
      fid = parseJson(r.version.fiducials);
    setRegions(
      (camera?.regions || []).map((x: any, i: number) => ({
        id: x.id || `region-${i + 1}`,
        type: x.type || "answers",
        subjectCode: x.subjectCode,
        xMm: Number(x.xMm),
        yMm: Number(x.yMm),
        widthMm: Number(x.widthMm),
        heightMm: Number(x.heightMm),
      })),
    );
    setFiducials(
      (fid?.targets || []).map((x: any): [number, number] =>
        Array.isArray(x)
          ? [Number(x[0]), Number(x[1])]
          : [Number(x.xMm), Number(x.yMm)],
      ),
    );
    setAdvanced({
      parser: pretty(r.version.parser_definition),
      camera: pretty(r.version.camera_geometry),
      fiducials: pretty(r.version.fiducials),
    });
    const parser = parseJson(r.version.parser_definition);
    setFmtDefinition(parser?.type === "fmt" ? parser : null);
    const fixedParser = parser?.type === "fmt" ? parser.fixedWidth : parser;
    if (fixedParser) {
      setManualRecordLength(Number(fixedParser.recordLength || 0));
      setManualIndexBase(parser?.indexBase === 1 ? 1 : 0);
      setManualFields(
        manualFieldFromDefinition(defaultManualFields(), fixedParser),
      );
      setManualAnswers(
        manualAnswersFromDefinition(defaultManualAnswerBlocks(), fixedParser),
      );
    }
  };
  useEffect(() => {
    void loadTemplates().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (selectedTemplateId)
      void loadTemplate(selectedTemplateId).catch((e) => setError(e.message));
  }, [selectedTemplateId]);
  useEffect(() => {
    if (selectedVersionId)
      void loadVersion(selectedVersionId).catch((e) => setError(e.message));
  }, [selectedVersionId]);
  useEffect(() => {
    if (!photo) {
      setPhotoUrl("");
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const createTemplate = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api<any>("/api/optical-definitions", {
        method: "POST",
        body: JSON.stringify(newTemplate),
      });
      await loadTemplates();
      setSelectedTemplateId(r.templateId);
      setSelectedVersionId(r.versionId);
      setNotice(
        "Okuma tanımı taslağı oluşturuldu. FMT/TXT/DAT eşlemesini veya fotoğraf/kamera geometrisini tamamlayın; baskı tasarımı ayrı ekrandadır.",
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const createVersion = async () => {
    if (!selectedTemplateId || !newVersion.trim()) return;
    setBusy(true);
    try {
      const r = await api<any>(
        `/api/optical-definitions/${selectedTemplateId}/versions`,
        {
          method: "POST",
          body: JSON.stringify({
            version: newVersion.trim(),
            cloneFromVersionId: selectedVersionId || null,
          }),
        },
      );
      await loadTemplate(selectedTemplateId);
      setSelectedVersionId(r.versionId);
      setNewVersion("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const copyTemplateVersion = async (templateId: string) => {
    setBusy(true);
    setError("");
    try {
      const detail = await api<any>(`/api/optical-definitions/${templateId}`);
      const versions = detail.versions || [];
      const numbers = versions
        .map((item: any) => Number(String(item.version || "").replace(/[^0-9]/g, "")))
        .filter((item: number) => Number.isFinite(item));
      const nextVersion = `v${Math.max(1, ...numbers) + 1}`;
      const source = versions.find((item: any) => item.active) || versions[0];
      const result = await api<any>(`/api/optical-definitions/${templateId}/versions`, {
        method: "POST",
        body: JSON.stringify({ version: nextVersion, cloneFromVersionId: source?.id || null }),
      });
      await loadTemplate(templateId);
      setSelectedTemplateId(templateId);
      setSelectedVersionId(result.versionId);
      setNewVersion("");
      setNotice(`${nextVersion} taslak sürümü oluşturuldu. Kaynak optik değişmeden korunuyor.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const saveTemplate = async () => {
    if (!selectedTemplateId || !editTemplate.name.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/optical-definitions/${selectedTemplateId}`, {
        method: "PATCH",
        body: JSON.stringify(editTemplate),
      });
      await loadTemplates();
      await loadTemplate(selectedTemplateId);
      setNotice("Optik kartı güncellendi.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const deleteTemplate = async (templateId = selectedTemplateId) => {
    if (
      !templateId ||
      !confirm(
        "Bu optik silinsin mi? Kullanılmış kayıtlar korunur ve optik güvenli biçimde arşivlenir.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/optical-definitions/${templateId}`, {
        method: "DELETE",
      });
      if (selectedTemplateId === templateId) {
        setSelectedTemplateId("");
        setSelectedVersionId("");
        setTemplateDetail(null);
        setVersionDetail(null);
      }
      await loadTemplates();
      setNotice("Optik arşivlendi. Geçmiş sınav kayıtları korunuyor.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const deleteVersion = async (versionId: string) => {
    if (
      !confirm("Bu taslak sürüm silinsin mi? Kullanılmış sürümler silinemez.")
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/optical-definition-versions/${versionId}`, {
        method: "DELETE",
      });
      setSelectedVersionId("");
      setVersionDetail(null);
      await loadTemplate(selectedTemplateId);
      setNotice("Optik taslak sürümü silindi.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const pointPct = (e: React.PointerEvent<HTMLDivElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((e.clientX - b.left) / b.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - b.top) / b.height) * 100)),
    };
  };
  const addRegion = (s: Suggestion) =>
    setRegions((x) => [
      ...x,
      {
        id: `region-${x.length + 1}`,
        type: regionKind,
        subjectCode:
          regionKind === "answers"
            ? regionSubject.trim().toUpperCase()
            : undefined,
        xMm: (s.xPct / 100) * pageW,
        yMm: (s.yPct / 100) * pageH,
        widthMm: (s.wPct / 100) * pageW,
        heightMm: (s.hPct / 100) * pageH,
      },
    ]);
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!photoUrl || selectedVersion?.active) return;
    const p = pointPct(e);
    if (drawMode === "FIDUCIAL") {
      const pair: [number, number] = [(p.x / 100) * pageW, (p.y / 100) * pageH];
      setFiducials((x) => [...x, pair].slice(-8));
      return;
    }
    startRef.current = p;
    setDraft({ xPct: p.x, yPct: p.y, wPct: 0, hPct: 0 });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!startRef.current || drawMode !== "REGION") return;
    const p = pointPct(e),
      s = startRef.current;
    setDraft({
      xPct: Math.min(s.x, p.x),
      yPct: Math.min(s.y, p.y),
      wPct: Math.abs(p.x - s.x),
      hPct: Math.abs(p.y - s.y),
    });
  };
  const onUp = () => {
    if (draft && draft.wPct >= 1 && draft.hPct >= 1) addRegion(draft);
    startRef.current = null;
    setDraft(null);
  };
  const analysePhoto = async () => {
    if (!photo) return;
    setBusy(true);
    try {
      const found = await detectDenseRegions(photo);
      setSuggestions(found);
      setNotice(
        found.length
          ? `${found.length} yoğun bölge bulundu. Turuncu önerilere tıklayın veya alanı elle çizin; alanın anlamını siz onaylayın.`
          : "Otomatik öneri bulunamadı; alanları fotoğraf üzerinde elle çizebilirsiniz.",
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const savePhoto = async () => {
    if (!selectedVersionId) return;
    if (!regions.length) return setError("En az bir okuma alanı çizmelisiniz.");
    if (fiducials.length < 3)
      return setError("En az 3 gerçek referans noktası işaretleyin.");
    setBusy(true);
    try {
      await api(
        `/api/optical-definition-versions/${selectedVersionId}/camera`,
        { method: "PUT", body: JSON.stringify({ definition: { regions } }) },
      );
      await api(
        `/api/optical-definition-versions/${selectedVersionId}/fiducials`,
        {
          method: "PUT",
          body: JSON.stringify({ definition: { targets: fiducials } }),
        },
      );
      if (photo) {
        const fd = new FormData();
        fd.append("file", photo);
        fd.append("assetType", "BLANK_FORM");
        await api(
          `/api/optical-definition-versions/${selectedVersionId}/assets`,
          { method: "POST", body: fd },
        );
      }
      setNotice(
        "Boş optik, kamera geometrisi ve referans noktaları kaydedildi. Baskı alanlarını Optik Form Tasarımcısı ekranında ayrıca tanımlayabilirsiniz.",
      );
      await loadVersion(selectedVersionId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const importFmt = async () => {
    if (!selectedVersionId || !fmtFile) return;
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", fmtFile);
      const r = await api<any>(
        `/api/optical-definition-versions/${selectedVersionId}/fmt`,
        { method: "POST", body: fd },
      );
      setFmtDefinition(r.definition);
      setNotice(
        `FMT okundu: ${Object.keys(r.definition.fields || {}).length} kimlik alanı, ${Object.keys(r.definition.answers || {}).length} test bloğu. Başlangıç/uzunluk/bitiş eşlemesini kontrol edin.`,
      );
      await loadVersion(selectedVersionId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const updateFmtSlice = (
    group: "fields" | "answers",
    code: string,
    key: "start" | "end" | "length",
    value: number,
  ) =>
    setFmtDefinition((d: any) => {
      const current = d[group]?.[code] || {};
      const next = { ...current, [key]: value };
      if (key === "start")
        next.end =
          value + Number((current.length ?? current.end - current.start) || 1);
      if (key === "length") next.end = Number(current.start || 0) + value;
      if (key === "end") next.length = value - Number(current.start || 0);
      return { ...d, [group]: { ...d[group], [code]: next } };
    });
  const saveFmtMapping = async () => {
    if (!selectedVersionId || !fmtDefinition) return;
    setBusy(true);
    setError("");
    try {
      const definition = {
        ...fmtDefinition,
        fixedWidth: {
          ...fmtDefinition.fixedWidth,
          type: "fixed-width",
          recordLength: fmtDefinition.recordLength,
          fields: fmtDefinition.fields,
          answers: fmtDefinition.answers,
        },
      };
      await api(
        `/api/optical-definition-versions/${selectedVersionId}/parser`,
        { method: "PUT", body: JSON.stringify({ definition }) },
      );
      setFmtDefinition(definition);
      setNotice(
        "FMT eşlemesi kaydedildi. Gerçek TXT/DAT örneğini yüklediğinizde test sonucu ayrıca doğrulanır.",
      );
      await loadVersion(selectedVersionId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const readSample = async (file?: File) => {
    if (!file) return;
    setSample(file);
    const text = await file.text();
    setSampleText(text);
    const s = analyzeFixedWidthSample(text);
    setFixed(s);
    setParserTest(null);
    if (!s)
      return setError(
        "TXT/DAT yapısı otomatik analiz edilemedi. Manuel tanım kullanabilirsiniz.",
      );
    setManualRecordLength(s.recordLength);
    setFieldRanges({
      tcknStart: 0,
      tcknEnd: 0,
      studentStart: s.studentNumber?.start ?? 0,
      studentEnd: s.studentNumber?.end ?? 0,
      nameStart: s.name?.start ?? 0,
      nameEnd: s.name?.end ?? 0,
      classStart: 0,
      classEnd: 0,
      bookletStart: 0,
      bookletEnd: 0,
    });
    setManualFields((current) =>
      current.map((field) =>
        field.key === "student_number"
          ? {
              ...field,
              enabled: Boolean(s.studentNumber),
              start: s.studentNumber?.start ?? 0,
              length: s.studentNumber
                ? s.studentNumber.end - s.studentNumber.start
                : 0,
            }
          : field.key === "name"
            ? {
                ...field,
                enabled: Boolean(s.name),
                start: s.name?.start ?? 0,
                length: s.name ? s.name.end - s.name.start : 0,
              }
            : field,
      ),
    );
    setAnswerRanges(
      s.answerBlocks.map((x, i) => ({
        subjectCode: i === 0 ? "MAT" : "",
        start: x.start,
        end: x.end,
      })),
    );
    setNotice(
      `TXT/DAT analiz edildi: ${s.recordLength} karakter, ${s.answerBlocks.length} olası cevap bloğu.`,
    );
  };
  const buildParser = () => {
    if (!fixed) return null;
    const fields: any = {
      name: { start: fieldRanges.nameStart, end: fieldRanges.nameEnd },
    };
    if (fieldRanges.tcknEnd > fieldRanges.tcknStart)
      fields.tckn = { start: fieldRanges.tcknStart, end: fieldRanges.tcknEnd };
    if (fieldRanges.studentEnd > fieldRanges.studentStart)
      fields.student_number = {
        start: fieldRanges.studentStart,
        end: fieldRanges.studentEnd,
      };
    if (fieldRanges.classEnd > fieldRanges.classStart)
      fields.class = {
        start: fieldRanges.classStart,
        end: fieldRanges.classEnd,
      };
    if (fieldRanges.bookletEnd > fieldRanges.bookletStart)
      fields.booklet = {
        start: fieldRanges.bookletStart,
        end: fieldRanges.bookletEnd,
      };
    const answers: any = {};
    for (const r of answerRanges)
      if (r.subjectCode.trim() && r.end > r.start)
        answers[r.subjectCode.trim().toUpperCase()] = {
          start: r.start,
          end: r.end,
        };
    return {
      type: "fixed-width",
      recordLength: fixed.recordLength,
      signature: "",
      fields,
      answers,
    };
  };
  const saveParser = async () => {
    if (!selectedVersionId || !sample || !sampleText) return;
    const parser = buildParser();
    if (!parser) return;
    setBusy(true);
    try {
      await api(
        `/api/optical-definition-versions/${selectedVersionId}/parser`,
        { method: "PUT", body: JSON.stringify({ definition: parser }) },
      );
      const r = await api<any>(
        `/api/optical-definition-versions/${selectedVersionId}/test-parser`,
        {
          method: "POST",
          body: JSON.stringify({ sampleText, fileName: sample.name }),
        },
      );
      setParserTest(r);
      if (r.passed) {
        const fd = new FormData();
        fd.append("file", sample);
        fd.append("assetType", "FMT_SAMPLE");
        await api(
          `/api/optical-definition-versions/${selectedVersionId}/assets`,
          { method: "POST", body: fd },
        );
      }
      setNotice(
        r.passed
          ? `${r.recordCount} kayıt başarıyla okundu.`
          : "Parser testi geçmedi; başlangıç/bitiş alanlarını düzeltin.",
      );
      await loadVersion(selectedVersionId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const saveManualDefinition = async () => {
    if (!selectedVersionId) return;
    if (!manualRecordLength || manualRecordLength < 1)
      return setError("Kayıt uzunluğu girilmelidir.");
    const definition = buildManualParserDefinition(
      manualRecordLength,
      manualFields,
      manualAnswers,
      manualIndexBase,
    );
    if (!definition.fields.name)
      return setError(
        "Ad Soyad alanını etkinleştirin ve başlangıç/uzunluk girin.",
      );
    if (!Object.keys(definition.answers).length)
      return setError("En az bir test/cevap bloğunu etkinleştirin.");
    setBusy(true);
    setError("");
    try {
      await api(
        `/api/optical-definition-versions/${selectedVersionId}/parser`,
        { method: "PUT", body: JSON.stringify({ definition }) },
      );
      if (sample && sampleText) {
        const r = await api<any>(
          `/api/optical-definition-versions/${selectedVersionId}/test-parser`,
          {
            method: "POST",
            body: JSON.stringify({ sampleText, fileName: sample.name }),
          },
        );
        setParserTest(r);
        if (r.passed) {
          const fd = new FormData();
          fd.append("file", sample);
          fd.append("assetType", "FMT_SAMPLE");
          await api(
            `/api/optical-definition-versions/${selectedVersionId}/assets`,
            { method: "POST", body: fd },
          );
        }
        setNotice(
          r.passed
            ? `${r.recordCount} kayıt başarıyla okundu; manuel optik tanımı doğrulandı.`
            : "Parametreler kaydedildi ancak örnek dosya testi geçmedi. Alanları kontrol edin.",
        );
      } else
        setNotice(
          "Manuel optik parametreleri kaydedildi. Yayınlamak için gerçek TXT/DAT örneğini yükleyip test edin.",
        );
      await loadVersion(selectedVersionId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const savePrint = async () => {
    if (!selectedVersionId || !printFields.length) return;
    await api(`/api/optical-definition-versions/${selectedVersionId}/print`, {
      method: "PUT",
      body: JSON.stringify({ definition: { fields: printFields } }),
    });
  };
  const saveAdvanced = async (section: Section) => {
    if (!selectedVersionId) return;
    setBusy(true);
    try {
      await api(
        `/api/optical-definition-versions/${selectedVersionId}/${section}`,
        {
          method: "PUT",
          body: JSON.stringify({ definition: JSON.parse(advanced[section]) }),
        },
      );
      await loadVersion(selectedVersionId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const publish = async () => {
    if (
      !selectedVersionId ||
      !confirm("Bu optik sürümü READY durumuna alınsın mı?")
    )
      return;
    setBusy(true);
    try {
      await api(
        `/api/optical-definition-versions/${selectedVersionId}/publish`,
        { method: "POST" },
      );
      setNotice("Optik sürümü yayına alındı.");
      await loadTemplates();
      await loadTemplate(selectedTemplateId);
      await loadVersion(selectedVersionId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const readinessCards = useMemo(
    () => [
      ["FMT / Parser", readiness?.parser && readiness?.parserTestPassed],
      ["Kamera", readiness?.camera],
      ["Referans", readiness?.fiducials],
    ],
    [readiness],
  );
  const closeTemplate = () => {
    setSelectedTemplateId("");
    setSelectedVersionId("");
    setTemplateDetail(null);
    setVersionDetail(null);
    setError("");
  };

  return (
    <div
      className={`optical-definition-page ${templateDetail && selectedTemplateId ? "detail-mode" : ""}`}
    >
      <div className="page-head">
        <div>
          <span className="eyebrow">PHOBOS · OPTİK MERKEZİ</span>
          <h1>Optik Tanımla</h1>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}
      <div className="optical-definition-create-shell">
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-head">
            <div>
              <h2>Yeni okuma tanımı</h2>
              <p>
                Optiğin adı, üreticisi, sayfa ölçüsü ve sürümüyle okuma tanımını
                başlatın. Baskı alanlarını daha sonra Optik Form Tasarımcısı'nda
                ekleyin.
              </p>
            </div>
            <ScanLine />
          </div>
          <div className="form-grid">
            <label>
              Optik adı
              <input
                value={newTemplate.name}
                onChange={(e) =>
                  setNewTemplate((x) => ({ ...x, name: e.target.value }))
                }
                placeholder="Örn. Optik 840"
              />
            </label>
            <label>
              Kaynak / üretici
              <input
                value={newTemplate.vendor}
                onChange={(e) =>
                  setNewTemplate((x) => ({ ...x, vendor: e.target.value }))
                }
              />
            </label>
            <label>
              Sürüm
              <input
                value={newTemplate.version}
                onChange={(e) =>
                  setNewTemplate((x) => ({ ...x, version: e.target.value }))
                }
              />
            </label>
            <label>
              Genişlik mm
              <input
                type="number"
                value={newTemplate.pageWidthMm}
                onChange={(e) =>
                  setNewTemplate((x) => ({
                    ...x,
                    pageWidthMm: Number(e.target.value),
                  }))
                }
              />
            </label>
            <label>
              Yükseklik mm
              <input
                type="number"
                value={newTemplate.pageHeightMm}
                onChange={(e) =>
                  setNewTemplate((x) => ({
                    ...x,
                    pageHeightMm: Number(e.target.value),
                  }))
                }
              />
            </label>
          </div>
          <button
            className="primary"
            disabled={busy || !newTemplate.name.trim()}
            onClick={createTemplate}
          >
            <Plus size={16} /> Optiği Tanıtmaya Başla
          </button>
        </div>
      </div>
      <div className="optical-definition-list-shell">
        <div className="exam-grid" style={{ marginBottom: 20 }}>
          {templates.map((t) => (
            <div
              key={t.id}
              className="exam-card"
              style={{
                textAlign: "left",
                outline:
                  selectedTemplateId === t.id
                    ? "2px solid currentColor"
                    : "none",
              }}
            >
              <div className="exam-top">
                <div className="quick-icon">
                  <ScanLine />
                </div>
                <div className="optical-card-menu-wrap">
                  <button
                    className="icon-button optical-card-menu-button"
                    aria-label={`${t.name} işlemleri`}
                    aria-expanded={openCardMenu === t.id}
                    onClick={() => setOpenCardMenu((current) => current === t.id ? null : t.id)}
                  >
                    <MoreVertical size={17} />
                  </button>
                  {openCardMenu === t.id && <div className="optical-card-menu" role="menu">
                    <button role="menuitem" onClick={() => { setSelectedTemplateId(t.id); setOpenCardMenu(null); }}><Pencil size={14} /> Düzenle</button>
                    <button role="menuitem" disabled={busy || t.status === "ARCHIVED"} onClick={() => { setOpenCardMenu(null); void copyTemplateVersion(t.id); }}><CopyPlus size={14} /> Kopyala</button>
                    <button role="menuitem" disabled={busy || t.status === "ARCHIVED"} onClick={() => { setOpenCardMenu(null); void deleteTemplate(t.id); }}><Trash2 size={14} /> Sil</button>
                  </div>}
                </div>
              </div>
              <div className="optical-card-status">
                {t.status === "READY" ? <span className="verified"><CheckCircle2 size={14} /> Hazır</span> : t.status === "ARCHIVED" ? <span className="warning"><CircleAlert size={14} /> Arşivlendi</span> : <span className="warning"><CircleAlert size={14} /> Okuma tanımı sürüyor</span>}
              </div>
              <h3>{t.name}</h3>
              <p>
                {t.vendor || "Genel"} · {t.version_count} sürüm
              </p>
            </div>
          ))}
        </div>
      </div>
      <div className="optical-definition-detail-shell">
        <div className="optical-detail-toolbar">
          <button className="ghost" onClick={closeTemplate}>
            <ArrowLeft size={16} /> Optik listesine dön
          </button>
          {templateDetail && (
            <span className="status neutral">
              {templateDetail.template?.status === "READY"
                ? "Yayında"
                : templateDetail.template?.status === "ARCHIVED"
                  ? "Arşivlendi"
                  : "Taslak çalışma alanı"}
            </span>
          )}
        </div>
        {templateDetail && (
          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-head">
              <div>
                <h2>{templateDetail.template?.name} · Optik kartı</h2>
                <p>
                  Ad ve üretici bilgisi tüm sürümlerde güncellenir. Yayındaki
                  sürümün okuma alanları yeni sürüm açılmadan değiştirilemez.
                </p>
              </div>
              <Pencil />
            </div>
            <div className="form-grid">
              <label>
                Optik adı
                <input
                  value={editTemplate.name}
                  onChange={(e) =>
                    setEditTemplate((x) => ({ ...x, name: e.target.value }))
                  }
                />
              </label>
              <label>
                Kaynak / üretici
                <input
                  value={editTemplate.vendor}
                  onChange={(e) =>
                    setEditTemplate((x) => ({ ...x, vendor: e.target.value }))
                  }
                />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="primary"
                disabled={
                  busy ||
                  templateDetail.template?.status === "ARCHIVED" ||
                  !editTemplate.name.trim()
                }
                onClick={saveTemplate}
              >
                <Save size={16} /> Düzenlemeyi Kaydet
              </button>
              <button
                className="ghost"
                disabled={
                  busy || templateDetail.template?.status === "ARCHIVED"
                }
                onClick={() => void deleteTemplate()}
              >
                <Trash2 size={16} /> Sil / Arşivle
              </button>
            </div>
            <div className="form-grid" style={{ marginTop: 16 }}>
              <label>
                Sürüm
                <select
                  value={selectedVersionId}
                  onChange={(e) => setSelectedVersionId(e.target.value)}
                >
                  {templateDetail.versions?.map((v: any) => (
                    <option key={v.id} value={v.id}>
                      {v.version}
                      {v.active ? " · AKTİF" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Yeni sürüm
                <input
                  value={newVersion}
                  onChange={(e) => setNewVersion(e.target.value)}
                  placeholder="v2"
                />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="secondary"
                disabled={
                  !newVersion.trim() ||
                  busy ||
                  templateDetail.template?.status === "ARCHIVED"
                }
                onClick={createVersion}
              >
                <CopyPlus size={16} /> Kopyala / Yeni Taslak Sürüm
              </button>
            </div>
            {templateDetail.versions?.map((v: any) => (
              <div className="list-card" key={v.id} style={{ marginTop: 8 }}>
                <div>
                  <strong>{v.version}</strong>
                  <span>
                    {v.active ? "Yayında · kilitli" : "Taslak sürüm"} ·{" "}
                    {v.has_parser && v.has_camera && v.has_fiducials
                      ? "Okuma tanımı dolu"
                      : "Okuma tanımı eksik"} · {v.has_print ? "Baskı tasarımı hazır" : "Baskı tasarımı bekliyor"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="ghost"
                    onClick={() => setSelectedVersionId(v.id)}
                  >
                    Aç
                  </button>
                  {!v.active && (
                    <button
                      className="ghost"
                      disabled={busy}
                      onClick={() => void deleteVersion(v.id)}
                    >
                      <Trash2 size={14} /> Sil
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {versionDetail && (
          <>
            <div className="summary-strip" style={{ marginBottom: 20 }}>
              {readinessCards.map(([label, ok]) => (
                <div className="kpi-card" key={String(label)}>
                  <span>{String(label)}</span>
                  <strong>{ok ? "Hazır" : "Eksik"}</strong>
                </div>
              ))}
            </div>
            {selectedVersion?.active ? (
              <div className="alert success">
                Bu sürüm yayında ve kilitli. Değişiklik için yeni sürüm açın.
              </div>
            ) : (
              <>
                <div className="panel" style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      className={method === "FMT" ? "primary" : "secondary"}
                      onClick={() => setMethod("FMT")}
                    >
                      <FileText size={16} /> FMT ile Tanımla · Birincil
                    </button>
                    <button
                      className={method === "PHOTO" ? "primary" : "secondary"}
                      onClick={() => setMethod("PHOTO")}
                    >
                      <Camera size={16} /> Fotoğraftan Tanımla
                    </button>
                    <button
                      className={method === "TXT" ? "primary" : "secondary"}
                      onClick={() => setMethod("TXT")}
                    >
                      <FileText size={16} /> TXT / DAT Alternatif
                    </button>
                    <button
                      className={method === "MANUAL" ? "primary" : "secondary"}
                      onClick={() => setMethod("MANUAL")}
                    >
                      <MousePointer2 size={16} /> Manuel / Gelişmiş
                    </button>
                  </div>
                </div>
                {method === "FMT" && (
                  <div className="panel" style={{ marginBottom: 20 }}>
                    <div className="panel-head">
                      <div>
                        <h2>FMT optik tanımlama</h2>
                        <p>
                          FMT dosyası alan kodlarını, başlangıç–uzunluk–bitiş
                          konumlarını ve test bloklarını otomatik çıkarır.
                          Okulizyon benzeri eşleştirme tablosundan son kontrolü
                          siz yaparsınız.
                        </p>
                      </div>
                      <FileText />
                    </div>
                    <div className="form-grid">
                      <label>
                        FMT dosyası
                        <input
                          type="file"
                          accept=".fmt,.json,.txt,text/plain,application/json"
                          onChange={(e) =>
                            setFmtFile(e.target.files?.[0] || null)
                          }
                        />
                      </label>
                      <label>
                        Kaynak önceliği
                        <input value="FMT → TXT/DAT → manuel" readOnly />
                      </label>
                    </div>
                    <button
                      className="secondary"
                      disabled={!fmtFile || busy}
                      onClick={() => void importFmt()}
                    >
                      <FileUp size={16} /> FMT'yi Oku ve Alanları Getir
                    </button>
                    {fmtDefinition && (
                      <>
                        <div
                          className="alert success"
                          style={{ marginTop: 12 }}
                        >
                          Form: {fmtDefinition.formName || "Tanımsız"} · Kayıt
                          uzunluğu: {fmtDefinition.recordLength} · Başlangıç
                          tabanı: {fmtDefinition.indexBase === 1 ? "1" : "0"}
                        </div>
                        <h3>Kimlik ve form alanları</h3>
                        <div
                          className="list-card"
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "1.3fr repeat(3, minmax(90px, 1fr))",
                            gap: 8,
                            alignItems: "end",
                          }}
                        >
                          <strong>Alan</strong>
                          <strong>Başlangıç</strong>
                          <strong>Uzunluk</strong>
                          <strong>Bitiş</strong>
                          {Object.entries<any>(fmtDefinition.fields || {}).map(
                            ([code, f]) => (
                              <span key={code} style={{ display: "contents" }}>
                                <strong>{code}</strong>
                                <input
                                  type="number"
                                  value={f.start}
                                  onChange={(e) =>
                                    updateFmtSlice(
                                      "fields",
                                      code,
                                      "start",
                                      Number(e.target.value),
                                    )
                                  }
                                />
                                <input
                                  type="number"
                                  value={f.length ?? f.end - f.start}
                                  onChange={(e) =>
                                    updateFmtSlice(
                                      "fields",
                                      code,
                                      "length",
                                      Number(e.target.value),
                                    )
                                  }
                                />
                                <input
                                  type="number"
                                  value={f.end}
                                  onChange={(e) =>
                                    updateFmtSlice(
                                      "fields",
                                      code,
                                      "end",
                                      Number(e.target.value),
                                    )
                                  }
                                />
                              </span>
                            ),
                          )}
                        </div>
                        <h3>Test / ders cevap blokları</h3>
                        <div
                          className="list-card"
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "1.3fr repeat(4, minmax(80px, 1fr))",
                            gap: 8,
                            alignItems: "end",
                          }}
                        >
                          <strong>Test</strong>
                          <strong>Başlangıç</strong>
                          <strong>Uzunluk</strong>
                          <strong>Bitiş</strong>
                          <strong>Soru</strong>
                          {Object.entries<any>(fmtDefinition.answers || {}).map(
                            ([code, f]) => (
                              <span key={code} style={{ display: "contents" }}>
                                <strong>{code}</strong>
                                <input
                                  type="number"
                                  value={f.start}
                                  onChange={(e) =>
                                    updateFmtSlice(
                                      "answers",
                                      code,
                                      "start",
                                      Number(e.target.value),
                                    )
                                  }
                                />
                                <input
                                  type="number"
                                  value={f.length ?? f.end - f.start}
                                  onChange={(e) =>
                                    updateFmtSlice(
                                      "answers",
                                      code,
                                      "length",
                                      Number(e.target.value),
                                    )
                                  }
                                />
                                <input
                                  type="number"
                                  value={f.end}
                                  onChange={(e) =>
                                    updateFmtSlice(
                                      "answers",
                                      code,
                                      "end",
                                      Number(e.target.value),
                                    )
                                  }
                                />
                                <input
                                  type="number"
                                  value={f.questionCount || f.end - f.start}
                                  onChange={(e) =>
                                    setFmtDefinition((d: any) => ({
                                      ...d,
                                      answers: {
                                        ...d.answers,
                                        [code]: {
                                          ...d.answers[code],
                                          questionCount: Number(e.target.value),
                                        },
                                      },
                                    }))
                                  }
                                />
                              </span>
                            ),
                          )}
                        </div>
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => void saveFmtMapping()}
                        >
                          <Save size={16} /> FMT Eşlemesini Kaydet
                        </button>
                      </>
                    )}
                  </div>
                )}
                {method === "PHOTO" && (
                  <div className="panel" style={{ marginBottom: 20 }}>
                    <div className="panel-head">
                      <div>
                        <h2>Fotoğraftan Optik Tanımla</h2>
                        <p>
                          Boş ve düz çekilmiş optik, okuma geometrisi ve kamera
                          doğrulaması için saklanır. Baskı tasarımı ayrı ekrandadır.
                        </p>
                      </div>
                      <Sparkles />
                    </div>
                    <div className="form-grid">
                      <label>
                        Optik fotoğrafı
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            setPhoto(e.target.files?.[0] || null);
                            setSuggestions([]);
                          }}
                        />
                      </label>
                      <label>
                        Alan türü
                        <select
                          value={regionKind}
                          onChange={(e) => setRegionKind(e.target.value)}
                        >
                          <option value="answers">Ders cevap alanı</option>
                          <option value="bubble-grid">
                            Öğrenci No / Kodlama
                          </option>
                          <option value="booklet">Kitapçık</option>
                        </select>
                      </label>
                      {regionKind === "answers" && (
                        <label>
                          Ders kodu
                          <input
                            value={regionSubject}
                            onChange={(e) =>
                              setRegionSubject(e.target.value.toUpperCase())
                            }
                            placeholder="MAT"
                          />
                        </label>
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        marginBottom: 12,
                      }}
                    >
                      <button
                        className="secondary"
                        disabled={!photo || busy}
                        onClick={() => void analysePhoto()}
                      >
                        <Sparkles size={16} /> Fotoğrafı Analiz Et
                      </button>
                      <button
                        className={
                          drawMode === "REGION" ? "primary" : "secondary"
                        }
                        onClick={() => setDrawMode("REGION")}
                      >
                        Alan Çiz
                      </button>
                      <button
                        className={
                          drawMode === "FIDUCIAL" ? "primary" : "secondary"
                        }
                        onClick={() => setDrawMode("FIDUCIAL")}
                      >
                        Referans Noktası
                      </button>
                      <button
                        className="ghost"
                        onClick={() => {
                          setRegions([]);
                          setFiducials([]);
                        }}
                      >
                        Temizle
                      </button>
                    </div>
                    {photoUrl && (
                      <div
                        onPointerDown={onDown}
                        onPointerMove={onMove}
                        onPointerUp={onUp}
                        style={{
                          position: "relative",
                          maxWidth: 850,
                          border: "1px solid var(--border,#e5e7eb)",
                          borderRadius: 12,
                          overflow: "hidden",
                          touchAction: "none",
                          cursor: drawMode === "REGION" ? "crosshair" : "copy",
                        }}
                      >
                        <img
                          src={photoUrl}
                          alt="Optik"
                          style={{
                            width: "100%",
                            display: "block",
                            pointerEvents: "none",
                          }}
                        />
                        {suggestions.map((s, i) => (
                          <button
                            key={i}
                            title="Öneriyi seçili alan türüyle ekle"
                            onClick={(e) => {
                              e.stopPropagation();
                              addRegion(s);
                            }}
                            style={{
                              position: "absolute",
                              left: `${s.xPct}%`,
                              top: `${s.yPct}%`,
                              width: `${s.wPct}%`,
                              height: `${s.hPct}%`,
                              border: "2px dashed #f59e0b",
                              background: "rgba(245,158,11,.08)",
                            }}
                          />
                        ))}
                        {regions.map((r) => (
                          <div
                            key={r.id}
                            style={{
                              position: "absolute",
                              left: `${(r.xMm / pageW) * 100}%`,
                              top: `${(r.yMm / pageH) * 100}%`,
                              width: `${(r.widthMm / pageW) * 100}%`,
                              height: `${(r.heightMm / pageH) * 100}%`,
                              border: "2px solid #2563eb",
                              background: "rgba(37,99,235,.12)",
                              pointerEvents: "none",
                              fontSize: 11,
                            }}
                          >
                            {r.subjectCode || r.type}
                          </div>
                        ))}
                        {fiducials.map((p, i) => (
                          <div
                            key={i}
                            style={{
                              position: "absolute",
                              left: `${(p[0] / pageW) * 100}%`,
                              top: `${(p[1] / pageH) * 100}%`,
                              width: 12,
                              height: 12,
                              borderRadius: "50%",
                              background: "#dc2626",
                              border: "2px solid white",
                              transform: "translate(-50%,-50%)",
                              pointerEvents: "none",
                            }}
                          />
                        ))}
                        {draft && (
                          <div
                            style={{
                              position: "absolute",
                              left: `${draft.xPct}%`,
                              top: `${draft.yPct}%`,
                              width: `${draft.wPct}%`,
                              height: `${draft.hPct}%`,
                              border: "2px solid #16a34a",
                              background: "rgba(22,163,74,.1)",
                              pointerEvents: "none",
                            }}
                          />
                        )}
                      </div>
                    )}
                    <div className="alert warning" style={{ marginTop: 12 }}>
                      Referans noktası yalnız optikte gerçekten bulunan hizalama
                      işaretidir. En az 3 gerçek nokta gerekir. İşaretlenen:{" "}
                      {fiducials.length}
                    </div>
                    {regions.map((r) => (
                      <div className="list-card" key={r.id}>
                        <div style={{ flex: 1 }}>
                          <strong>{r.subjectCode || r.type}</strong>
                          <span>
                            {r.xMm.toFixed(1)}, {r.yMm.toFixed(1)} ·{" "}
                            {r.widthMm.toFixed(1)}×{r.heightMm.toFixed(1)} mm
                          </span>
                        </div>
                        <button
                          className="ghost"
                          onClick={() =>
                            setRegions((x) => x.filter((z) => z.id !== r.id))
                          }
                        >
                          Sil
                        </button>
                      </div>
                    ))}
                    <button
                      className="primary"
                      disabled={
                        !photo ||
                        !regions.length ||
                        fiducials.length < 3 ||
                        busy
                      }
                      onClick={savePhoto}
                    >
                      <Save size={16} /> Fotoğraf Tanımını Kaydet
                    </button>
                  </div>
                )}
                {method === "TXT" && (
                  <div className="panel" style={{ marginBottom: 20 }}>
                    <div className="panel-head">
                      <div>
                        <h2>TXT / DAT / FMT parametreleri</h2>
                        <p>
                          Okulizyon’daki başlangıç–uzunluk mantığıyla alanları
                          tanımlayın. FMT koordinatlarını referans alıp gerçek
                          TXT/DAT satırıyla doğrulayabilirsiniz.
                        </p>
                      </div>
                      <FlaskConical />
                    </div>
                    <input
                      type="file"
                      accept=".txt,.dat,.fmt,text/plain"
                      onChange={(e) => void readSample(e.target.files?.[0])}
                    />
                    {fixed && (
                      <>
                        <div className="alert success">
                          Kayıt uzunluğu: {fixed.recordLength} · Olası cevap
                          bloğu: {fixed.answerBlocks.length}
                        </div>
                        <div className="form-grid">
                          {(
                            [
                              ["tcknStart", "T.C. Kimlik başlangıç"],
                              ["tcknEnd", "T.C. Kimlik bitiş"],
                              ["studentStart", "Öğrenci No başlangıç"],
                              ["studentEnd", "Öğrenci No bitiş"],
                              ["nameStart", "Ad Soyad başlangıç"],
                              ["nameEnd", "Ad Soyad bitiş"],
                              ["classStart", "Sınıf başlangıç"],
                              ["classEnd", "Sınıf bitiş"],
                              ["bookletStart", "Kitapçık başlangıç"],
                              ["bookletEnd", "Kitapçık bitiş"],
                            ] as Array<[keyof typeof fieldRanges, string]>
                          ).map(([k, l]) => (
                            <label key={k}>
                              {l}
                              <input
                                type="number"
                                value={fieldRanges[k]}
                                onChange={(e) =>
                                  setFieldRanges((x) => ({
                                    ...x,
                                    [k]: Number(e.target.value),
                                  }))
                                }
                              />
                            </label>
                          ))}
                        </div>
                        <h3>Cevap blokları</h3>
                        {answerRanges.map((r, i) => (
                          <div className="form-grid" key={i}>
                            <label>
                              Ders kodu
                              <input
                                value={r.subjectCode}
                                onChange={(e) =>
                                  setAnswerRanges((x) =>
                                    x.map((z, j) =>
                                      j === i
                                        ? {
                                            ...z,
                                            subjectCode:
                                              e.target.value.toUpperCase(),
                                          }
                                        : z,
                                    ),
                                  )
                                }
                              />
                            </label>
                            <label>
                              Başlangıç
                              <input
                                type="number"
                                value={r.start}
                                onChange={(e) =>
                                  setAnswerRanges((x) =>
                                    x.map((z, j) =>
                                      j === i
                                        ? {
                                            ...z,
                                            start: Number(e.target.value),
                                          }
                                        : z,
                                    ),
                                  )
                                }
                              />
                            </label>
                            <label>
                              Bitiş
                              <input
                                type="number"
                                value={r.end}
                                onChange={(e) =>
                                  setAnswerRanges((x) =>
                                    x.map((z, j) =>
                                      j === i
                                        ? { ...z, end: Number(e.target.value) }
                                        : z,
                                    ),
                                  )
                                }
                              />
                            </label>
                          </div>
                        ))}
                        <button
                          className="secondary"
                          onClick={() =>
                            setAnswerRanges((x) => [
                              ...x,
                              { subjectCode: "", start: 0, end: 0 },
                            ])
                          }
                        >
                          <Plus size={15} /> Cevap Bloğu Ekle
                        </button>
                        <button
                          className="primary"
                          disabled={
                            busy ||
                            fieldRanges.nameEnd <= fieldRanges.nameStart ||
                            !answerRanges.some(
                              (x) => x.subjectCode && x.end > x.start,
                            )
                          }
                          onClick={saveParser}
                        >
                          <FlaskConical size={16} /> Parametreleri Kaydet ve
                          Gerçek Dosyayla Test Et
                        </button>
                        {parserTest && (
                          <div
                            className={
                              parserTest.passed
                                ? "alert success"
                                : "alert error"
                            }
                          >
                            <strong>
                              {parserTest.passed
                                ? "Test başarılı"
                                : "Test başarısız"}
                            </strong>{" "}
                            · {parserTest.recordCount} kayıt · %
                            {Math.round((parserTest.confidence || 0) * 100)}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
                {false && <div className="panel" style={{ marginBottom: 20 }}>
                  <div className="panel-head">
                    <div>
                      <h2>Kişiye özel baskı alanları</h2>
                      <p>
                        Başlangıç alanları otomatik gelir. Gerçek boş optikte
                        ad, öğrenci no, sınıf, kitapçık ve sınav alanlarına göre
                        yalnız X/Y konumlarını ince ayarlayın.
                      </p>
                    </div>
                  </div>
                  <div className="alert info">
                    Bu baskı tanımı, aynı optiğin kamera/TXT tanımıyla birlikte
                    sürümlenir. Bir kez doğruladığınızda Optik Hazırla / Bas
                    ekranında kalıcı şablon olur.
                  </div>
                  <button
                    className="secondary"
                    onClick={() =>
                      setPrintFields((x) => [
                        ...x,
                        { key: "studentName", xMm: 0, yMm: 0 },
                      ])
                    }
                  >
                    <Plus size={15} /> Alan Ekle
                  </button>
                  {printFields.map((f, i) => (
                    <div className="form-grid" key={i}>
                      <label>
                        Alan
                        <select
                          value={f.key}
                          onChange={(e) =>
                            setPrintFields((x) =>
                              x.map((z, j) =>
                                j === i ? { ...z, key: e.target.value } : z,
                              ),
                            )
                          }
                        >
                          <option value="studentName">Ad Soyad</option>
                          <option value="studentNumber">Öğrenci No</option>
                          <option value="class">Sınıf</option>
                          <option value="section">Şube</option>
                          <option value="institutionCode">Kurum Kodu</option>
                          <option value="bookletCode">Kitapçık Kodu</option>
                          <option value="examTitle">Sınav Adı</option>
                          <option value="examCode">Sınav Kodu</option>
                          <option value="qr">QR</option>
                          <option value="barcode">Barkod</option>
                          <option value="studentNumberBubbles">
                            Öğrenci No Baloncukları
                          </option>
                        </select>
                      </label>
                      <label>
                        X mm
                        <input
                          type="number"
                          step="0.1"
                          value={f.xMm}
                          onChange={(e) =>
                            setPrintFields((x) =>
                              x.map((z, j) =>
                                j === i
                                  ? { ...z, xMm: Number(e.target.value) }
                                  : z,
                              ),
                            )
                          }
                        />
                      </label>
                      <label>
                        Y mm
                        <input
                          type="number"
                          step="0.1"
                          value={f.yMm}
                          onChange={(e) =>
                            setPrintFields((x) =>
                              x.map((z, j) =>
                                j === i
                                  ? { ...z, yMm: Number(e.target.value) }
                                  : z,
                              ),
                            )
                          }
                        />
                      </label>
                      <button
                        className="ghost"
                        onClick={() =>
                          setPrintFields((x) => x.filter((_, j) => j !== i))
                        }
                      >
                        Sil
                      </button>
                    </div>
                  ))}
                  <button
                    className="primary"
                    disabled={!printFields.length || busy}
                    onClick={savePrint}
                  >
                    <Save size={16} /> Baskı Alanlarını Kaydet
                  </button>
                </div>}
                <div className="panel optical-definition-separation" style={{ marginBottom: 20 }}>
                  <div className="panel-head">
                    <div>
                      <h2>Baskı tasarımı ayrı çalışma alanında</h2>
                      <p>
                        Öğrenci, sınıf, kitapçık, QR ve diğer basılacak alanları
                        Optik Form Tasarımcısı ekranında konumlandırın. Bu ekran
                        yalnız okuma geometrisini ve dosya eşlemesini yönetir.
                      </p>
                    </div>
                    <Link className="secondary" to={`/optical-design?versionId=${selectedVersionId}`}>
                      Optik Form Tasarımcısını Aç
                    </Link>
                  </div>
                </div>
                {method === "MANUAL" && (
                  <div className="panel" style={{ marginBottom: 20 }}>
                    <div className="panel-head">
                      <div>
                        <h2>Manuel optik tanımı</h2>
                        <p>
                          Okulizyon’daki Baş./Uz. mantığıyla alanları seçin.
                          Kurum kendi optiğini FMT olmadan da kayıt uzunluğu ve
                          parametreleri girerek tanımlayabilir.
                        </p>
                      </div>
                      <MousePointer2 />
                    </div>
                    <div className="form-grid">
                      <label>
                        Form adı
                        <input
                          value={templateDetail?.template?.name || ""}
                          readOnly
                        />
                      </label>
                      <label>
                        Kayıt uzunluğu
                        <input
                          type="number"
                          min="1"
                          value={manualRecordLength || ""}
                          onChange={(e) =>
                            setManualRecordLength(Number(e.target.value))
                          }
                          placeholder="Örn. 222"
                        />
                      </label>
                      <label>
                        Başlangıç tabanı
                        <select
                          value={manualIndexBase}
                          onChange={(e) =>
                            setManualIndexBase(
                              Number(e.target.value) === 1 ? 1 : 0,
                            )
                          }
                        >
                          <option value="0">0 tabanlı</option>
                          <option value="1">1 tabanlı (FMT)</option>
                        </select>
                      </label>
                    </div>
                    <div className="alert info">
                      Başlangıç ve uzunluk değerleri kayıt satırındaki karakter
                      konumlarıdır. Sistem bitişi otomatik hesaplar; Ad Soyad ve
                      en az bir Test alanı zorunludur.
                    </div>
                    <h3>Kimlik ve form alanları</h3>
                    <div className="optical-manual-table">
                      <div className="optical-manual-row optical-manual-head">
                        <span>Alan</span>
                        <span>Aktif</span>
                        <span>Baş.</span>
                        <span>Uz.</span>
                        <span>Bitiş</span>
                      </div>
                      {manualFields.map((field) => (
                        <div className="optical-manual-row" key={field.key}>
                          <strong>{field.label}</strong>
                          <input
                            type="checkbox"
                            checked={field.enabled}
                            onChange={(e) =>
                              setManualFields((items) =>
                                items.map((item) =>
                                  item.key === field.key
                                    ? { ...item, enabled: e.target.checked }
                                    : item,
                                ),
                              )
                            }
                          />
                          <input
                            type="number"
                            min="0"
                            disabled={!field.enabled}
                            value={field.start}
                            onChange={(e) =>
                              setManualFields((items) =>
                                items.map((item) =>
                                  item.key === field.key
                                    ? { ...item, start: Number(e.target.value) }
                                    : item,
                                ),
                              )
                            }
                          />
                          <input
                            type="number"
                            min="0"
                            disabled={!field.enabled}
                            value={field.length}
                            onChange={(e) =>
                              setManualFields((items) =>
                                items.map((item) =>
                                  item.key === field.key
                                    ? {
                                        ...item,
                                        length: Number(e.target.value),
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                          <span>
                            {field.enabled && field.length > 0
                              ? field.start + field.length
                              : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                    <h3>Test / cevap alanları</h3>
                    <div className="optical-manual-table">
                      <div className="optical-manual-row optical-manual-head">
                        <span>Test</span>
                        <span>Aktif</span>
                        <span>Baş.</span>
                        <span>Uz.</span>
                        <span>Soru / Şık</span>
                      </div>
                      {manualAnswers.map((block, index) => (
                        <div
                          className="optical-manual-row"
                          key={`${block.code}-${index}`}
                        >
                          <input
                            value={block.code}
                            disabled={!block.enabled}
                            onChange={(e) =>
                              setManualAnswers((items) =>
                                items.map((item, i) =>
                                  i === index
                                    ? {
                                        ...item,
                                        code: e.target.value.toUpperCase(),
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                          <input
                            type="checkbox"
                            checked={block.enabled}
                            onChange={(e) =>
                              setManualAnswers((items) =>
                                items.map((item, i) =>
                                  i === index
                                    ? { ...item, enabled: e.target.checked }
                                    : item,
                                ),
                              )
                            }
                          />
                          <input
                            type="number"
                            min="0"
                            disabled={!block.enabled}
                            value={block.start}
                            onChange={(e) =>
                              setManualAnswers((items) =>
                                items.map((item, i) =>
                                  i === index
                                    ? { ...item, start: Number(e.target.value) }
                                    : item,
                                ),
                              )
                            }
                          />
                          <input
                            type="number"
                            min="0"
                            disabled={!block.enabled}
                            value={block.length}
                            onChange={(e) =>
                              setManualAnswers((items) =>
                                items.map((item, i) =>
                                  i === index
                                    ? {
                                        ...item,
                                        length: Number(e.target.value),
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                          <span className="optical-manual-answer-meta">
                            <input
                              type="number"
                              min="1"
                              disabled={!block.enabled}
                              value={block.questionCount}
                              onChange={(e) =>
                                setManualAnswers((items) =>
                                  items.map((item, i) =>
                                    i === index
                                      ? {
                                          ...item,
                                          questionCount: Number(e.target.value),
                                        }
                                      : item,
                                  ),
                                )
                              }
                            />
                            <select
                              disabled={!block.enabled}
                              value={block.options}
                              onChange={(e) =>
                                setManualAnswers((items) =>
                                  items.map((item, i) =>
                                    i === index
                                      ? {
                                          ...item,
                                          options:
                                            Number(e.target.value) === 4
                                              ? 4
                                              : 5,
                                        }
                                      : item,
                                  ),
                                )
                              }
                            >
                              <option value="4">4 şık</option>
                              <option value="5">5 şık</option>
                            </select>
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="form-grid" style={{ marginTop: 14 }}>
                      <label>
                        Gerçek TXT / DAT örneği ile doğrula
                        <input
                          type="file"
                          accept=".txt,.dat,.csv,text/plain,text/csv"
                          onChange={(e) => void readSample(e.target.files?.[0])}
                        />
                      </label>
                      <div className="alert info">
                        {sample
                          ? `${sample.name} seçildi; kaydetme sırasında parser testi çalışır.`
                          : "Örnek dosya seçilmezse tanım taslak olarak kaydedilir ve yayın kilidi açık kalır."}
                      </div>
                    </div>
                    <button
                      className="primary"
                      disabled={busy || !manualRecordLength}
                      onClick={() => void saveManualDefinition()}
                    >
                      <Save size={16} /> Parametreleri Kaydet ve Test Et
                    </button>
                  </div>
                )}
                {method === "MANUAL" && (
                  <div className="panel" style={{ marginBottom: 20 }}>
                    <h2>Manuel / Gelişmiş JSON</h2>
                    {(
                      ["parser", "camera", "fiducials"] as Section[]
                    ).map((section) => (
                      <details key={section}>
                        <summary>{section.toUpperCase()}</summary>
                        <textarea
                          rows={10}
                          value={advanced[section] || pretty(EXAMPLES[section])}
                          onChange={(e) =>
                            setAdvanced((x) => ({
                              ...x,
                              [section]: e.target.value,
                            }))
                          }
                          style={{
                            width: "100%",
                            fontFamily: "ui-monospace,monospace",
                          }}
                        />
                        <button
                          className="secondary"
                          onClick={() => void saveAdvanced(section)}
                        >
                          <Save size={15} /> Kaydet
                        </button>
                      </details>
                    ))}
                  </div>
                )}
              </>
            )}
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h2>Yayın kontrolü</h2>
                  <p>
                    READY için FMT/Parser tanımı ve örnek kayıt testi,
                    fotoğraf/kamera, gerçek referans noktaları ve baskı tasarımı
                    tamamlanır. TXT/DAT örneği FMT tanımının çalıştığını
                    kanıtlamak için kullanılabilir. Baskı tasarımını ayrı
                    çalışma alanında tamamlayın.
                  </p>
                </div>
                {readiness?.ready ? <CheckCircle2 /> : <CircleAlert />}
              </div>
              {!readiness?.ready && (
                <div className="alert warning">
                  {(readiness?.errors || []).join(" · ")}
                </div>
              )}
              <button
                className="primary"
                disabled={!readiness?.ready || selectedVersion?.active || busy}
                onClick={publish}
              >
                <Send size={16} /> Optiği Yayınla
              </button>
              <Link
                className="secondary"
                to={`/optical-design?versionId=${selectedVersionId}`}
                style={{ marginLeft: 8 }}
              >
                Baskı tasarımına geç
              </Link>
            </div>
            <div className="panel" style={{ marginTop: 20 }}>
              <div className="panel-head">
                <div>
                  <h2>Referans dosyaları</h2>
                  <p>
                    Boş form baskı tabanı, fotoğraf ve TXT/DAT örnekleri sürüme
                    bağlı saklanır.
                  </p>
                </div>
                <FileUp />
              </div>
              {(versionDetail.assets || []).map((a: any) => (
                <div className="list-card" key={a.id}>
                  <div>
                    <strong>{assetLabel(a.asset_type)}</strong>
                    <span>{a.file_name}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
