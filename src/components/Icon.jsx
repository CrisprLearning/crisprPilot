import React from 'react';
import { ICON_MAP } from '../lib/iconMap';

// Drop-in replacement for `<i className="fa fa-x" />` / `<i className="ti ti-x" />`.
// Every class stays on the wrapping <i>, so existing CSS (sizes, colours,
// fa-spin, page selectors like `.foo .ti-close`) still applies; the matching
// Lucide icon is drawn inside it at 1em in the current text colour.
export default function Icon({ className = '', ...rest }) {
  const classes = String(className || '');
  const name = classes.split(/\s+/).find((c) => ICON_MAP[c]);

  // Unknown name: fall back to the old font glyph rather than render nothing.
  if (!name) return <i className={classes} {...rest} />;

  const { icon: Glyph, fill } = ICON_MAP[name];
  return (
    <i className={`${classes} lucide-i`} {...rest}>
      <Glyph size="1em" fill={fill ? 'currentColor' : 'none'} aria-hidden="true" focusable="false" />
    </i>
  );
}
