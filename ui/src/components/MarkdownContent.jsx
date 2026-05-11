import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

// Walk a React node tree to extract its plain text — used for the copy button
// since rehype-highlight wraps code in nested <span class="hljs-..."> elements.
function extractText(node) {
  if (node == null || node === false) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node.props?.children) return extractText(node.props.children);
  return "";
}

function CodeBlock({ language, codeChildren, codeClassName }) {
  const [copied, setCopied] = useState(false);
  const lang = language || "text";

  function copy() {
    navigator.clipboard.writeText(extractText(codeChildren));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {lang}
        </span>
        <button
          onClick={copy}
          className="text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {copied ? "✓ copied" : "copy"}
        </button>
      </div>
      <pre className="!my-0 !p-3 overflow-x-auto text-xs leading-relaxed bg-[#0d1117] text-gray-100">
        <code className={`hljs ${codeClassName}`.trim()}>{codeChildren}</code>
      </pre>
    </div>
  );
}

const components = {
  // react-markdown v10 removed the `inline` prop. Inline `code` outside a
  // <pre> reaches us here directly; fenced code blocks come through `pre`.
  code({ className, children, ...props }) {
    return (
      <code
        className="px-1 py-0.5 mx-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[0.85em] font-mono text-rose-600 dark:text-rose-300 break-words"
        {...props}
      >
        {children}
      </code>
    );
  },
  // Fenced code block: react-markdown wraps it as <pre><code class="language-X">...</code></pre>.
  // Pull the inner <code> props out so we can render our own header (lang label + copy).
  pre({ children }) {
    const code = Array.isArray(children) ? children[0] : children;
    const codeProps = code?.props || {};
    const codeClassName = codeProps.className || "";
    const lang = (/language-([\w-]+)/.exec(codeClassName) || [])[1];
    return (
      <CodeBlock
        language={lang}
        codeChildren={codeProps.children}
        codeClassName={codeClassName}
      />
    );
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-indigo-600 dark:text-indigo-400 hover:underline break-words"
      >
        {children}
      </a>
    );
  },
  h1: ({ children }) => (
    <h1 className="text-base font-bold mt-3 mb-1.5">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-sm font-bold mt-3 mb-1.5">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold mt-2.5 mb-1">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-xs font-semibold mt-2 mb-1 uppercase tracking-wider text-gray-600 dark:text-gray-400">
      {children}
    </h4>
  ),
  p: ({ children }) => <p className="my-1.5 leading-relaxed">{children}</p>,
  ul: ({ children }) => (
    <ul className="list-disc pl-5 my-1.5 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 my-1.5 space-y-0.5">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-3 my-2 italic text-gray-700 dark:text-gray-300">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="border-collapse border border-gray-300 dark:border-gray-700 text-xs">
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-gray-300 dark:border-gray-700 px-2 py-1 bg-gray-100 dark:bg-gray-800 font-semibold text-left">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-gray-300 dark:border-gray-700 px-2 py-1 align-top">
      {children}
    </td>
  ),
  hr: () => <hr className="my-3 border-gray-200 dark:border-gray-700" />,
  strong: ({ children }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
};

export default function MarkdownContent({ content }) {
  return (
    <div className="text-sm leading-relaxed break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
