"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getApoyoApiBase } from "@/lib/api-base";

function snippet(lang: string, slug: string): string {
  const API_BASE = getApoyoApiBase();
  if (lang === "javascript") {
    return `// Add to your error response handler
const errorResponse = {
  error: "Your error message",
  code: "ERROR_CODE",
  support: "${API_BASE}/support/${slug}?endpoint=/your-endpoint&error_code=ERROR_CODE",
  support_hint: "POST {} to the support URL for real-time diagnosis"
};`;
  }
  if (lang === "python") {
    return `# Add to your error response handler
error_response = {
    "error": "Your error message",
    "code": "ERROR_CODE",
    "support": f"${API_BASE}/support/${slug}?endpoint=/your-endpoint&error_code=ERROR_CODE",
    "support_hint": "POST {} to the support URL for real-time diagnosis"
}`;
  }
  if (lang === "curl") {
    return `# Test the support endpoint
curl -X POST "${API_BASE}/support/${slug}" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"endpoint": "/your-endpoint", "error_code": "ERROR_CODE"}'`;
  }
  return "";
}

export function IntegrationSnippet({ slug }: { slug: string }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(lang: string) {
    await navigator.clipboard.writeText(snippet(lang, slug));
    setCopied(lang);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          Integration Snippet
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Add these fields to your API error responses so agents can self-heal.
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="javascript">
          <TabsList>
            <TabsTrigger value="javascript" className="text-xs">
              JavaScript
            </TabsTrigger>
            <TabsTrigger value="python" className="text-xs">
              Python
            </TabsTrigger>
            <TabsTrigger value="curl" className="text-xs">
              cURL
            </TabsTrigger>
          </TabsList>
          {["javascript", "python", "curl"].map((lang) => (
            <TabsContent key={lang} value={lang} className="mt-3">
              <div className="relative">
                <pre className="bg-muted border border-border rounded-lg p-4 text-xs font-mono text-foreground/80 overflow-x-auto">
                  {snippet(lang, slug)}
                </pre>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copy(lang)}
                  className="absolute top-2 right-2 text-xs text-muted-foreground hover:text-foreground h-7"
                >
                  {copied === lang ? "Copied!" : "Copy"}
                </Button>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
