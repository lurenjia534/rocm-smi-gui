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
type RocmPid = {
    pid: number
    name: string
    gpu_index: number
    vram_bytes: number
    engine_usage: number
    state: string
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


/* ---------- ★ 新组件：ProcessTable ---------- */
function ProcessTable({ procs }: { procs: RocmPid[] }) {
    if (procs.length === 0) return null
    return (
        <motion.div 
            className="w-full max-w-7xl mx-auto px-4 pb-10 overflow-x-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
        >
            <div className="rounded-xl bg-white/90 shadow-lg p-5 backdrop-blur-sm">
                <h3 className="text-gray-700 font-medium text-lg mb-4">运行中的 GPU 进程</h3>
                <div className="overflow-hidden">
                    <table className="min-w-full text-sm">
                        <thead className="bg-transparent text-gray-500">
                        <tr>
                            <th className="px-3 py-3 text-left font-medium">PID</th>
                            <th className="px-3 py-3 text-left font-medium">进程</th>
                            <th className="px-3 py-3 text-right font-medium">GPU</th>
                            <th className="px-3 py-3 text-right font-medium">显存&nbsp;MB</th>
                            <th className="px-3 py-3 text-right font-medium">引擎&nbsp;%</th>
                        </tr>
                        </thead>
                        <tbody>
                        {procs.map((p, index) => (
                            <motion.tr 
                                key={p.pid} 
                                className="hover:bg-gray-50/80"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ 
                                    duration: 0.3, 
                                    delay: index * 0.05,
                                    type: 'spring',
                                    stiffness: 120,
                                    damping: 20
                                }}
                            >
                                <td className="px-3 py-3 text-gray-700">{p.pid}</td>
                                <td className="px-3 py-3 text-gray-800 font-medium">{p.name}</td>
                                <td className="px-3 py-3 text-right text-gray-700">{p.gpu_index}</td>
                                <td className="px-3 py-3 text-right text-gray-700">
                                    <span className="font-medium">{(p.vram_bytes / 1_048_576).toFixed(1)}</span>
                                </td>
                                <td className="px-3 py-3 text-right">
                                    <span className={`px-2 py-1 rounded-lg text-xs ${
                                        p.engine_usage > 70 ? 'bg-gray-200 text-gray-800' : 
                                        p.engine_usage > 30 ? 'bg-gray-100 text-gray-700' : 
                                        'bg-gray-50 text-gray-600'
                                    }`}>
                                        {p.engine_usage}
                                    </span>
                                </td>
                            </motion.tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </motion.div>
    )
}

/* ---------- UI Component: Metric Card (Modern Style) ---------- */
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
    
    // 处理数值
    const numericValue = (() => {
        // 如果值是数字，直接使用
        if (typeof value === 'number') return value
        
        // 如果值是字符串但可以解析为数字
        if (typeof value === 'string') {
            // 处理可能的百分比格式 (如 "75%")
            const cleanValue = value.replace('%', '').trim()
            const parsed = parseFloat(cleanValue)
            if (!isNaN(parsed)) return parsed
        }
        
        return null
    })()
    
    // 确定是否显示进度条
    const showProgress = (() => {
        // 单位为%的数值一定显示进度条
        if (unit === '%' && numericValue !== null) return true
        
        // GPU和VRAM利用率的关键词检查
        if (label.includes('利用率') && numericValue !== null) return true
        
        // 处理"XX / YY MB (ZZ%)"格式的显存占用
        if (typeof value === 'string' && value.includes('%')) {
            const match = value.match(/\((\d+)%\)/)
            if (match && match[1]) return true
        }
        
        return false
    })()
    
    // 获取进度值 (0-100)
    const progressValue = (() => {
        if (!showProgress) return null
        
        // 直接是百分比的情况
        if (unit === '%' && numericValue !== null) {
            return Math.min(Math.max(numericValue, 0), 100)
        }
        
        // 从字符串提取百分比
        if (typeof value === 'string') {
            const match = value.match(/\((\d+)%\)/)
            if (match && match[1]) {
                return Math.min(Math.max(parseFloat(match[1]), 0), 100)
            }
        }
        
        // 针对其他利用率，考虑是0-1.0范围的情况
        if (label.includes('利用率') && numericValue !== null) {
            if (numericValue <= 1) return numericValue * 100
            return Math.min(Math.max(numericValue, 0), 100)
        }
        
        return null
    })()
    
    // 确定基于值的颜色
    const getProgressColor = (val: number) => {
        if (val > 80) return 'bg-gray-700' // 高负载用深灰
        if (val > 50) return 'bg-gray-600' // 中负载用中灰
        if (val > 20) return 'bg-gray-500' // 低负载用中浅灰
        return 'bg-gray-400' // 很低负载用浅灰
    }

    return (
        <motion.div
            className="
                h-20 w-full rounded-xl p-4 
                bg-white/90 shadow-md backdrop-blur-sm
                transition-all duration-300 ease-out
                flex items-center
            "
            whileHover={{ 
                scale: 1.02, 
                boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                backgroundColor: 'rgba(255, 255, 255, 0.98)'
            }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        >
            {/* 左侧区域：图标和文字信息 */}
            <div className="flex-1 flex items-center gap-3">
                <div className="bg-gray-100 rounded-full p-2">
                    <IconComponent className="h-5 w-5 text-gray-600" strokeWidth={1.5} />
                </div>
                <div className="flex flex-col">
                    <span className="text-xs text-gray-500 leading-tight">{label}</span>
                    <span className="text-base font-medium text-gray-800 leading-tight">
                        {displayValue}{displayUnit}
                    </span>
                </div>
            </div>
            
            {/* 右侧区域：进度条 */}
            {progressValue !== null && (
                <div className="w-1/3 h-3 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div 
                        className={`h-full ${getProgressColor(progressValue)}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${progressValue}%` }}
                        transition={{ 
                            type: 'spring', 
                            stiffness: 120, 
                            damping: 14,
                            delay: 0.1
                        }}
                    />
                </div>
            )}
        </motion.div>
    )
}

/* ---------- UI Component: Metrics Grid (Modern Style) ---------- */
function MetricsGrid({ device }: { device: NormalizedDevice }) {
    const metrics: MetricDefinition[] = [
        { key: 'edgeTemp', label: '核心温度', icon: Icon.Thermometer, unit: '°C' },
        { key: 'hotspotTemp', label: '热点温度', icon: Icon.ThermometerSun, unit: '°C' },
        { key: 'memTemp', label: '显存温度', icon: Icon.MemoryStick, unit: '°C' },
        { key: 'power', label: '功耗', icon: Icon.Zap, unit: 'W', precision: 1 },
        { key: 'gpuUtil', label: 'GPU 利用率', icon: Icon.Activity, unit: '%' },
        { key: 'vramUtil', label: '显存利用率', icon: Icon.PieChart, unit: '%' },
        { key: 'vramUsed', label: '显存占用', icon: Icon.Database, unit: 'MB', precision: 0 },
        { key: 'fanRpm', label: '风扇转速', icon: Icon.Wind, unit: 'RPM' },
        { key: 'sclk', label: '核心频率', icon: Icon.Cpu, unit: 'MHz' },
        { key: 'mclk', label: '显存频率', icon: Icon.MemoryStick, unit: 'MHz' },
        { key: 'powerCap', label: '功耗上限', icon: Icon.Power, unit: 'W' },
        { key: 'vramVendor', label: '显存厂商', icon: Icon.Info },
    ];

    const formatValue = (metric: MetricDefinition) => {
        const rawValue = device[metric.key];
        if (rawValue === null || rawValue === undefined) return null;

        // 特殊处理 vramUsed，保留数值形式的 vramUtil 以便显示进度条
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
            return metric.precision !== undefined 
                ? parseFloat(rawValue.toFixed(metric.precision)) // 保持数值类型
                : rawValue; // 直接返回数值
        }
        
        return String(rawValue);
    }

    return (
        <motion.div 
            className="w-full max-w-7xl mx-auto pt-24 pb-6 px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
        >
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {metrics.map((metric) => {
                    const formattedValue = formatValue(metric);
                    // 只为显存占用特殊处理单位
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

    return (
        <motion.div 
            className="absolute top-0 left-0 right-0 h-20 px-6 bg-white/95 backdrop-blur-sm flex items-center justify-between z-10 shadow-sm"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, type: 'spring', stiffness: 100 }}
        >
            <div className="flex items-center gap-4">
                <div className="flex gap-2">
                    <motion.button
                        onClick={onPrev}
                        disabled={deviceCount <= 1}
                        className="rounded-full bg-white/80 shadow-sm p-2.5 text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        aria-label="Previous GPU"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                    >
                        <Icon.ChevronLeft className="h-5 w-5" />
                    </motion.button>
                    <motion.button
                        onClick={onNext}
                        disabled={deviceCount <= 1}
                        className="rounded-full bg-white/80 shadow-sm p-2.5 text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        aria-label="Next GPU"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                    >
                        <Icon.ChevronRight className="h-5 w-5" />
                    </motion.button>
                </div>
                
                <div className="flex flex-col items-start pl-1">
                    <div className="flex items-center gap-2">
                        <h1 className="text-lg font-medium text-gray-900">
                            {selectedDevice.name}
                        </h1>
                        {kind && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">
                                {kind}
                            </span>
                        )}
                    </div>
                    <span className="text-sm text-gray-500 mt-0.5">
                        GPU {selectedIndex + 1} / {deviceCount}
                        {selectedDevice.subsystem && ` · ${selectedDevice.subsystem}`}
                    </span>
                </div>
            </div>
            
            <div className="flex items-center gap-5">
                <div className="relative">
                    <select
                        value={selectedIndex}
                        onChange={(e) => onSelect(parseInt(e.target.value, 10))}
                        disabled={deviceCount <= 1}
                        className="
                            appearance-none rounded-lg bg-white/80 shadow-sm py-2 pl-4 pr-10
                            text-sm text-gray-700 hover:text-gray-900 cursor-pointer 
                            focus:ring-2 focus:ring-gray-200 focus:outline-none
                            disabled:opacity-40 disabled:cursor-not-allowed
                            transition-all duration-200
                        "
                        aria-label="Select GPU"
                    >
                        {devices.map((d, i) => (
                            <option key={i} value={i} className="text-gray-800 py-1">
                                {normalize(d).name ?? `Device ${i + 1}`}
                            </option>
                        ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500">
                        <Icon.ChevronDown className="h-4 w-4" />
                    </div>
                </div>
                
                {rocmVer && (
                    <motion.div 
                        className="hidden sm:flex flex-col items-end"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                    >
                        <span className="text-sm font-medium text-gray-700">ROCm</span>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span>SMI {rocmVer.smi}</span>
                            <span className="h-3 w-px bg-gray-300"></span>
                            <span>LIB {rocmVer.lib}</span>
                        </div>
                    </motion.div>
                )}
            </div>
        </motion.div>
    )
}

/* ---------- Main Page Component (Monochrome Style) ---------- */
export default function Home() {
    const [snapshot, setSnapshot] = useState<RawDevice[] | null>(null)
    const [procs, setProcs]       = useState<RocmPid[]>([])            // ★ 新增
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
        let unlistenPid: (() => void) | null = null;

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

        /* ---------- ★ 进程监听 ---------- */
        listen<RocmPid[]>('gpu-pids-update', ({ payload }) => {
            if (Array.isArray(payload)) setProcs(payload)
        }).then(fn => (unlistenPid = fn))
          .catch(err => {
                console.error("Effect Hook: Failed to listen for gpu-pids-update:", err);
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
            if (unlistenPid) {
                unlistenPid(); // Detach the pid listener
                console.log("Effect Hook: PID Listener detached.");
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
                <ProcessTable procs={procs} />      {/* ★ 插入这里 */}
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
