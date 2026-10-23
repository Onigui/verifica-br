import type { Queryable } from "./client.ts";

export interface Job {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
}

export async function enqueueJob(q: Queryable, type: string, payload: Record<string, unknown>, maxAttempts = 2): Promise<string> {
  const [row] = await q<{ id: string }[]>`INSERT INTO jobs (type, payload, max_attempts) VALUES (${type}, ${q.json(payload as never)}, ${maxAttempts}) RETURNING id`;
  return row!.id;
}

/** Devolve à fila jobs travados por execuções que morreram (ex.: runner cancelado). */
export async function requeueStale(q: Queryable, olderThanMinutes = 20): Promise<number> {
  const rows = await q`UPDATE jobs SET status = 'queued', locked_at = NULL, last_error = 'execução anterior interrompida'
                       WHERE status = 'running' AND locked_at < now() - make_interval(mins => ${olderThanMinutes}) RETURNING id`;
  return rows.length;
}

/** Pega o próximo job de forma segura entre workers concorrentes (SKIP LOCKED). */
export async function claimNextJob(q: Queryable): Promise<Job | undefined> {
  const [row] = await q<Job[]>`
    UPDATE jobs SET status = 'running', locked_at = now(), attempts = attempts + 1
    WHERE id = (
      SELECT id FROM jobs WHERE status = 'queued' AND run_after <= now() AND attempts < max_attempts
      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
    )
    RETURNING id, type, payload, attempts, max_attempts`;
  return row;
}

export async function completeJob(q: Queryable, id: string): Promise<void> {
  await q`UPDATE jobs SET status = 'succeeded', locked_at = NULL, finished_at = now() WHERE id = ${id}`;
}

/** Falha com nova tentativa (com espera crescente) até max_attempts; depois, falha definitiva. */
export async function failJob(q: Queryable, job: Job, error: string, retryable = true): Promise<"queued" | "failed"> {
  const final = !retryable || job.attempts >= job.maxAttempts;
  await q`UPDATE jobs SET status = ${final ? "failed" : "queued"}, locked_at = NULL, last_error = ${error.slice(0, 4000)},
            run_after = now() + make_interval(mins => ${job.attempts * 5}), finished_at = ${final ? new Date() : null}
          WHERE id = ${job.id}`;
  return final ? "failed" : "queued";
}

/** Devolve um job à fila sem consumir tentativa (ex.: sistema pausado). */
export async function releaseJob(q: Queryable, id: string, reason: string): Promise<void> {
  await q`UPDATE jobs SET status = 'queued', locked_at = NULL, attempts = GREATEST(attempts - 1, 0), last_error = ${reason} WHERE id = ${id}`;
}
