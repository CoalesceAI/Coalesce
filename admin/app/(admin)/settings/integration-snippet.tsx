"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCoalesceApiBase } from "@/lib/api-base";
import { Copy, Check } from "lucide-react";

type Lang = "javascript" | "python" | "curl";

const LANGS: { id: Lang; label: string }[] = [
  { id: "javascript", label: "JavaScript" },
  { id: "python", label: "Python" },
  { id: "curl", label: "cURL" },
];

/** Multi-line snippets so long URLs don’t require horizontal panning; container still scrolls if needed. */
function snippet(lang: Lang, slug: string): string {
  const API_BASE = getCoalesceApiBase();
  const supportPath = `${API_BASE}/support/${slug}`;
  if (lang === "javascript") {
    return `// Add to your error response handler
const errorResponse = {
  error: "Your error message",
  code: "ERROR_CODE",
  support:
    "${supportPath}?endpoint=/your-endpoint&error_code=ERROR_CODE",
  support_hint:
    "POST {} to the support URL for real-time diagnosis",
};`;
  }
  if (lang === "python") {
    return `# Add to your error response handler
error_response = {
    "error": "Your error message",
    "code": "ERROR_CODE",
    "support": "${supportPath}?endpoint=/your-endpoint&error_code=ERROR_CODE",
    "support_hint": "POST {} to the support URL for real-time diagnosis",
}`;
  }
  return `# Test the support endpoint
curl -X POST "${supportPath}" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"endpoint": "/your-endpoint", "error_code": "ERROR_CODE"}'`;
}

export function IntegrationSnippet({
  slug,
  orgName,
}: {
  slug: string;
  orgName: string;
}) {
  const [lang, setLang] = useState<Lang>("javascript");
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(snippet(lang, slug));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const code = snippet(lang, slug);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How Coalesce works</CardTitle>
          <CardDescription>
            Add two fields to your API error responses:{" "}
            <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">support</code> and{" "}
            <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">support_hint</code>.
            Agents POST to the support URL and receive a structured diagnosis.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Organization: <span className="font-medium text-foreground">{orgName}</span>
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <Badge variant="outline" className="text-xs font-mono">
                  support
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                URL agents call when they hit an error (includes your org slug in the path).
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <Badge variant="outline" className="text-xs font-mono">
                  support_hint
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Short instruction so models know to POST to the URL above.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-4">
          <div>
            <CardTitle className="text-base">Integration snippet</CardTitle>
            <CardDescription>
              Choose a language, then copy into your error response builder.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2 w-full sm:max-w-xs">
              <Label htmlFor="snippet-lang" className="text-xs text-muted-foreground">
                Language
              </Label>
              <Select
                value={lang}
                onValueChange={(v) => setLang(v as Lang)}
              >
                <SelectTrigger id="snippet-lang" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGS.map(({ id, label }) => (
                    <SelectItem key={id} value={id}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="shrink-0 gap-2"
              onClick={copy}
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy snippet
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border bg-muted/50">
            <div
              className="max-h-[min(22rem,55vh)] overflow-auto overscroll-contain rounded-lg"
              tabIndex={0}
            >
              <pre
                className="p-4 text-xs font-mono text-foreground/90 leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
              >
                {code}
              </pre>
            </div>
            <p className="px-4 pb-3 text-[11px] text-muted-foreground border-t border-border/60 pt-2">
              Scroll if needed. The snippet uses your live API base and org slug so it works when pasted as-is.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
