"use client";

// Types text out a character at a time behind a blinking block caret, like a terminal
// printing a readout. Give it key={text} so a new text starts over. Screen readers get the
// whole text at once; reduced-motion users see it immediately.

import { useEffect, useState, type ElementType } from "react";

interface TypeOutProps {
  text: string;
  /** Characters per second. */
  cps?: number;
  /** Wait this long before typing, in ms. */
  delay?: number;
  /** Keep the caret blinking this long after the last character, in ms. */
  linger?: number;
  className?: string;
  as?: ElementType;
}

export default function TypeOut({ text, cps = 55, delay = 0, linger = 1200, className, as: Tag = "span" }: TypeOutProps) {
  const [shown, setShown] = useState(0);
  const [caret, setCaret] = useState(true);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let count = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      count = reduce ? text.length : Math.min(text.length, count + 1);
      setShown(count);
      if (count < text.length) {
        // A little irregularity reads as a machine printing, not a CSS transition.
        timer = setTimeout(tick, (1000 / cps) * (0.6 + Math.random() * 0.8));
      } else {
        timer = setTimeout(() => setCaret(false), reduce ? 0 : linger);
      }
    };
    timer = setTimeout(tick, delay);
    return () => clearTimeout(timer);
  }, [text, cps, delay, linger]);

  return (
    <Tag className={className} aria-label={text}>
      <span aria-hidden>{text.slice(0, shown)}</span>
      {caret && <span aria-hidden className="caret" />}
    </Tag>
  );
}
