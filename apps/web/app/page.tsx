import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <h1 className="text-3xl font-bold tracking-tight mb-2">Job Hub</h1>
      <p className="text-muted-foreground mb-6">
        Personal AI Remote-Job Application Platform — UI Foundation Ready
      </p>
      <div className="flex gap-4">
        <Button variant="default">Verification Button</Button>
        <Button variant="outline">Outline Button</Button>
      </div>
    </main>
  );
}
