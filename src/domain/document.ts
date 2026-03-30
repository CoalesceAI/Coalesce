export interface DocSource {
  id: string;
  org_id: string;
  source_type: string;
  source_path: string;
  loaded_at: Date;
  status: string;
  config: Record<string, unknown>;
  error_message: string | null;
  last_sync_at: Date | null;
}

export interface DocContent {
  id: string;
  org_id: string;
  source_id: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: Date;
}
