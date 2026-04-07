import { Construction } from 'lucide-react';

// Tiny placeholder for coach pages we haven't built yet.
export default function ComingSoon({ title }) {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <p className="text-xs text-muted-foreground uppercase tracking-widest">Coach Portal</p>
      <h1 className="text-3xl font-playfair font-semibold mt-1 mb-8">{title}</h1>
      <div className="rounded-xl border border-dashed border-border p-12 text-center">
        <Construction className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Coming soon.</p>
      </div>
    </div>
  );
}
