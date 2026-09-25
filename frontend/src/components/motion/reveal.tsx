"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

import { EASE, useReducedMotion } from "@/hooks/use-reduced-motion";

type RevealProps = {
  children: ReactNode;
  /** seconds */
  delay?: number;
  /** slide distance in px (ignored under reduced motion) */
  y?: number;
  className?: string;
  once?: boolean;
};

/** Scroll-triggered fade/slide-in. Renders statically under reduced motion. */
export function Reveal({ children, delay = 0, y = 24, className, once = true }: RevealProps) {
  const reduced = useReducedMotion();
  if (reduced) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "-60px" }}
      transition={{ duration: 0.55, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

type StaggerProps = {
  children: ReactNode;
  /** seconds between children */
  stagger?: number;
  /** seconds before the first child */
  delay?: number;
  className?: string;
  childClassName?: string;
};

/** Parent that staggers its direct motion children on scroll into view. */
export function StaggerGroup({ children, stagger = 0.07, delay = 0, className }: StaggerProps) {
  const reduced = useReducedMotion();
  if (reduced) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: stagger, delayChildren: delay } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className, y = 18 }: { children?: ReactNode; className?: string; y?: number }) {
  const reduced = useReducedMotion();
  if (reduced) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y },
        show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
      }}
    >
      {children}
    </motion.div>
  );
}
