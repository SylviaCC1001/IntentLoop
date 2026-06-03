"use client";

import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ClientPortalProps = {
  children: ReactNode;
};

export default function ClientPortal({ children }: ClientPortalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(children, document.body);
}
