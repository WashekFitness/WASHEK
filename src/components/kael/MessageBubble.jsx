import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

export default function MessageBubble({ msg, isUser }) {
  const isWaitingForFirstChunk = !isUser && msg?.isStreaming && !msg?.content;

  return (
    <div className={cn('flex group items-start w-full min-w-0', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-primary/25 to-primary/10 border border-primary/30 flex items-center justify-center mr-2 shrink-0 mt-0.5 shadow-sm shadow-primary/15">
          <Zap className="w-3.5 h-3.5 text-primary" />
        </div>
      )}
      <div
        className={cn(
          'min-w-0 max-w-[85%] sm:max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed transition-all overflow-hidden [overflow-wrap:anywhere] [word-break:break-word]',
          isUser
            ? 'bg-gradient-to-br from-primary to-blue-600 text-white rounded-tr-xs shadow-md shadow-primary/20 font-normal'
            : 'bg-card border border-border/90 dark:border-white/[0.08] shadow-[0_2px_12px_rgba(15,23,42,0.06),0_1px_3px_rgba(15,23,42,0.04)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04),0_2px_12px_rgba(0,0,0,0.35)] rounded-tl-xs text-foreground backdrop-blur-sm'
        )}
      >
        {isWaitingForFirstChunk ? (
          <div className="flex gap-1.5 items-center h-5">
            <div className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" />
            <div className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:150ms]" />
            <div className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:300ms]" />
          </div>
        ) : isUser ? (
          <p className="whitespace-pre-wrap max-w-full min-w-0 [overflow-wrap:anywhere] [word-break:break-word] selection:bg-white/20">
            {msg.content}
          </p>
        ) : (
          <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-full min-w-0 [overflow-wrap:anywhere] [word-break:break-word] text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_*]:max-w-full [&_*]:[overflow-wrap:anywhere] [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_a]:break-all [&_strong]:text-foreground [&_strong]:font-semibold [&_code]:bg-muted/70 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded-md [&_code]:text-xs [&_code]:break-all [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:[overflow-wrap:anywhere]">
            {msg.content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}
