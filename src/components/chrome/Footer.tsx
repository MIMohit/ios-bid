/**
 * Four links and one disclosure line. Every listing on this board is a paid
 * placement, so saying who we are not affiliated with is not boilerplate.
 */
export function Footer() {
  return (
    <footer className="foot">
      <nav>
        <a href="/rules">Rules</a>
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
        <a href="/stats">Live stats</a>
      </nav>
      <span>
        iosrank.lol · not affiliated with Apple · every app is pulled live from the iTunes Lookup
        API
      </span>
    </footer>
  );
}
