import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '@/app/ThemeProvider';

let mermaidIdCounter = 0;

export function MermaidDiagram({ chart }: { chart: string }) {
  const { resolvedTheme } = useTheme();
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const diagramId = useMemo(() => {
    mermaidIdCounter += 1;
    return `qa-mermaid-${mermaidIdCounter}`;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setFailed(false);

    void import('mermaid')
      .then(({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          theme: resolvedTheme === 'dark' ? 'dark' : 'default',
          securityLevel: 'strict',
        });
        return mermaid.render(diagramId, chart);
      })
      .then(({ svg: rendered }) => {
        if (!cancelled) setSvg(rendered);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [chart, diagramId, resolvedTheme]);

  if (failed) {
    return (
      <pre className="qa-mermaid-fallback">
        <code>{chart}</code>
      </pre>
    );
  }

  if (!svg) {
    return <div className="qa-mermaid qa-mermaid-loading" aria-busy="true" />;
  }

  return (
    <div
      className="qa-mermaid"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
