import type { CSSProperties } from "react";

const LIST_PADDING_Y = 16;

export function mergeVirtuosoListStyle(
  style?: CSSProperties,
): CSSProperties {
  const existing = style?.paddingBottom;
  let paddingBottom: CSSProperties["paddingBottom"] = LIST_PADDING_Y;
  if (typeof existing === "number") {
    paddingBottom = existing + LIST_PADDING_Y;
  } else if (typeof existing === "string") {
    const n = Number.parseFloat(existing);
    if (Number.isFinite(n)) paddingBottom = n + LIST_PADDING_Y;
  }

  return {
    ...style,
    paddingTop: LIST_PADDING_Y,
    paddingLeft: 0,
    paddingRight: 0,
    paddingBottom,
  };
}
