import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

const questions = [
  {
    id: 'brand-accuracy',
    question: "Will it maintain my brand's accuracy?",
    answer:
      'Yes. Ceriga keeps your core product identity intact, including silhouette, logos, color intent, and print placement, while only changing scene styling and presentation.',
  },
  {
    id: 'image-rights',
    question: 'Who owns the rights to the images?',
    answer:
      'You do. Generated outputs are yours to use in your marketing and commerce channels, subject to your account plan and terms.',
  },
  {
    id: 'quality',
    question: 'Is the quality high enough for large displays?',
    answer:
      'Outputs are generated for high-resolution use and are suitable for product pages, paid ads, and most large-format digital placements.',
  },
  {
    id: 'turnaround',
    question: 'How fast will I get results?',
    answer:
      'Most generations complete in under 60 seconds, depending on queue load and the number of selected outputs.',
  },
  {
    id: 'input-types',
    question: 'What files can I upload?',
    answer:
      'You can upload standard image files like JPG, PNG, and WebP. Starting with a clear front-facing source generally gives the best results.',
  },
] as const

export function CommonQuestionsSection() {
  return (
    <section className="border-t border-border py-24">
      <div className="mx-auto w-full max-w-4xl px-6 lg:px-12">
        <h2 className="mb-10 text-center text-4xl font-black tracking-tight text-foreground sm:text-5xl">Common Questions</h2>

        <Accordion type="single" collapsible className="space-y-3">
          {questions.map((item) => (
            <AccordionItem key={item.id} value={item.id} className="rounded-md border border-white/10 bg-[#111319] px-5">
              <AccordionTrigger className="py-5 text-base font-semibold text-foreground hover:no-underline">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}
