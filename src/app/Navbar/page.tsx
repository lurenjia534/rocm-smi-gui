"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Home, Gauge, Thermometer, Activity, Info, Layers, ChevronRight } from "lucide-react";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------
interface NavItemMeta {
    name: string;
    href: string;
    icon: React.ElementType;
    group: "指标" | "信息";
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
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

    // close mobile drawer on route change
    useEffect(() => {
        setSidebarOpen(false);
    }, [pathname]);

    // nav definitions
    const navItems: NavItemMeta[] = [
        { name: "概览", href: "/overview", icon: Home, group: "指标" },
        { name: "使用率和显存", href: "/utilization", icon: Gauge, group: "指标" },
        { name: "温度监控", href: "/temperature", icon: Thermometer, group: "指标" },
        { name: "功耗与频率", href: "/power", icon: Activity, group: "指标" },
        { name: "关于", href: "/about", icon: Info, group: "信息" }
    ];

    // memoized active index
    const activeIndex = useMemo(
        () => navItems.findIndex((n) => pathname === n.href || pathname.startsWith(n.href)),
        [pathname, navItems]
    );

    // grouped nav items
    const grouped = useMemo(
        () => ({
            "指标": navItems.filter((n) => n.group === "指标"),
            "信息": navItems.filter((n) => n.group === "信息")
        }),
        [navItems]
    );

    // ---------------------------------------------------------------------------
    // Animation variants
    // ---------------------------------------------------------------------------
    const sidebarVariants = {
        closed: { x: "-100%", opacity: 0, transition: { type: "spring", stiffness: 300, damping: 30 } },
        open: { x: 0, opacity: 1, transition: { type: "spring", stiffness: 80, damping: 20 } }
    };

    const listVariants = {
        hidden: { opacity: 0 },
        show: { 
            opacity: 1,
            transition: { staggerChildren: 0.07, delayChildren: 0.1 } 
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, x: -15, y: 5 },
        show: { 
            opacity: 1, 
            x: 0, 
            y: 0,
            transition: { type: "spring", stiffness: 250, damping: 20 } 
        }
    };

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------
    function NavItem({ item }: { item: NavItemMeta }) {
        const Icon = item.icon;
        const active = pathname === item.href || pathname.startsWith(item.href);
        
        return (
            <motion.div variants={itemVariants}>
                <Link href={item.href}>
                    <motion.div
                        className={`
                            flex items-center px-4 py-3 my-1 rounded-xl
                            transition-all duration-300
                            ${active 
                                ? 'bg-gray-100/80 text-gray-900' 
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                            }
                        `}
                        whileHover={{ 
                            x: 4,
                            transition: { type: "spring", stiffness: 400, damping: 25 }
                        }}
                        whileTap={{ scale: 0.98 }}
                    >
                        <div className={`
                            flex items-center justify-center w-10 h-10 rounded-lg
                            ${active 
                                ? 'bg-white text-gray-900 shadow-sm' 
                                : 'text-gray-600 bg-transparent'
                            }
                        `}>
                            <Icon 
                                size={active ? 20 : 18} 
                                strokeWidth={active ? 2 : 1.5} 
                                className={active ? "text-gray-800" : "text-gray-500"}
                            />
                        </div>
                        
                        <div className={`
                            ml-3
                            transition-all duration-300 ease-out
                            ${isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-6'}
                            ${isDesktop ? '' : 'opacity-100 translate-x-0'}
                        `}>
                            <span className="font-medium tracking-wide text-[0.95rem]">
                                {item.name}
                            </span>
                        </div>
                        
                        {active && (
                            <motion.div
                                className={`
                                    ml-auto mr-2
                                    transition-all duration-300 ease-out
                                    ${isHovered ? 'opacity-100' : 'opacity-0'}
                                    ${isDesktop ? '' : 'opacity-100'}
                                `}
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ delay: 0.2 }}
                            >
                                <ChevronRight size={16} className="text-gray-500" />
                            </motion.div>
                        )}
                    </motion.div>
                </Link>
            </motion.div>
        );
    }

    function NavGroup({ title, items }: { title: string; items: NavItemMeta[] }) {
        return (
            <div className="mb-6">
                <h2
                    className={`
                        px-5 pt-2 pb-2 text-xs font-medium text-gray-400
                        transition-all duration-500 ease-out
                        ${isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}
                        ${isDesktop ? '' : 'opacity-100 translate-x-0'}
                    `}
                >
                    {title}
                </h2>
                <motion.div 
                    variants={listVariants} 
                    initial="hidden" 
                    animate="show" 
                    className="space-y-1 px-2"
                >
                    {items.map((item) => (
                        <NavItem key={item.href} item={item} />
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
            {/* Mobile toggle button */}
            <motion.button
                className="fixed top-4 left-4 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-white text-gray-700 shadow-md md:hidden"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSidebarOpen((o) => !o)}
                aria-label="Toggle menu"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
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
                        className={`
                            fixed left-0 top-0 z-40 h-full
                            flex flex-col bg-white shadow-xl
                            transition-all duration-500 ease-in-out
                            ${isDesktop 
                                ? isHovered ? 'w-64' : 'w-20'
                                : 'w-72'
                            }
                        `}
                    >
                        {/* Logo area */}
                        <div className="flex items-center px-5 py-8">
                            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100">
                                <Layers size={22} className="text-gray-700" />
                            </div>
                            <div className={`
                                ml-4
                                transition-all duration-500 ease-out
                                ${isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-10'}
                                ${isDesktop ? '' : 'opacity-100 translate-x-0'}
                            `}>
                                <h1 className="text-xl font-semibold text-gray-800">
                                    GPU 仪表板
                                </h1>
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="my-1 border-t border-gray-100 mx-4"></div>

                        {/* Navigation menu */}
                        <div className="flex-1 overflow-y-auto pt-2 pb-6 px-2">
                            {Object.entries(grouped).map(([title, items]) => (
                                <NavGroup key={title} title={title} items={items} />
                            ))}
                        </div>
                    </motion.nav>
                )}
            </AnimatePresence>

            {/* Overlay */}
            <AnimatePresence>
                {sidebarOpen && !isDesktop && (
                    <motion.div
                        className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[2px]"
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
