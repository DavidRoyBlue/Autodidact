export type Segment =
  | { type: 'text'; content: string }
  | { type: 'bold'; content: string }
  | { type: 'italic'; content: string }
  | { type: 'code'; content: string }
  | { type: 'codeblock'; lang: string; content: string };

export function parseMarkdown(text: string): Segment[] {
  const segments: Segment[] = [];

  // Split out fenced code blocks first so inner content isn't re-parsed.
  const codeBlockRe = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parseInline(text.slice(lastIndex, match.index), segments);
    }
    segments.push({ type: 'codeblock', lang: match[1] ?? '', content: match[2] ?? '' });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parseInline(text.slice(lastIndex), segments);
  }

  return segments;
}

// Lines the inline pass can show as text: bullets become "•", headings bold.
function normalizeLines(text: string): string {
  return text
    .replace(/^[ \t]*[-*][ \t]+/gm, '•  ')
    .replace(/^#{1,6}[ \t]+(.+)$/gm, '**$1**');
}

function parseInline(raw: string, out: Segment[]): void {
  const text = normalizeLines(raw);
  // Matches **bold**, `code` and *italic* tokens.
  const inlineRe = /\*\*(.+?)\*\*|`([^`]+)`|\*([^*\n]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = inlineRe.exec(text)) !== null) {
    if (m.index > last) {
      out.push({ type: 'text', content: text.slice(last, m.index) });
    }
    if (m[1] !== undefined) {
      out.push({ type: 'bold', content: m[1] });
    } else if (m[2] !== undefined) {
      out.push({ type: 'code', content: m[2] });
    } else if (m[3] !== undefined) {
      out.push({ type: 'italic', content: m[3] });
    }
    last = m.index + m[0].length;
  }

  if (last < text.length) {
    out.push({ type: 'text', content: text.slice(last) });
  }
}
