import { useEffect, useRef, useState } from "react";

interface Props {
  axis: "x" | "y";
  onDelta: (delta: number) => void;
}

export function ResizeHandle({ axis, onDelta }: Props) {
  const [active, setActive] = useState(false);
  const dragging = useRef(false);
  const last = useRef(0);
  const onDeltaRef = useRef(onDelta);
  onDeltaRef.current = onDelta;

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      const pos = axis === "x" ? e.clientX : e.clientY;
      const delta = pos - last.current;
      last.current = pos;
      if (delta !== 0) onDeltaRef.current(delta);
    }

    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      setActive(false);
      document.body.classList.remove("resizing", axis === "x" ? "resizing-x" : "resizing-y");
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [axis]);

  return (
    <div
      className={`resize-handle ${axis === "x" ? "horizontal" : "vertical"}${active ? " active" : ""}`}
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      onMouseDown={(e) => {
        e.preventDefault();
        dragging.current = true;
        setActive(true);
        last.current = axis === "x" ? e.clientX : e.clientY;
        document.body.classList.add("resizing", axis === "x" ? "resizing-x" : "resizing-y");
      }}
    />
  );
}
