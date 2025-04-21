'use client'

import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'

/* ---------- 原始设备对象：键名带空格/括号 ---------- */
type RawDevice = Record<string, unknown> & { kind?: string }

/* ---------- 把 RawDevice 归一化成易用字段 ---------- */
function normalize(d: RawDevice) {
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
        vramUtil: d['GPU Memory Allocated (VRAM%)'] as number | null,
        vramVendor: d['GPU memory vendor'] as string | null,
        kind: d.kind as 'Discrete' | 'Integrated' | 'Unknown' | undefined,
        sclk:        d['sclk clock speed:'] as number | null,
        mclk:        d['mclk clock speed:'] as number | null,
        vramTotal:   d['VRAM Total Memory (B)'] ? Number(d['VRAM Total Memory (B)']) / 1_048_576 : null,
        vramUsed:    d['VRAM Total Used Memory (B)'] ? Number(d['VRAM Total Used Memory (B)']) / 1_048_576 : null,
        powerCap:    d['Max Graphics Package Power (W)'] as number | null,
        vramUsedMB:  d['vram_used_mb']  as number | null,
        vramTotalMB: d['vram_total_mb'] as number | null,
    }
}

/* ---------- UI 小组件 ---------- */
function Stat({ label, value }: { label: string; value?: string | number | null }) {
    return (
        <div className="flex justify-between text-sm">
            <span className="text-neutral-400">{label}</span>
            <span>{value ?? '--'}</span>
        </div>
    )
}

function GpuCard({ raw, rocmVer }: { raw: RawDevice; rocmVer?: string | null }) {
    const d = normalize(raw)
    return (
        <div className="rounded-xl bg-neutral-800 p-4 shadow-lg ring-1 ring-neutral-700 flex flex-col gap-2 min-w-[260px]">
            <h2 className="text-lg font-semibold mb-1 leading-snug">
                {d.name ?? 'Unk'}
                {d.kind && (
                    <span
                        className={
                            'ml-2 rounded px-2 py-0.5 text-xs ' +
                            (d.kind === 'Discrete'
                                ? 'bg-emerald-600/20 text-emerald-400'
                                : d.kind === 'Integrated'
                                    ? 'bg-indigo-600/20 text-indigo-300'
                                    : 'bg-neutral-600/20 text-neutral-300')
                        }
                    >
            {d.kind}
          </span>
                )}
            </h2>
            <p className="text-xs text-neutral-400">{d.subsystem}</p>

            <Stat label="核心温度" value={d.edgeTemp && `${d.edgeTemp}°C`} />
            <Stat label="热点温度" value={d.hotspotTemp && `${d.hotspotTemp}°C`} />
            <Stat label="显存温度" value={d.memTemp && `${d.memTemp}°C`} />
            <Stat label="功耗" value={d.power && `${d.power} W`} />
            <Stat label="GPU 利用" value={d.gpuUtil && `${d.gpuUtil}%`} />
            <Stat label="VRAM 利用" value={d.vramUtil && `${d.vramUtil}%`} />
            <Stat label="风扇" value={d.fanRpm && `${d.fanRpm} RPM`} />
            <Stat label="显存厂商" value={d.vramVendor} />
            <Stat label="GPU 核心时钟频率" value={d.sclk && `${d.sclk} MHz`} />
            <Stat label="GPU 显存时钟频" value={d.mclk && `${d.mclk} MHz`} />
            {d.vramTotal && (<Stat label="显存" value={`${Math.round(d.vramUsed ?? 0)} / ${Math.round(d.vramTotal)} MB`} />)}
            <Stat label="功耗上限" value={d.powerCap && `${d.powerCap} W`} />
            {d.vramTotalMB && (
                <Stat
                    label="显存"
                    value={`${Math.round(d.vramUsedMB ?? 0)} / ${d.vramTotalMB} MB`}
                />
            )}
            <Stat label="VRAM 利用" value={d.vramUtil && `${d.vramUtil}%`} />
            {rocmVer && (
                <div className="mt-1 text-xs text-neutral-500 text-right">
                    ROCm‑SMI {rocmVer}
                </div>
            )}
        </div>
    )
}

/* ---------- 页面 ---------- */
export default function Home() {
    const [snapshot, setSnapshot] = useState<RawDevice[] | null>(null)
    const [rocmVer, setRocmVer] = useState<string | null>(null)

    useEffect(() => {
        // 只监听实时事件即可；首次 snapshot 也会推送
        const unlisten = listen<RawDevice[]>('gpu-update', ({ payload }) =>
            setSnapshot(payload),
        )
        // 取Rocm版本 (一次就够了)
        import('@tauri-apps/api/core').then(({ invoke }) => {
            invoke<{ version?: { 'ROCM-SMI version': string } }>('check_rocm_smi')
                .then(res => setRocmVer(res.version?.['ROCM-SMI version'] ?? null))
                .catch(() => setRocmVer(null))
        })

        return () => {
            unlisten.then((f) => f())
        }
    }, [])

    return (
        <main className="min-h-screen bg-neutral-900 text-neutral-100 p-6">
            {!snapshot ? (
                <p className="text-center text-neutral-400 mt-24">等待 gpu-update…</p>
            ) : (
                <div className="max-w-6xl mx-auto grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {snapshot.map((d, i) => (
                        <GpuCard key={i} raw={d} rocmVer={rocmVer} />
                    ))}
                </div>
            )}
        </main>
    )
}
