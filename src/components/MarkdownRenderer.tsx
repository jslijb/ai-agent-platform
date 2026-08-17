"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Markdown 渲染组件：统一格式化 assistant 回复和步骤内容
 *
 * 独立拆分为单独 chunk 的原因：
 * react-markdown + remark-gfm 拉入大量模块（micromark、mdast、character-entities 等），
 * 导致 /chat 页面 chunk 超过 500KB，触发 webpack eval-source-map 截断 bug，
 * 最后一个模块的 eval 字符串被截断 → SyntaxError → ChunkLoadError → 页面无法 hydrate。
 *
 * 通过 next/dynamic 动态导入此组件，将 markdown 相关依赖拆分到独立 chunk。
 */
export default function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="min-w-full text-xs border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-gray-300 bg-gray-100 px-2 py-1 text-left font-semibold">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border border-gray-300 px-2 py-1">{children}</td>
          ),
          code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode }) => {
            // react-markdown v10 移除了 inline prop，通过有无 language- className 判断
            const isInline = !className;
            if (isInline) {
              return (
                <code className="bg-gray-100 text-red-600 px-1 py-0.5 rounded text-xs font-mono">{children}</code>
              );
            }
            return (
              <code className={className} {...props}>{children}</code>
            );
          },
          pre: ({ children }) => (
            <pre className="bg-gray-800 text-green-400 rounded-lg p-3 my-2 overflow-x-auto text-xs">
              {children}
            </pre>
          ),
          ul: ({ children }) => <ul className="list-disc pl-5 my-1 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 my-1 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
          h1: ({ children }) => <h1 className="text-lg font-bold my-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-bold my-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-bold my-1">{children}</h3>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-gray-300 pl-3 my-2 text-gray-600 italic">{children}</blockquote>
          ),
          strong: ({ children }) => <strong className="font-bold text-gray-900">{children}</strong>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{children}</a>
          ),
          hr: () => <hr className="border-gray-200 my-3" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
