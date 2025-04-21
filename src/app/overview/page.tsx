'use client'

import { useEffect, useState, useMemo } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import * as Icon from 'lucide-react'
import { motion } from 'framer-motion'

/* ---------- Types (Remain the same) ---------- */
type RawDevice = Record<string, unknown> & { kind?: string }
type RocmVer = { smi: string; lib: string }
type NormalizedDevice = ReturnType<typeof normalize>
type MetricDefinition = {
    key: keyof NormalizedDevice
    label: string
    icon: React.ElementType
    unit?: string
    precision?: number
}

/* ---------- Data Normalization (Remains the same) ---------- */
function normalize(d: RawDevice | null | undefined) {
    if (!d) {
        return {
            name: 'N/A', vendor: undefined, subsystem: undefined, gfx: undefined, edgeTemp: null, hotspotTemp: null,
            memTemp: null, fanRpm: null, power: null, gpuUtil: null, vramUtil: null, vramVendor: null, kind: undefined,
            sclk: null, mclk: null, vramTotal: null, vramUsed: null, powerCap: null,
        }
    }
    const vramTotalMB = d['vram_total_mb'] as number | null ?? (d['VRAM Total Memory (B)'] ? Number(d['VRAM Total Memory (B)']) / 1_048_576 : null);
    const vramUsedMB = d['vram_used_mb'] as number | null ?? (d['VRAM Total Used Memory (B)'] ? Number(d['VRAM Total Used Memory (B)']) / 1_048_576 : null);
    let vramUtil = d['GPU Memory Allocated (VRAM%)'] as number | null;
    if (vramUtil === null && vramTotalMB && vramUsedMB !== null && vramTotalMB > 0) {
        vramUtil = Math.round((vramUsedMB / vramTotalMB) * 100);
    }
    return {
        name: d['Device Name'] as string ?? 'Unknown Device', vendor: d['Card Vendor'] as string | undefined,
        subsystem: d['Subsystem ID'] as string | undefined, gfx: d['GFX Version'] as string | undefined,
        edgeTemp: d['Temperature (Sensor edge) (C)'] as number | null, hotspotTemp: d['Temperature (Sensor junction) (C)'] as number | null,
        memTemp: d['Temperature (Sensor memory) (C)'] as number | null, fanRpm: d['Fan RPM'] as number | null,
        power: d['Average Graphics Package Power (W)'] as number | null, gpuUtil: d['GPU use (%)'] as number | null,
        vramUtil: vramUtil, vramVendor: d['GPU memory vendor'] as string | null,
        kind: d.kind as 'Discrete' | 'Integrated' | 'Unknown' | undefined, sclk: d['sclk clock speed:'] as number | null,
        mclk: d['mclk clock speed:'] as number | null, vramTotal: vramTotalMB, vramUsed: vramUsedMB,
        powerCap: d['Max Graphics Package Power (W)'] as number | null,
    }
}


/* ---------- UI Component: Metric Card (Monochrome Style) ---------- */
function MetricCard({
                        icon: IconComponent,
                        label,
                        value,
                        unit,
                    }: {
    icon: React.ElementType
    label: string
    value?: string | number | null
    unit?: string
}) {
    const displayValue = value ?? '--'
    const displayUnit = value !== null && value !== undefined && unit ? ` ${unit}` : ''

    return (
        <motion.div
            className="
                h-20 w-full rounded-lg p-3 flex flex-col items-center justify-center gap-1
                bg-white border border-gray-200 shadow-sm
                transition-colors duration-200 ease-in-out
            "
            whileHover={{ scale: 1.03, borderColor: 'rgb(209 213 219)' /* gray-300 */, boxShadow: '0 2px 4px rgba(0,0,0,0.04)'}}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        >
            <IconComponent className="h-5 w-5 text-gray-400 mb-0.5" strokeWidth={1.5} />
            <span className="text-xs text-gray-500 text-center leading-tight">{label}</span>
            <span className={`text-base font-semibold text-gray-800 leading-tight`}>
                {displayValue}{displayUnit}
            </span>
        </motion.div>
    )
}


/* ---------- UI Component: Top Controls (Monochrome Style) ---------- */
function TopControls({
                         devices,
                         selectedIndex,
                         onPrev,
                         onNext,
                         onSelect,
                         rocmVer,
                     }: {
    devices: RawDevice[]
    selectedIndex: number
    onPrev: () => void
    onNext: () => void
    onSelect: (index: number) => void
    rocmVer?: RocmVer | null
}) {
    const selectedDevice = normalize(devices[selectedIndex]);
    const deviceCount = devices.length;
    const kind = selectedDevice.kind;
    const kindBadgeClass = 'bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-200';

    return (
        <div className="absolute top-0 left-0 right-0 h-16 px-4 bg-white border-b border-gray-200 flex items-center justify-between z-10">
            <div className="flex items-center gap-3">
                <button
                    onClick={onPrev}
                    disabled={deviceCount <= 1}
                    className="rounded-full bg-white border border-gray-300 p-2 text-gray-500 hover:bg-gray-100 hover:border-gray-400 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    aria-label="Previous GPU"
                >
                    <Icon.ChevronLeft className="h-5 w-5" />
                </button>
                <div className="flex flex-col items-start">
                    <h1 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                        {selectedDevice.name}
                        {kind && (
                            <span className={`ml-1 rounded px-1.5 py-0.5 text-xs font-medium ${kindBadgeClass}`}>
                                {kind}
                            </span>
                        )}
                    </h1>
                    <span className="text-xs text-gray-500">
                        GPU {selectedIndex + 1} / {deviceCount}
                        {selectedDevice.subsystem && ` | ${selectedDevice.subsystem}`}
                    </span>
                </div>
                <button
                    onClick={onNext}
                    disabled={deviceCount <= 1}
                    className="rounded-full bg-white border border-gray-300 p-2 text-gray-500 hover:bg-gray-100 hover:border-gray-400 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    aria-label="Next GPU"
                >
                    <Icon.ChevronRight className="h-5 w-5" />
                </button>
            </div>
            <div className="flex items-center gap-4">
                <div className="relative">
                    <select
                        value={selectedIndex}
                        onChange={(e) => onSelect(parseInt(e.target.value, 10))}
                        disabled={deviceCount <= 1}
                        className="
                            appearance-none rounded border border-gray-300 bg-white py-1 pl-3 pr-8
                            text-sm text-gray-900 focus:border-gray-400 focus:ring-1 focus:ring-gray-400/50 focus:outline-none
                            disabled:opacity-50 disabled:cursor-not-allowed
                        "
                        aria-label="Select GPU"
                    >
                        {devices.map((d, i) => (
                            <option key={i} value={i} className="text-gray-900">
                                {normalize(d).name ?? `Device ${i + 1}`}
                            </option>
                        ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                        <Icon.ChevronDown className="h-4 w-4" />
                    </div>
                </div>
                {rocmVer && (
                    <div className="hidden sm:block text-xs text-gray-500 text-right leading-tight">
                        ROCm-SMI {rocmVer.smi}<br />LIB {rocmVer.lib}
                    </div>
                )}
            </div>
        </div>
    )
}

/* ---------- UI Component: Metrics Grid (Monochrome Style) ---------- */
function MetricsGrid({ device }: { device: NormalizedDevice }) {
    const metrics: MetricDefinition[] = [
        { key: 'edgeTemp', label: '核心温度', icon: Icon.Thermometer, unit: '°C' },
        { key: 'hotspotTemp', label: '热点温度', icon: Icon.ThermometerSun, unit: '°C' },
        { key: 'memTemp', label: '显存温度', icon: Icon.MemoryStick, unit: '°C' },
        { key: 'power', label: '功耗', icon: Icon.Zap, unit: 'W', precision: 1 },
        { key: 'gpuUtil', label: 'GPU 利用率', icon: Icon.Activity, unit: '%' },
        { key: 'vramUsed', label: '显存占用', icon: Icon.Database, unit: 'MB', precision: 0 },
        { key: 'fanRpm', label: '风扇转速', icon: Icon.Wind, unit: 'RPM' },
        { key: 'sclk', label: '核心频率', icon: Icon.Cpu, unit: 'MHz' },
        { key: 'mclk', label: '显存频率', icon: Icon.MemoryStick, unit: 'MHz' },
        { key: 'powerCap', label: '功耗上限', icon: Icon.Power, unit: 'W' },
        { key: 'vramVendor', label: '显存厂商', icon: Icon.Info },
        { key: 'gfx', label: 'GFX 版本', icon: Icon.Info }
    ];

    const formatValue = (metric: MetricDefinition) => {
        const rawValue = device[metric.key];
        if (rawValue === null || rawValue === undefined) return null;

        if (metric.key === 'vramUsed' && device.vramTotal !== null) {
            const used = Math.round(device.vramUsed ?? 0);
            const total = Math.round(device.vramTotal);
            const util = device.vramUtil !== null ? ` (${device.vramUtil}%)` : '';
            if (total > 0) {
                return `${used} / ${total} MB${util}`;
            } else {
                return `${used} / ${total} MB`;
            }
        }

        if (typeof rawValue === 'number') {
            return metric.precision !== undefined ? rawValue.toFixed(metric.precision) : rawValue.toString();
        }
        return String(rawValue);
    }

    return (
        <div className="w-full max-w-7xl mx-auto pt-20 pb-6 px-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {metrics.map((metric) => {
                    const formattedValue = formatValue(metric);
                    const unit = metric.key === 'vramUsed' ? undefined : metric.unit;

                    return (
                        <MetricCard
                            key={metric.key}
                            icon={metric.icon}
                            label={metric.label}
                            value={formattedValue}
                            unit={unit}
                        />
                    )
                })}
            </div>
        </div>
    )
}


/* ---------- Main Page Component (Monochrome Style) ---------- */
export default function Home() {
    const [snapshot, setSnapshot] = useState<RawDevice[] | null>(null)
    const [rocmVer, setRocmVer] = useState<RocmVer | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [selectedDeviceIndex, setSelectedDeviceIndex] = useState<number>(0)

    // --- useEffect Hook for Setup ---
    // This hook correctly uses an empty dependency array `[]`.
    // Purpose: Run only ONCE on component mount to:
    //   1. Set up the Tauri event listener ('gpu-update').
    //   2. Fetch the ROCm version information.
    // The cleanup function returned by this effect runs only ONCE on component unmount.
    // This ensures the listener is properly removed to prevent memory leaks.
    // ---
    // WHY THIS IS CORRECT FOR THE HMR WARNING:
    // The warning "useEffect changed size" happens when HMR swaps code
    // and the *length* of the dependency array differs between the old and new code
    // for the *same* hook instance. By keeping this hook's dependency array
    // consistently `[]`, its length is always 0. The warning likely occurred
    // because a previous version during development *might* have had a different
    // dependency array (e.g., `[selectedDeviceIndex]`). A full page refresh (F5)
    // clears this HMR state and resolves the warning.
    // ---
    useEffect(() => {
        console.log("Effect Hook: Mounting - Setting up listener & checking ROCm.");
        let unlistenGpu: (() => void) | null = null;

        listen<RawDevice[]>('gpu-update', ({ payload }) => {
            // Update snapshot state based on incoming payload
            setSnapshot(prevSnapshot => {
                if (payload && Array.isArray(payload)) {
                    const currentLength = prevSnapshot?.length ?? 0;
                    const newLength = payload.length;
                    let newIndex = selectedDeviceIndex;

                    // Reset index if it becomes invalid
                    if (selectedDeviceIndex >= newLength && newLength > 0) {
                        console.log(`Index ${selectedDeviceIndex} invalid for new length ${newLength}, resetting.`);
                        newIndex = 0; // Reset to first device
                    } else if (newLength === 0 && currentLength > 0) {
                        console.log("All devices disappeared, resetting index.");
                        newIndex = 0; // Reset index if all devices disappear
                    }
                    // Only update index state if it actually needs changing
                    if (newIndex !== selectedDeviceIndex) {
                        setSelectedDeviceIndex(newIndex);
                    }

                    setError(null); // Clear any previous error
                    return payload; // Update snapshot
                } else if (payload === null || payload === undefined) {
                    // Handle cases where backend might explicitly send null/undefined
                    console.log("Received null/undefined payload, treating as no devices.");
                    setError(null);
                    setSelectedDeviceIndex(0);
                    return [];
                }
                // Optional: Handle invalid payload type if needed, though Tauri types should help
                console.warn("Received unexpected payload type for gpu-update:", payload);
                return prevSnapshot; // Keep previous state if payload is invalid
            });
        })
            .then(fn => {
                console.log("Effect Hook: Listener attached.");
                unlistenGpu = fn;
            })
            .catch(err => {
                console.error("Effect Hook: Failed to listen for gpu-update:", err);
                setError("无法监听 GPU 更新事件。");
                setSnapshot([]); // Clear data on listener error
                setSelectedDeviceIndex(0);
            });

        // Fetch ROCm version
        invoke<{ version?: { 'ROCM-SMI version': string; 'ROCM-SMI-LIB version': string } }>('check_rocm_smi')
            .then(res => {
                const v = res.version;
                if (v && v['ROCM-SMI version'] && v['ROCM-SMI-LIB version']) {
                    setRocmVer({ smi: v['ROCM-SMI version'], lib: v['ROCM-SMI-LIB version'] });
                } else {
                    setRocmVer(null);
                }
            })
            .catch(err => {
                console.error("Effect Hook: Failed to invoke check_rocm_smi:", err);
                setRocmVer(null); // Assume unavailable
            });

        // Cleanup function: Runs when the component unmounts
        return () => {
            console.log("Effect Hook: Unmounting - Cleaning up listener.");
            if (unlistenGpu) {
                unlistenGpu(); // Detach the listener
                console.log("Effect Hook: Listener detached.");
            }
        };
    }, []); // <-- **Correct**: Empty array `[]` ensures this effect runs only on mount/unmount

    // --- Memoize Normalized Device Data ---
    // Recalculates only when snapshot or selectedDeviceIndex changes
    const selectedDeviceData = useMemo(() => {
        if (!snapshot || snapshot.length === 0 || selectedDeviceIndex >= snapshot.length) {
            return normalize(null); // Return default empty data if snapshot is invalid/empty
        }
        return normalize(snapshot[selectedDeviceIndex]);
    }, [snapshot, selectedDeviceIndex]); // Dependencies are correct

    // --- Event Handlers ---
    // Update selectedDeviceIndex state; UI re-renders reactively via useMemo/renderContent
    const handleNextDevice = () => {
        if (snapshot && snapshot.length > 0) {
            setSelectedDeviceIndex((prevIndex) => (prevIndex + 1) % snapshot.length);
        }
    };
    const handlePrevDevice = () => {
        if (snapshot && snapshot.length > 0) {
            setSelectedDeviceIndex((prevIndex) => (prevIndex - 1 + snapshot.length) % snapshot.length);
        }
    };
    const handleSelectDevice = (index: number) => {
        if (snapshot && index >= 0 && index < snapshot.length) {
            setSelectedDeviceIndex(index);
        }
    };

    // --- Render Logic ---
    // Determines what to display based on current state (error, loading, data)
    const renderContent = () => {
        if (error) {
            return <p className="absolute inset-0 flex items-center justify-center text-red-600 px-6 text-center">{error}</p>;
        }
        if (snapshot === null) {
            return (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-gray-500">
                    <Icon.Loader className="animate-spin h-8 w-8 text-gray-400" />
                    <span>等待 GPU 数据...</span>
                </div>
            );
        }
        if (snapshot.length === 0) {
            return <p className="absolute inset-0 flex items-center justify-center text-gray-500">未检测到支持的 GPU 设备。</p>;
        }
        // Display controls and grid when data is available
        return (
            <>
                <TopControls
                    devices={snapshot}
                    selectedIndex={selectedDeviceIndex}
                    onPrev={handlePrevDevice}
                    onNext={handleNextDevice}
                    onSelect={handleSelectDevice}
                    rocmVer={rocmVer}
                />
                <MetricsGrid device={selectedDeviceData} />
            </>
        );
    };

    // --- Main Component Return ---
    return (
        <main className="relative min-h-screen bg-gray-50 text-gray-900 overflow-x-hidden">
            {renderContent()}
        </main>
    );
}