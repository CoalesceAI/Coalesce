"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://coalesce-production.up.railway.app";

function snippet(lang: string, slug: string): string {
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
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="text-sm text-zinc-300">
          Integration Snippet
        </CardTitle>
        <p className="text-xs text-zinc-500">
          Add these fields to your API error responses so agents can self-heal.
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="javascript">
          <TabsList className="bg-zinc-800 border-zinc-700">
            <TabsTrigger value="javascript" className="text-xs data-[state=active]:bg-zinc-700">
              JavaScript
            </TabsTrigger>
            <TabsTrigger value="python" className="text-xs data-[state=active]:bg-zinc-700">
              Python
            </TabsTrigger>
            <TabsTrigger value="curl" className="text-xs data-[state=active]:bg-zinc-700">
              cURL
            </TabsTrigger>
          </TabsList>
          {["javascript", "python", "curl"].map((lang) => (
            <TabsContent key={lang} value={lang} className="mt-3">
              <div className="relative">
                <pre className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-xs font-mono text-zinc-300 overflow-x-auto">
                  {snippet(lang, slug)}
                </pre>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copy(lang)}
                  className="absolute top-2 right-2 text-xs text-zinc-400 hover:text-zinc-100 h-7"
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
