'use client'

import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'; // Import invoke directly
import * as Icon from 'lucide-react'; // Import all Lucide icons

/* ---------- 原始设备对象：键名带空格/括号 ---------- */
type RawDevice = Record<string, unknown> & { kind?: string }
type RocmVer = { smi: string; lib: string }

/* ---------- 把 RawDevice 归一化成易用字段 ---------- */
// (Normalization function remains the same)
function normalize(d: RawDevice) {
    // Added vramUtil calculation if missing but MB values exist
    const vramTotalMB = d['vram_total_mb'] as number | null ?? (d['VRAM Total Memory (B)'] ? Number(d['VRAM Total Memory (B)']) / 1_048_576 : null);
    const vramUsedMB = d['vram_used_mb'] as number | null ?? (d['VRAM Total Used Memory (B)'] ? Number(d['VRAM Total Used Memory (B)']) / 1_048_576 : null);
    let vramUtil = d['GPU Memory Allocated (VRAM%)'] as number | null;
    if (vramUtil === null && vramTotalMB && vramUsedMB !== null && vramTotalMB > 0) {
        vramUtil = Math.round((vramUsedMB / vramTotalMB) * 100);
    }

    return {
        name: d['Device Name'] as string,
        vendor: d['Card Vendor'] as string | undefined,
        subsystem: d['Subsystem ID'] as string | undefined,
        gfx: d['GFX Version'] as string | undefined,
        edgeTemp: d['Temperature (Sensor edge) (C)'] as number | null,
        hotspotTemp: d['Temperature (Sensor junction) (C)'] as number | null,
        memTemp: d['Temperature (Sensor memory) (C)'] as number | null,
        fanRpm: d['Fan RPM'] as number | null,
        power: d['Average Graphics Package Power (W)'] as number | null,
        gpuUtil: d['GPU use (%)'] as number | null,
        vramUtil: vramUtil, // Use calculated value if original is null
        vramVendor: d['GPU memory vendor'] as string | null,
        kind: d.kind as 'Discrete' | 'Integrated' | 'Unknown' | undefined,
        sclk: d['sclk clock speed:'] as number | null,
        mclk: d['mclk clock speed:'] as number | null,
        // Prefer MB values if they exist, fall back to B values
        vramTotal: vramTotalMB,
        vramUsed: vramUsedMB,
        powerCap: d['Max Graphics Package Power (W)'] as number | null,
        // Note: Removed redundant vramUsedMB and vramTotalMB as they are now primary
    }
}


/* ---------- UI 小组件 (Stat with Icon) ---------- */
function Stat({
                  label,
                  value,
                  icon: IconComponent // Receive Icon component as prop
              }: {
    label: string;
    value?: string | number | null;
    icon?: React.ElementType; // Type for React component
}) {
    return (
        <div className="flex justify-between items-center text-sm">
            <div className="flex items-center gap-2">
                {IconComponent && <IconComponent className="h-4 w-4 text-slate-500" strokeWidth={2} />}
                <span className="text-slate-400">{label}</span>
            </div>
            <span className="font-medium text-slate-200">{value ?? '--'}</span>
        </div>
    )
}

/* ---------- GPU Card Component (Glassmorphism, Icons, Hover) ---------- */
function GpuCard({ raw, rocmVer }: { raw: RawDevice; rocmVer?: RocmVer | null }) {
    const d = normalize(raw)
    return (
        <div
            // --- Style Changes START ---
            className="
                rounded-xl p-4 flex flex-col gap-2 min-w-[260px]
                bg-gray-800/70 backdrop-blur border border-gray-700/80 shadow-lg
                transition-all duration-300 ease-in-out hover:shadow-xl hover:scale-[1.02] hover:border-gray-600
            "
            // --- Style Changes END ---
        >
            {/* --- Typography & Color Changes --- */}
            <h2 className="text-lg font-semibold mb-1 leading-snug text-slate-100">
                {d.name ?? 'Unknown Device'}
                {d.kind && (
                    <span
                        className={
                            'ml-2 rounded px-2 py-0.5 text-xs font-medium ' + // Added font-medium
                            (d.kind === 'Discrete'
                                ? 'bg-emerald-700/30 text-emerald-300 ring-1 ring-inset ring-emerald-600/30' // Adjusted colors/ring
                                : d.kind === 'Integrated'
                                    ? 'bg-indigo-700/30 text-indigo-300 ring-1 ring-inset ring-indigo-600/30' // Adjusted colors/ring
                                    : 'bg-neutral-700/30 text-neutral-300 ring-1 ring-inset ring-neutral-600/30') // Adjusted colors/ring
                        }
                    >
                        {d.kind}
                    </span>
                )}
            </h2>
            {/* --- Adjusted text color --- */}
            <p className="text-xs text-slate-500 mb-2">{d.subsystem ?? 'No Subsystem ID'}</p>

            {/* --- Pass Icons to Stat components --- */}
            <Stat icon={Icon.Thermometer} label="核心温度" value={d.edgeTemp && `${d.edgeTemp}°C`} />
            <Stat icon={Icon.ThermometerSun} label="热点温度" value={d.hotspotTemp && `${d.hotspotTemp}°C`} />
            <Stat icon={Icon.MemoryStick} label="显存温度" value={d.memTemp && `${d.memTemp}°C`} />
            <Stat icon={Icon.Zap} label="功耗" value={d.power && `${d.power.toFixed(1)} W`} />
            <Stat icon={Icon.Activity} label="GPU 利用" value={d.gpuUtil && `${d.gpuUtil}%`} />
            {/* Combined VRAM Stat */}
            {d.vramTotal !== null && (
                <Stat
                    icon={Icon.Database}
                    label="显存占用"
                    value={`${Math.round(d.vramUsed ?? 0)} / ${Math.round(d.vramTotal)} MB ${d.vramUtil !== null ? `(${d.vramUtil}%)` : ''}`}
                />
            )}
            {/* Only show VRAM % if total/used isn't available but % is */}
            {d.vramTotal === null && d.vramUtil !== null && (
                <Stat icon={Icon.Database} label="VRAM 利用" value={`${d.vramUtil}%`} />
            )}
            <Stat icon={Icon.Wind} label="风扇" value={d.fanRpm && `${d.fanRpm} RPM`} />
            <Stat icon={Icon.Cpu} label="GPU 核心频率" value={d.sclk && `${d.sclk} MHz`} />
            <Stat icon={Icon.MemoryStick} label="GPU 显存频率" value={d.mclk && `${d.mclk} MHz`} />
            <Stat icon={Icon.Power} label="功耗上限" value={d.powerCap && `${d.powerCap} W`} />
            {/* Removed redundant VRAM stats as combined above */}
            {d.vramVendor && <Stat icon={Icon.Info} label="显存厂商" value={d.vramVendor} />}

            {rocmVer && (
                // --- Adjusted text color & alignment ---
                <div className="mt-2 pt-2 border-t border-gray-700/50 text-xs text-slate-500 text-right">
                    ROCm-SMI {rocmVer.smi} / LIB {rocmVer.lib}
                </div>
            )}
        </div>
    )
}

/* ---------- 页面 ---------- */
export default function Home() {
    const [snapshot, setSnapshot] = useState<RawDevice[] | null>(null)
    const [rocmVer, setRocmVer] = useState<RocmVer | null>(null)
    const [error, setError] = useState<string | null>(null); // Add error state

    useEffect(() => {
        let unlistenGpu: (() => void) | null = null; // To store unlisten function

        // Listener for GPU updates
        listen<RawDevice[]>('gpu-update', ({ payload }) => {
            setSnapshot(payload);
            setError(null); // Clear error on successful update
        })
            .then(fn => { unlistenGpu = fn; })
            .catch(err => {
                console.error("Failed to listen for gpu-update:", err);
                setError("无法监听 GPU 更新事件。");
            });

        // Fetch ROCm version once
        invoke<{ version?: { 'ROCM-SMI version': string; 'ROCM-SMI-LIB version': string } }>('check_rocm_smi')
            .then(res => {
                const v = res.version;
                if (v) {
                    setRocmVer({ smi: v['ROCM-SMI version'], lib: v['ROCM-SMI-LIB version'] });
                } else {
                    // Optionally set rocmVer to null or a specific state if version check succeeds but returns no version info
                    // setRocmVer(null); // Or handle as needed
                }
            })
            .catch(err => {
                console.error("Failed to invoke check_rocm_smi:", err);
                // Don't necessarily set an error message here,
                // as lack of ROCm might be normal. Card might still show info.
                // setError("无法获取 ROCm 版本信息。");
                setRocmVer(null); // Explicitly set to null on error
            });


        // Cleanup function
        return () => {
            if (unlistenGpu) {
                unlistenGpu();
            }
        };
    }, []); // Empty dependency array ensures this runs only once on mount

    return (
        // --- Adjusted background and text colors ---
        <main className="min-h-screen bg-slate-900 text-slate-200 p-6">
            {error ? (
                <p className="text-center text-red-400 mt-24">{error}</p>
            ) : !snapshot ? (
                // --- Improved Loading State ---
                <div className="text-center text-slate-400 mt-24 flex flex-col items-center gap-4">
                    <Icon.Loader className="animate-spin h-8 w-8" />
                    <span>等待 GPU 数据...</span>
                </div>
            ) : snapshot.length === 0 ? (
                // --- Handle empty snapshot ---
                <p className="text-center text-slate-400 mt-24">未检测到支持的 GPU 设备。</p>
            ) : (
                // --- Layout remains the same, gap adjusted slightly ---
                <div className="max-w-7xl mx-auto grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {snapshot.map((d, i) => (
                        <GpuCard key={d['Device Name'] as string ?? i} raw={d} rocmVer={rocmVer} /> // Use device name as key if possible
                    ))}
                </div>
            )}
        </main>
    );
}