/**
 * Horizontally scrolls `container` the minimum amount needed so `element`
 * is fully visible. If the element is wider than the container, aligns its
 * left edge with the container's left edge.
 */
export function scrollTerminalFullyIntoView(
  container: HTMLElement,
  element: HTMLElement,
  behavior: ScrollBehavior = "smooth",
): void {
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  let delta = 0;
  if (elementRect.width > containerRect.width) {
    delta = elementRect.left - containerRect.left;
  } else if (elementRect.left < containerRect.left) {
    delta = elementRect.left - containerRect.left;
  } else if (elementRect.right > containerRect.right) {
    delta = elementRect.right - containerRect.right;
  }

  if (delta !== 0) {
    container.scrollBy({ left: delta, behavior });
  }
}
