export interface Organization {
  id: string;
  slug: string;
  name: string;
  settings: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}
