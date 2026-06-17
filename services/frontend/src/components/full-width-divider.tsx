import { cn } from "@/lib/utils"

export function FullWidthDivider({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "border-b border-border -mx-4 md:-mx-6",
        className
      )}
      style={{
        marginLeft: "calc(-50vw + 50%)",
        marginRight: "calc(-50vw + 50%)",
      }}
    />
  )
}
