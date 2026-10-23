import { claimNextJob, completeJob, failJob, getSettings, releaseJob, requeueStale, type Job, type Sql } from "@verifica-br/db";
import { ConfigError, NonRetryableError, PausedError } from "./investigate.ts";

export type JobHandler = (job: Job) => Promise<unknown>;

export interface WorkerReport {
  processed: number;
  succeeded: number;
  failed: number;
  requeued: number;
  stoppedBecause: "queue_empty" | "max_jobs" | "paused" | "config_error";
  error?: string;
}

/**
 * Processa até `maxJobs` jobs e termina — formato adequado a execuções agendadas (GitHub Actions).
 * Pausa (kill switch) devolve o job à fila sem consumir tentativa: nada se perde.
 */
export async function runWorker(sql: Sql, handlers: Record<string, JobHandler>, maxJobs: number): Promise<WorkerReport> {
  const report: WorkerReport = { processed: 0, succeeded: 0, failed: 0, requeued: 0, stoppedBecause: "queue_empty" };
  await requeueStale(sql);

  while (report.processed < maxJobs) {
    if ((await getSettings(sql)).killSwitch) {
      report.stoppedBecause = "paused";
      return report;
    }
    const job = await claimNextJob(sql);
    if (!job) return report;
    report.processed++;

    const handler = handlers[job.type];
    try {
      if (!handler) throw new NonRetryableError(`tipo de job desconhecido: ${job.type}`);
      await handler(job);
      await completeJob(sql, job.id);
      report.succeeded++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof PausedError || err instanceof ConfigError) {
        await releaseJob(sql, job.id, message);
        report.requeued++;
        report.stoppedBecause = err instanceof PausedError ? "paused" : "config_error";
        if (err instanceof ConfigError) report.error = message;
        return report;
      }
      const outcome = await failJob(sql, job, message, !(err instanceof NonRetryableError));
      if (outcome === "failed") report.failed++;
      else report.requeued++;
      console.error(`[worker] job ${job.id} (${job.type}) falhou: ${message}`);
    }
  }
  report.stoppedBecause = "max_jobs";
  return report;
}
