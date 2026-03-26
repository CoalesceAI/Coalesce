export interface Organization {
  id: string;
  slug: string;
  name: string;
  settings: Record<string, unknown>;
  signing_secret: string;
  created_at: Date;
  updated_at: Date;
}
