"use client";
// Jadval: sarlavha qatori sahifa pastga aylantirilganda tepada qadalib turadi va jadval tugashi bilan u bilan birga ketadi.
// Jadval eniga aylantirilganda (mobil) sarlavha ham shu bilan birga suriladi.
import { useRef } from "react";

export default function StickyTable({ head, children }) {
  const headRef = useRef(null);
  const onScroll = (e) => { if (headRef.current) headRef.current.scrollLeft = e.currentTarget.scrollLeft; };
  return (
    <>
      <div ref={headRef} className="tblhead">
        <div className="tblin">{head}</div>
      </div>
      <div className="tblbody" onScroll={onScroll}>
        <div className="tblin">{children}</div>
      </div>
    </>
  );
}
