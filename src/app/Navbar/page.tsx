"use client";

// GPU Dashboard Sidebar – simplified (light‑theme only)
// Removed ThemeContext, dark‑mode conditionals, and theme toggle button.

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Home, Gauge, Thermometer, Activity, Info } from "lucide-react";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------
interface NavItemMeta {
    name: string;
    href: string;
    icon: React.ReactNode;
    group: "Metrics" | "Info";
}

// -----------------------------------------------------------------------------
// Media‑query hook
// -----------------------------------------------------------------------------
function useMediaQuery(query: string) {
    const [matches, setMatches] = useState(false);
    useEffect(() => {
        if (typeof window === "undefined") return;
        const mq = window.matchMedia(query);
        const update = () => setMatches(mq.matches);
        update();
        mq.addEventListener("change", update);
        return () => mq.removeEventListener("change", update);
    }, [query]);
    return matches;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------
export default function Sidebar() {
    const pathname = usePathname();

    const isDesktop = useMediaQuery("(min-width: 768px)");
    const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer toggle
    const [isHovered, setIsHovered] = useState(false); // desktop hover‑expand

    // close mobile drawer on route change
    useEffect(() => {
        setSidebarOpen(false);
    }, [pathname]);

    // nav definitions
    const navItems: NavItemMeta[] = [
        { name: "概览", href: "/overview", icon: <Home size={20} />, group: "Metrics" },
        { name: "使用率和显存使用率", href: "/utilization", icon: <Gauge size={20} />, group: "Metrics" },
        { name: "温度", href: "/temperature", icon: <Thermometer size={20} />, group: "Metrics" },
        { name: "功耗与频率", href: "/power", icon: <Activity size={20} />, group: "Metrics" },
        { name: "关于", href: "/about", icon: <Info size={20} />, group: "Info" }
    ];

    // memoized active index for indicator
    const activeIndex = useMemo(
        () => navItems.findIndex((n) => pathname === n.href || pathname.startsWith(n.href)),
        [pathname]
    );

    const grouped = useMemo(
        () => ({ Metrics: navItems.filter((n) => n.group === "Metrics"), Info: navItems.filter((n) => n.group === "Info") }),
        []
    );

    // ---------------------------------------------------------------------------
    // Animation variants
    // ---------------------------------------------------------------------------
    const sidebarVariants = {
        closed: { x: "-100%", opacity: 0, transition: { type: "spring", stiffness: 400, damping: 45 } },
        open: { x: 0, opacity: 1, transition: { type: "spring", stiffness: 80, damping: 18 } }
    } as const;

    const listVariants = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.12 } } } as const;

    const itemVariants = {
        hidden: { opacity: 0, x: -28 },
        show: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 230, damping: 23 } }
    } as const;

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------
    function NavItem({ meta }: { meta: NavItemMeta }) {
        const active = pathname === meta.href || pathname.startsWith(meta.href);
        return (
            <motion.div variants={itemVariants}>
                <Link
                    href={meta.href}
                    className={`group/item relative flex h-12 items-center gap-4 rounded-xl px-6 py-3.5 transition-all duration-400 ease-[cubic-bezier(0.34,1.56,0.64,1)] select-none ${
                        active
                            ? "bg-gradient-to-r from-gray-200/80 via-gray-100/60 to-gray-200/40 text-gray-900"
                            : "text-gray-600 hover:text-gray-900"
                    }`}
                >
                    {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-2/3 w-1 rounded-full bg-gray-700 opacity-60" />}
                    <span
                        className={`z-10 transition-all duration-500 ${
                            active ? "text-gray-900 scale-[1.15] -rotate-6" : "group-hover/item:scale-110 group-hover/item:text-gray-900"
                        }`}
                    >
            {meta.icon}
          </span>
                    <span
                        className={`whitespace-nowrap text-[0.95rem] font-medium tracking-wide transition-all duration-500 ${
                            isHovered ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"
                        } ${active ? "text-gray-800" : ""}`}
                    >
            {meta.name}
          </span>
                </Link>
            </motion.div>
        );
    }

    function NavGroup({ title, items }: { title: string; items: NavItemMeta[] }) {
        return (
            <div className="mb-6">
                <h2
                    className={`mb-2 px-6 text-xs font-medium uppercase tracking-wider text-gray-500 transition-all duration-500 ${
                        isHovered ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8"
                    }`}
                >
                    {title}
                </h2>
                <motion.div variants={listVariants} initial="hidden" animate="show" className="space-y-1.5">
                    {items.map((it) => (
                        <NavItem key={it.href} meta={it} />
                    ))}
                </motion.div>
            </div>
        );
    }

    // ---------------------------------------------------------------------------
    // JSX
    // ---------------------------------------------------------------------------
    return (
        <>
            {/* Mobile toggle */}
            <motion.button
                className="fixed top-4 left-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border bg-white/90 text-gray-700 backdrop-blur shadow-lg md:hidden border-gray-200/50 transition-all duration-300 hover:scale-105 active:scale-95"
                whileTap={{ scale: 0.9 }}
                onClick={() => setSidebarOpen((o) => !o)}
                aria-label="Toggle menu"
            >
                {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </motion.button>

            {/* Sidebar */}
            <AnimatePresence>
                {(sidebarOpen || isDesktop) && (
                    <motion.nav
                        key="sidebar"
                        initial="closed"
                        animate="open"
                        exit="closed"
                        variants={sidebarVariants}
                        onMouseEnter={() => isDesktop && setIsHovered(true)}
                        onMouseLeave={() => isDesktop && setIsHovered(false)}
                        className={`fixed left-6 top-1/2 z-40 flex h-[85vh] -translate-y-1/2 flex-col overflow-hidden rounded-2xl border bg-gradient-to-b from-white/95 via-gray-100/95 to-white/95 border-gray-200/90 backdrop-blur shadow-[0_0_60px_-15px_rgba(0,0,0,0.15)] transition-all duration-500 ${
                            isHovered ? "w-72" : "w-24"
                        }`}
                    >
                        {/* Logo */}
                        <Link href="/overview" className="mb-10 flex items-center px-6 pt-10">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-200 transition-all duration-500">
                                <Home size={24} className="text-gray-600" />
                            </div>
                            <span
                                className={`ml-3 text-lg font-medium tracking-wide text-gray-800 transition-all duration-500 ${
                                    isHovered ? "opacity-100" : "opacity-0 -translate-x-10"
                                }`}
                            >
                GPU 仪表板
              </span>
                        </Link>

                        {/* Nav groups */}
                        <div className="flex-1 overflow-y-auto px-1 pb-6">
                            <NavGroup title="Metrics" items={grouped.Metrics} />
                            <NavGroup title="Info" items={grouped.Info} />
                        </div>
                    </motion.nav>
                )}
            </AnimatePresence>

            {/* Overlay */}
            <AnimatePresence>
                {sidebarOpen && !isDesktop && (
                    <motion.div
                        className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        onClick={() => setSidebarOpen(false)}
                    />
                )}
            </AnimatePresence>
        </>
    );
}