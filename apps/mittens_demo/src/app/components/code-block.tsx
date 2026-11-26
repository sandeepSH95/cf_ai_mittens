import { cn } from "@/lib/utils";

/**
 * A monospace block for a program, a plan or a tool result. Long lines wrap,
 * so a block never makes its card wider. Not a shadcn component: both tabs share it.
 */
export function CodeBlock({ className, ...props }: React.ComponentProps<"pre">) {
  return (
    <pre
      className={cn("overflow-x-auto rounded-md border bg-muted p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap", className)}
      {...props}
    />
  );
}
