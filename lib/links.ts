// Links de tarefa: Docs, Drive, Canva etc. Só http e https.

export function normalizarUrl(bruto: string): string | null {
  const t = bruto.trim();
  if (!t) return null;
  const comEsquema = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(comEsquema);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString().slice(0, 1000);
  } catch {
    return null;
  }
}

export function rotuloLink(url: string, titulo?: string | null): string {
  if (titulo && titulo.trim()) return titulo.trim();
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, "");
    if (h === "docs.google.com") {
      if (u.pathname.startsWith("/document")) return "Google Docs";
      if (u.pathname.startsWith("/spreadsheets")) return "Google Sheets";
      if (u.pathname.startsWith("/presentation")) return "Google Slides";
      if (u.pathname.startsWith("/forms")) return "Google Forms";
      return "Google Docs";
    }
    if (h === "drive.google.com") return "Google Drive";
    if (h.endsWith("canva.com")) return "Canva";
    if (h.endsWith("figma.com")) return "Figma";
    if (h.endsWith("clickup.com")) return "ClickUp";
    if (h.endsWith("notion.so") || h.endsWith("notion.site")) return "Notion";
    return h;
  } catch {
    return "Link";
  }
}
