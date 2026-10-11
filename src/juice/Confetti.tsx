import { useEffect } from "react";
import { celebrate, type CelebrationKind } from "./celebrate";
import "./juice.css";

interface Props {
  kind?: CelebrationKind;
  /** Change this value to fire again; omit to fire once on mount. */
  fire?: unknown;
  /** Set false to hold fire. */
  active?: boolean;
}

/** Declarative confetti: fires celebrate(kind) on mount and whenever `fire` changes. Renders nothing. */
export default function Confetti({ kind = "big", fire, active = true }: Props) {
  useEffect(() => {
    if (active) celebrate(kind);
  }, [kind, fire, active]);
  return null;
}
