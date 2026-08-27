/**
 * Hand curated quotes from developers who have held #1. Empty on day one,
 * because nobody has yet, and `Testimonials.tsx` renders nothing at all rather
 * than shipping invented ones.
 */
export type Testimonial = {
  quote: string;
  name: string;
  detail: string;
};

export const TESTIMONIALS: readonly Testimonial[] = [];
