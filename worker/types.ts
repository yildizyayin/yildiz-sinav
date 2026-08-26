export type Role = 'SUPER_ADMIN' | 'INSTITUTION_MANAGER' | 'TEACHER' | 'GUIDANCE_TEACHER' | 'STUDENT' | 'PARENT';

export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  AI?: Ai;
  ENVIRONMENT?: string;
  PRODUCT_NAME?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  SESSION_SECRET?: string;
  // Backward-compatible single model override. Prefer the smart router variables below.
  NIBIRU_AI_MODEL?: string;
  NIBIRU_AI_GATEWAY_ID?: string;
  NIBIRU_ROUTER_MODE?: 'SMART' | 'FAST_ONLY' | 'LEGACY';
  NIBIRU_FAST_MODEL?: string;
  NIBIRU_META_MODEL?: string;
  NIBIRU_REASONING_MODEL?: string;
  NIBIRU_CUSTOM_MODEL?: string;
  NIBIRU_CUSTOM_MODEL_MODE?: 'PRIMARY' | 'FALLBACK' | 'OFF';
  YOUTUBE_API_KEY?: string;
  WHATSAPP_VERIFY_TOKEN?: string;
  WHATSAPP_APP_SECRET?: string;
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_GRAPH_API_VERSION?: string;
}

export interface AuthUser {
  id: string;
  institution_id: string | null;
  student_id: string | null;
  role: Role;
  display_name: string;
  email: string | null;
  username: string | null;
}

export interface CanonicalRecord {
  row_no: number;
  student_number?: string;
  name: string;
  class_name?: string;
  grade_level?: number;
  section?: string;
  booklet?: string;
  answers_by_subject: Record<string, string>;
  source_type: 'TXT' | 'DAT' | 'CSV' | 'CAMERA' | 'TRANSFER';
  source_template?: string;
  confidence: number;
  issues: string[];
}

export interface MatchCandidate {
  student_id: string;
  status: 'ACTIVE' | 'GUEST' | 'ARCHIVED';
  normalized_name: string;
  student_number: string | null;
  grade_level: number | null;
  section: string | null;
}

export interface MatchResult {
  status: 'ACTIVE_MATCH' | 'GUEST_MATCH' | 'NEW_GUEST' | 'AMBIGUOUS' | 'INVALID';
  student_id?: string;
  confidence: number;
  issues: string[];
  candidates?: string[];
}

export interface PermissionScope {
  role: Role;
  institutionId: string | null;
  studentId: string | null;
  subjectIds: string[];
  classIds: string[];
  guidanceClassIds: string[];
  subjectClassAssignments: Array<{ classId: string; subjectId: string }>;
}
