import { AscentMark, PenumbraLockup, PenumbraWordmark } from "@/components/PenumbraLogo";

export default function LogoDev() {
  return (
    <main className="grid min-h-dvh grid-cols-1 md:grid-cols-[3fr_2fr]">
      <section className="flex flex-col items-center justify-center gap-12 bg-umbra p-10 text-starlight">
        <PenumbraWordmark className="w-[520px] max-w-full" />
        <header className="flex h-14 w-full max-w-[520px] items-center border-y border-rule px-6">
          <h1>
            <PenumbraLockup />
          </h1>
        </header>
      </section>
      <section className="flex flex-col items-center justify-center gap-12 bg-napkin p-10 text-graphite">
        <PenumbraWordmark className="w-[320px] max-w-full" ground="var(--napkin)" />
        <PenumbraLockup size={18} />
        <div className="flex items-end gap-6">
          <img src="/icon.svg" alt="App icon" width={72} height={72} />
          <AscentMark className="h-8 w-8" />
          <AscentMark className="h-4 w-4" />
        </div>
      </section>
    </main>
  );
}
