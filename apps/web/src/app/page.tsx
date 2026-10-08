import { texts } from "@/texts/pt-BR";

export default function LandingPage() {
  const { landing } = texts;
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{landing.headline}</h1>
      <p className="text-lg text-pretty opacity-80">{landing.lead}</p>
      <ul className="list-inside list-disc space-y-1">
        {landing.features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <p className="text-brand font-semibold">{landing.comingSoon}</p>
    </main>
  );
}
