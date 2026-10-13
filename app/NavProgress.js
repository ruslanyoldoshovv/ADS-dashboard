"use client";
// Sahifa yuklanayotganini ko'rsatish: havola (davr, loyiha, rejim) yoki sana formasi bosilganda tepada
// harakatlanuvchi chiziq va "Yuklanmoqda..." belgisi chiqadi. Yangi sahifa kelgach o'zi yo'qoladi.
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export default function NavProgress() {
  const [on, setOn] = useState(false);
  const path = usePathname(), sp = useSearchParams();
  useEffect(() => { setOn(false); }, [path, sp]);
  useEffect(() => {
    const click = (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest && e.target.closest("a[href]");
      if (!a || a.target === "_blank") return;
      const u = new URL(a.href, location.href);
      if (u.origin !== location.origin || u.href === location.href) return;
      setOn(true);
    };
    const submit = (e) => { if (e.target && e.target.method === "get") setOn(true); };
    document.addEventListener("click", click, true);
    document.addEventListener("submit", submit);
    return () => { document.removeEventListener("click", click, true); document.removeEventListener("submit", submit); };
  }, []);
  if (!on) return null;
  return (
    <>
      <div className="navbar" aria-hidden="true"><span /></div>
      <div className="navtag" role="status">Yuklanmoqda...</div>
    </>
  );
}
