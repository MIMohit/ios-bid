import { TESTIMONIALS } from "~/content/testimonials";

/**
 * The wall of quotes from developers who have held #1.
 *
 * Renders nothing at all while the list is empty, which is the state it ships
 * in. An empty section with a heading and a "no testimonials yet" line would be
 * an advertisement for having no customers, and invented quotes are not an
 * option.
 */
export function Testimonials() {
  if (TESTIMONIALS.length === 0) return null;

  return (
    <section className="wall" id="testimonials">
      <h2>From the developers who took #1</h2>
      <div className="wall-grid">
        {TESTIMONIALS.map((testimonial) => (
          <figure className="quote" key={testimonial.name}>
            <blockquote>{testimonial.quote}</blockquote>
            <figcaption>
              {testimonial.name}
              <span>{testimonial.detail}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
