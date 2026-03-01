import type {
  CoalesceEvent,
  IngestResponse,
  CoalesceClientOptions,
} from "./types";

export class CoalesceClient {
  private apiKey: string;
  private baseUrl: string;
  private queue: CoalesceEvent[];
  private batchSize: number;
  private flushInterval: number;
  private timer: ReturnType<typeof setInterval> | null;

  constructor(options: CoalesceClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://app.coalesce.ai";
    this.batchSize = options.batchSize ?? 10;
    this.flushInterval = options.flushInterval ?? 5000;
    this.queue = [];
    this.timer = null;
  }

  capture(event: CoalesceEvent): void {
    const withTimestamp: CoalesceEvent = {
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString(),
    };
    this.queue.push(withTimestamp);

    if (this.queue.length >= this.batchSize) {
      this.flush().catch(console.error);
    }

    if (!this.timer) {
      this.timer = setInterval(() => {
        if (this.queue.length > 0) {
          this.flush().catch(console.error);
        }
      }, this.flushInterval);
    }
  }

  async flush(): Promise<IngestResponse[]> {
    if (this.queue.length === 0) return [];

    const batch = this.queue.splice(0, this.batchSize);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/api/events/ingest`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({ events: batch }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        const data = (await response.json()) as { results: IngestResponse[] };
        return data.results;
      } catch (err) {
        const isLastAttempt = attempt === 2;
        if (isLastAttempt) {
          this.queue.unshift(...batch);
          console.error(
            "[CoalesceSDK] Failed to flush events after 3 attempts:",
            err
          );
          return [];
        }
        await new Promise((r) => setTimeout(r, 200 * Math.pow(2, attempt)));
      }
    }

    return [];
  }

  shutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
