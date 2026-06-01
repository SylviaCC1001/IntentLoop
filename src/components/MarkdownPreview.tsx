"use client";

import {
  cloneElement,
  ElementType,
  isValidElement,
  ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import type {
  CommentAnchor,
  ReviewComment,
} from "@/components/ReviewCommentsPanel";

export type PreviewCommentAnchor = {
  lineNumber: number;
  blockId: string;
  textHash: string;
  preview: string;
};

type MarkdownPreviewProps = {
  content: string;
  commentAnchors?: PreviewCommentAnchor[];
  selectionComments?: ReviewComment[];
  onSelectCommentAnchor?: (anchor: CommentAnchor, commentId?: string) => void;
};

type MermaidDiagramProps = {
  chart: string;
};

type MarkdownNode = {
  position?: {
    start?: {
      line?: number;
    };
  };
};

type AnnotatedBlockProps = {
  as: ElementType;
  node?: unknown;
  children: ReactNode;
  anchors: PreviewCommentAnchor[];
  selectionComments: ReviewComment[];
  onSelectCommentAnchor?: (anchor: CommentAnchor, commentId?: string) => void;
  className?: string;
};

type SelectionDraft = {
  anchor: CommentAnchor;
  top: number;
  left: number;
};

function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const reactId = useId();
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "default",
        });

        const id = `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
        const result = await mermaid.render(id, chart);
        if (!cancelled) {
          setSvg(result.svg);
          setError("");
        }
      } catch {
        if (!cancelled) {
          setSvg("");
          setError("Mermaid 图表渲染失败");
        }
      }
    }

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [chart, reactId]);

  return (
    <div
      data-mermaid-diagram="true"
      className="my-4 overflow-x-auto rounded-md border border-border bg-background p-3"
    >
      {svg ? (
        <div
          className="mermaid-diagram"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : error ? (
        <pre className="text-sm text-red-600">{error}</pre>
      ) : (
        <pre className="text-sm text-muted-foreground">Mermaid 图表加载中...</pre>
      )}
    </div>
  );
}

function getNodeLine(node: unknown) {
  return (node as MarkdownNode | undefined)?.position?.start?.line ?? null;
}

function findAnchor(node: unknown, anchors: PreviewCommentAnchor[]) {
  const line = getNodeLine(node);
  if (!line) return null;
  return anchors.find((anchor) => anchor.lineNumber === line) ?? null;
}

function textHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}

function selectorForBlock(blockId: string) {
  return `[data-comment-anchor="${blockId.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;
}

function closestCommentBlock(node: Node | null, root: HTMLElement) {
  const element =
    node instanceof Element ? node : node?.parentElement ?? null;
  const block = element?.closest<HTMLElement>("[data-comment-anchor]");
  return block && root.contains(block) ? block : null;
}

function AnnotatedBlock({
  as,
  node,
  children,
  anchors,
  selectionComments,
  onSelectCommentAnchor,
  className,
  ...rest
}: AnnotatedBlockProps) {
  const anchor = findAnchor(node, anchors);
  const Tag = as;

  if (!anchor) {
    return (
      <Tag className={className} {...rest}>
        {children}
      </Tag>
    );
  }

  const blockComments = selectionComments.filter(
    (comment) =>
      comment.anchorData.type === "element" &&
      comment.anchorData.kind === "selection" &&
      comment.anchorData.blockId === anchor.blockId
  );

  return (
    <div
      data-comment-anchor={anchor.blockId}
      className="relative"
    >
      <Tag className={className} {...rest}>
        {renderHighlightedChildren(
          children,
          blockComments,
          onSelectCommentAnchor
        )}
      </Tag>
    </div>
  );
}

function renderHighlightedChildren(
  children: ReactNode,
  comments: ReviewComment[],
  onSelectCommentAnchor?: (anchor: CommentAnchor, commentId?: string) => void
) {
  if (comments.length === 0) return children;

  const cursor = { current: 0 };
  return highlightNode(children, comments, cursor, onSelectCommentAnchor);
}

function highlightNode(
  node: ReactNode,
  comments: ReviewComment[],
  cursor: { current: number },
  onSelectCommentAnchor?: (anchor: CommentAnchor, commentId?: string) => void
): ReactNode {
  if (typeof node === "string" || typeof node === "number") {
    return highlightText(String(node), comments, cursor, onSelectCommentAnchor);
  }

  if (Array.isArray(node)) {
    return node.map((child, index) => (
      <span key={index}>
        {highlightNode(child, comments, cursor, onSelectCommentAnchor)}
      </span>
    ));
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return cloneElement(node, {
      children: highlightNode(
        node.props.children,
        comments,
        cursor,
        onSelectCommentAnchor
      ),
    });
  }

  return node;
}

function highlightText(
  text: string,
  comments: ReviewComment[],
  cursor: { current: number },
  onSelectCommentAnchor?: (anchor: CommentAnchor, commentId?: string) => void
) {
  const start = cursor.current;
  const end = start + text.length;
  cursor.current = end;

  const matches = comments
    .filter((comment) => {
      const anchor = comment.anchorData;
      return (
        anchor.type === "element" &&
        anchor.startOffset !== undefined &&
        anchor.endOffset !== undefined &&
        anchor.startOffset < end &&
        anchor.endOffset > start
      );
    })
    .sort((a, b) => {
      const aStart =
        a.anchorData.type === "element" ? a.anchorData.startOffset ?? 0 : 0;
      const bStart =
        b.anchorData.type === "element" ? b.anchorData.startOffset ?? 0 : 0;
      return aStart - bStart;
    });

  if (matches.length === 0) return text;

  const parts: ReactNode[] = [];
  let localCursor = 0;
  for (const comment of matches) {
    const anchor = comment.anchorData;
    if (anchor.type !== "element") continue;
    const localStart = Math.max((anchor.startOffset ?? start) - start, 0);
    const localEnd = Math.min((anchor.endOffset ?? end) - start, text.length);
    if (localEnd <= localStart || localStart < localCursor) continue;

    if (localStart > localCursor) {
      parts.push(text.slice(localCursor, localStart));
    }
    parts.push(
      <mark
        key={comment.id}
        data-selection-comment-mark="true"
        data-comment-id={comment.id}
        onClick={() => onSelectCommentAnchor?.(comment.anchorData, comment.id)}
        className={
          comment.status === "resolved"
            ? "cursor-pointer rounded bg-muted px-0.5 text-muted-foreground"
            : "cursor-pointer rounded bg-amber-200/80 px-0.5 text-foreground"
        }
      >
        {text.slice(localStart, localEnd)}
      </mark>
    );
    localCursor = localEnd;
  }

  if (localCursor < text.length) {
    parts.push(text.slice(localCursor));
  }

  return parts;
}

export default function MarkdownPreview({
  content,
  commentAnchors = [],
  selectionComments = [],
  onSelectCommentAnchor,
}: MarkdownPreviewProps) {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [selectionDraft, setSelectionDraft] = useState<SelectionDraft | null>(
    null
  );

  const selectionCommentList = useMemo(
    () =>
      selectionComments.filter(
        (comment) =>
          comment.anchorData.type === "element" &&
          comment.anchorData.kind === "selection" &&
          comment.anchorData.blockId &&
          comment.anchorData.startOffset !== undefined &&
          comment.anchorData.endOffset !== undefined
      ),
    [selectionComments]
  );

  function captureSelection() {
    if (!onSelectCommentAnchor) {
      setSelectionDraft(null);
      return;
    }

    const root = previewRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setSelectionDraft(null);
      return;
    }

    const selectedText = selection.toString();
    const preview = selectedText.replace(/\s+/g, " ").trim();
    if (!preview) {
      setSelectionDraft(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const startBlock = closestCommentBlock(range.startContainer, root);
    const endBlock = closestCommentBlock(range.endContainer, root);
    if (!startBlock || !endBlock || startBlock !== endBlock) {
      setSelectionDraft(null);
      return;
    }

    const blockId = startBlock.dataset.commentAnchor;
    if (!blockId) {
      setSelectionDraft(null);
      return;
    }

    const beforeRange = document.createRange();
    beforeRange.selectNodeContents(startBlock);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    const startOffset = beforeRange.toString().length;
    const endOffset = startOffset + selectedText.length;
    const blockText = startBlock.textContent || "";
    const rect = range.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();

    setSelectionDraft({
      anchor: {
        type: "element",
        kind: "selection",
        selector: selectorForBlock(blockId),
        blockId,
        textHash: textHash(blockText),
        selectedText,
        startOffset,
        endOffset,
        preview: preview.slice(0, 80),
      },
      left: rect.left - rootRect.left + rect.width / 2,
      top: rect.top - rootRect.top - 40,
    });
  }

  function addSelectionComment() {
    if (!selectionDraft) return;
    onSelectCommentAnchor?.(selectionDraft.anchor);
    setSelectionDraft(null);
  }

  const markdownComponents = useMemo<Components>(
    () => ({
      h1(props) {
        const { children, node, ...rest } = props;
        return (
          <AnnotatedBlock
            as="h1"
            node={node}
            anchors={commentAnchors}
            selectionComments={selectionCommentList}
            onSelectCommentAnchor={onSelectCommentAnchor}
            {...rest}
          >
            {children}
          </AnnotatedBlock>
        );
      },
      h2(props) {
        const { children, node, ...rest } = props;
        return (
          <AnnotatedBlock
            as="h2"
            node={node}
            anchors={commentAnchors}
            selectionComments={selectionCommentList}
            onSelectCommentAnchor={onSelectCommentAnchor}
            {...rest}
          >
            {children}
          </AnnotatedBlock>
        );
      },
      h3(props) {
        const { children, node, ...rest } = props;
        return (
          <AnnotatedBlock
            as="h3"
            node={node}
            anchors={commentAnchors}
            selectionComments={selectionCommentList}
            onSelectCommentAnchor={onSelectCommentAnchor}
            {...rest}
          >
            {children}
          </AnnotatedBlock>
        );
      },
      p(props) {
        const { children, node, ...rest } = props;
        return (
          <AnnotatedBlock
            as="p"
            node={node}
            anchors={commentAnchors}
            selectionComments={selectionCommentList}
            onSelectCommentAnchor={onSelectCommentAnchor}
            {...rest}
          >
            {children}
          </AnnotatedBlock>
        );
      },
      blockquote(props) {
        const { children, node, ...rest } = props;
        return (
          <AnnotatedBlock
            as="blockquote"
            node={node}
            anchors={commentAnchors}
            selectionComments={selectionCommentList}
            onSelectCommentAnchor={onSelectCommentAnchor}
            {...rest}
          >
            {children}
          </AnnotatedBlock>
        );
      },
      li(props) {
        const { children, node, className, ...rest } = props;
        const anchor = findAnchor(node, commentAnchors);
        if (!anchor) {
          return (
            <li className={className} {...rest}>
              {children}
            </li>
          );
        }

        return (
          <li
            data-comment-anchor={anchor.blockId}
            className={`relative ${className || ""}`}
            {...rest}
          >
            {renderHighlightedChildren(
              children,
              selectionCommentList.filter(
                (comment) =>
                  comment.anchorData.type === "element" &&
                  comment.anchorData.blockId === anchor.blockId
              ),
              onSelectCommentAnchor
            )}
          </li>
        );
      },
      table(props) {
        const { children, node, ...rest } = props;
        return (
          <AnnotatedBlock
            as="table"
            node={node}
            anchors={commentAnchors}
            selectionComments={selectionCommentList}
            onSelectCommentAnchor={onSelectCommentAnchor}
            {...rest}
          >
            {children}
          </AnnotatedBlock>
        );
      },
      pre(props) {
        const { children, node, ...rest } = props;
        return (
          <AnnotatedBlock
            as="pre"
            node={node}
            anchors={commentAnchors}
            selectionComments={selectionCommentList}
            onSelectCommentAnchor={onSelectCommentAnchor}
            {...rest}
          >
            {children}
          </AnnotatedBlock>
        );
      },
      code(props) {
        const { children, className, node: _node, ...rest } = props;
        void _node;
        const language = /language-(\w+)/.exec(className || "")?.[1];
        const value = String(children).replace(/\n$/, "");

        if (language === "mermaid") {
          return <MermaidDiagram chart={value} />;
        }

        return (
          <code className={className} {...rest}>
            {children}
          </code>
        );
      },
    }),
    [commentAnchors, onSelectCommentAnchor, selectionCommentList]
  );

  return (
    <div
      ref={previewRef}
      data-selection-comment-root="true"
      className="prose-prd relative max-w-none"
      onMouseUp={captureSelection}
      onKeyUp={captureSelection}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeKatex,
          [rehypeHighlight, { detect: false, ignoreMissing: true }],
        ]}
        components={markdownComponents}
      >
        {content || "暂无内容"}
      </ReactMarkdown>
      {selectionDraft && (
        <button
          type="button"
          data-selection-comment-action="true"
          onMouseDown={(event) => event.preventDefault()}
          onClick={addSelectionComment}
          className="absolute z-20 -translate-x-1/2 rounded-md border border-border bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-lg"
          style={{
            left: selectionDraft.left,
            top: Math.max(selectionDraft.top, 0),
          }}
        >
          添加注释
        </button>
      )}
    </div>
  );
}
