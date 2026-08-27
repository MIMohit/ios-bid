import { useSyncExternalStore } from "react";
import { useConvex } from "convex/react";

/**
 * One static line when the WebSocket is down.
 *
 * Gated on `hasEverConnected` so it never flashes during the initial connect,
 * which is the only reason this is not simply `!isWebSocketConnected`.
 *
 * No spinner, no retry button, no countdown. The Convex client is already
 * retrying with backoff, so a button that does what the client does anyway is
 * theatre, and a spinner would be the site's only ambient animation.
 */
export function ConnectionState() {
  const convex = useConvex();

  // Not convex's own useConvexConnectionState(): that returns the whole object,
  // which changes every time a query goes in or out of flight, so it would
  // re-render this on every push. The snapshot below is a boolean, so it
  // re-renders when the socket actually drops and at no other time.
  //
  // getSnapshot must
  // return a value that compares equal between calls or React re-renders
  // forever. The server snapshot is `false` because there is no socket during
  // SSR and "connected" is the state the markup should hydrate into.
  const offline = useSyncExternalStore(
    (onChange) => convex.subscribeToConnectionState(onChange),
    () => {
      const state = convex.connectionState();
      return state.hasEverConnected && !state.isWebSocketConnected;
    },
    () => false,
  );

  if (!offline) return null;

  return (
    <p className="conn" role="status">
      Live updates are reconnecting. The numbers on this page may be a few seconds behind.
    </p>
  );
}
