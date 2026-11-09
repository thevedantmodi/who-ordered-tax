import { startDemo } from "@/app/actions";
import { demoEnabled } from "@/lib/demo";

export function DemoButton({ className = "btn btn-secondary w-full" }: { className?: string }) {
  if (!demoEnabled()) return null;
  return (
    <form action={startDemo}>
      <button className={className}>Try the demo, no sign-up</button>
    </form>
  );
}
