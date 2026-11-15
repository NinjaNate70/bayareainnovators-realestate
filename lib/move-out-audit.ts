import type { Assessment, Category } from './inspection-comparison';

export type AuditStatus = 'awaiting_photos' | 'queued' | 'inspecting' | 'review_queued' | 'reviewing' | 'completed' | 'needs_review' | 'failed';
export type AuditFinding = Pick<Assessment, 'status' | 'category' | 'summary'>;
export type AuditRoom = {
  id: string;
  audit_id: string;
  room_id: string;
  before_id: string | null;
  after_id: string | null;
  status: AuditStatus;
  category: Category | null;
  condition_finding: AuditFinding | null;
  evidence_finding: AuditFinding | null;
};

export const auditRoomColumns = 'id, audit_id, room_id, before_id, after_id, status, category, condition_finding, evidence_finding';

export function resolveAuditFinding(condition: AuditFinding, evidence: AuditFinding) {
  if (condition.status === 'ready' && evidence.status === 'ready' && condition.category && condition.category === evidence.category) {
    return { status: 'completed', category: condition.category } as const;
  }
  return { status: 'needs_review', category: null } as const;
}

export function summarizeAudit(statuses: AuditStatus[]) {
  const completed = statuses.filter((status) => status === 'completed').length;
  const needsAttention = statuses.filter((status) => ['awaiting_photos', 'needs_review', 'failed'].includes(status)).length;
  return { total: statuses.length, completed, working: statuses.length - completed - needsAttention, needsAttention };
}
