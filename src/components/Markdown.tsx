import {
  Children,
  isValidElement,
  memo,
  type ComponentPropsWithoutRef,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';
import { MermaidDiagram } from '@/components/markdown/MermaidDiagram';
import { cn } from '@/lib/utils';

interface MarkdownProps {
  content: string;
  className?: string;
}

function MarkdownPre({
  children,
  node: _node,
  ...props
}: ComponentPropsWithoutRef<'pre'> & { node?: unknown }) {
  const child = Children.toArray(children)[0];
  if (isValidElement(child) && child.type === MermaidDiagram) {
    return <>{child}</>;
  }
  return <pre {...props}>{children}</pre>;
}

function MarkdownCode({
  className,
  children,
  node: _node,
  ...props
}: ComponentPropsWithoutRef<'code'> & { node?: unknown }) {
  const match = /(?:^|\s)language-mermaid(?:\s|$)/.exec(className ?? '');
  const source = String(children).replace(/\n$/, '');
  if (match) {
    return <MermaidDiagram chart={source} />;
  }
  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
}

function MarkdownComponent({ content, className }: MarkdownProps) {
  return (
    <div className={cn('qa-prose', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre: MarkdownPre,
          code: MarkdownCode,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(MarkdownComponent);
