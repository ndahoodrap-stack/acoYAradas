import type { DbExecutor } from '../db/index.js';

export interface AuditEntry {
  actorId?: string | null;
  actorRole?: string | null;
  actorName?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

/**
 * Registra una acción relevante para auditoría.
 * La escritura se hace con los claims del actor: la política de RLS exige
 * que el actor sea el propio usuario o un administrador.
 */
export async function audit(tx: DbExecutor, entry: AuditEntry): Promise<void> {
  await tx.query(
    `insert into public.audit_log
       (actor_id, actor_role, actor_name, action, entity_type, entity_id, metadata, ip)
     values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
    [
      entry.actorId ?? null,
      entry.actorRole ?? null,
      entry.actorName ?? null,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      JSON.stringify(entry.metadata ?? {}),
      entry.ip ?? null,
    ],
  );
}
