import type { ReactNode } from "react";

type FormattedMessageProps = {
  content: string;
  className?: string;
};

/**
 * A deliberately small, safe Markdown subset for model-generated text. It never interprets HTML
 * or URLs, so a reply remains text-only while common emphasis, quotes, lists, and code are easy
 * to read. Streaming output simply becomes formatted as soon as a closing marker arrives.
 */
function formatInline(text: string): ReactNode[] {
  const pattern = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*)/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    const key = `${match.index}-${token.length}`;
    if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="bg-surface-container-high rounded px-1 py-0.5 font-mono text-[0.875em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    cursor = match.index + token.length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export function FormattedMessage({ content, className = "" }: FormattedMessageProps) {
  return (
    <div className={`space-y-2 whitespace-pre-wrap ${className}`}>
      {content.split("\n").map((line, index) => {
        if (line.trim() === "") return <div key={`space-${index}`} className="h-1" aria-hidden="true" />;

        const quote = line.match(/^\s*>\s?(.*)$/);
        if (quote) {
          return (
            <blockquote key={`quote-${index}`} className="border-primary/60 text-on-surface border-l-2 pl-3">
              {formatInline(quote[1])}
            </blockquote>
          );
        }

        const heading = line.match(/^\s{0,3}#{1,3}\s+(.+)$/);
        if (heading) {
          return <p key={`heading-${index}`} className="text-on-surface font-semibold">{formatInline(heading[1])}</p>;
        }

        const bullet = line.match(/^\s*[-*]\s+(.+)$/);
        if (bullet) {
          return (
            <div key={`bullet-${index}`} className="flex gap-2">
              <span aria-hidden="true">•</span>
              <span>{formatInline(bullet[1])}</span>
            </div>
          );
        }

        const numbered = line.match(/^\s*(\d+)\.\s+(.+)$/);
        if (numbered) {
          return (
            <div key={`number-${index}`} className="flex gap-2">
              <span aria-hidden="true">{numbered[1]}.</span>
              <span>{formatInline(numbered[2])}</span>
            </div>
          );
        }

        return <p key={`paragraph-${index}`}>{formatInline(line)}</p>;
      })}
    </div>
  );
}
