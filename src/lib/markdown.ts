/**
 * Minimal, safe Markdown → HTML renderer for AI-generated project content.
 * Escapes all input HTML first, then applies a focused subset of Markdown:
 * headings, bold/italic, inline code, fenced code blocks, lists, blockquotes,
 * links (http/https only), horizontal rules and paragraphs.
 */

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeHref(url: string): string | null {
  const trimmed = url.trim();
  return /^(https?:\/\/|\/|#|mailto:)/i.test(trimmed) ? trimmed : null;
}

function inline(input: string): string {
  let out = input;

  // inline code first so its contents are not processed further
  out = out.replace(/`([^`]+)`/g, (_m, code: string) => `<code class="rounded bg-[var(--code-bg)] px-1.5 py-0.5 text-[0.9em] text-accent-600 dark:text-accent-300">${code}</code>`);

  // images
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt: string, url: string) => {
    const href = safeHref(url);
    return href ? `<img src="${href}" alt="${alt}" class="my-3 max-w-full rounded-lg border border-[var(--border)]" loading="lazy" />` : m;
  });

  // links
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text: string, url: string) => {
    const href = safeHref(url);
    return href
      ? `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-accent-600 underline decoration-accent-500/40 underline-offset-4 hover:decoration-accent-500 dark:text-accent-400">${text}</a>`
      : text;
  });

  // bold / italic
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");

  return out;
}

export function markdownToHtml(markdown: string): string {
  const escaped = escapeHtml(markdown);
  const lines = escaped.split("\n");
  const html: string[] = [];

  let paragraph: string[] = [];
  let list: string[] = [];
  let ordered = false;
  let codeBlock: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p class="mb-4 leading-relaxed text-[var(--muted)]">${inline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };

  const flushList = () => {
    if (list.length) {
      const items = list.map((item) => `<li class="mb-1.5">${inline(item)}</li>`).join("");
      html.push(
        ordered
          ? `<ol class="mb-5 ml-5 list-decimal space-y-1.5 text-[var(--muted)]">${items}</ol>`
          : `<ul class="mb-5 ml-5 list-disc space-y-1.5 text-[var(--muted)]">${items}</ul>`
      );
      list = [];
      ordered = false;
    }
  };

  for (const line of lines) {
    // fenced code blocks
    if (line.startsWith("```")) {
      if (codeBlock) {
        html.push(
          `<pre class="mb-5 max-w-full overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--code-bg)] p-4 text-sm leading-relaxed text-accent-600 dark:text-accent-300"><code>${codeBlock.join("\n")}</code></pre>`
        );
        codeBlock = null;
      } else {
        flushParagraph();
        flushList();
        codeBlock = [];
      }
      continue;
    }
    if (codeBlock) {
      codeBlock.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1]!.length;
      const content = inline(heading[2]!);
      const classes =
        level <= 2
          ? "mb-3 mt-7 font-display text-2xl font-semibold tracking-tight text-[var(--fg)]"
          : "mb-2 mt-6 font-display text-xl font-semibold text-[var(--fg)]";
      html.push(`<h${level} class="${classes}">${content}</h${level}>`);
      continue;
    }

    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flushParagraph();
      flushList();
      html.push('<hr class="my-8 border-[var(--border)]" />');
      continue;
    }

    const blockquote = line.match(/^&gt;\s?(.*)$/);
    if (blockquote) {
      flushParagraph();
      flushList();
      html.push(
        `<blockquote class="mb-5 border-l-2 border-accent-500/60 pl-4 italic text-[var(--muted)]">${inline(blockquote[1]!)}</blockquote>`
      );
      continue;
    }

    const orderedItem = line.match(/^\s*\d+\.\s+(.*)$/);
    const unorderedItem = line.match(/^\s*[-*+]\s+(.*)$/);
    if (orderedItem) {
      flushParagraph();
      if (!ordered) flushList();
      ordered = true;
      list.push(orderedItem[1]!);
      continue;
    }
    if (unorderedItem) {
      flushParagraph();
      if (ordered) flushList();
      ordered = false;
      list.push(unorderedItem[1]!);
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  if (codeBlock) {
    html.push(`<pre class="mb-5 max-w-full overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--code-bg)] p-4 text-sm text-accent-600 dark:text-accent-300"><code>${codeBlock.join("\n")}</code></pre>`);
  }
  flushParagraph();
  flushList();

  return html.join("\n");
}
