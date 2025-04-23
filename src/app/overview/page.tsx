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
    state: string  // 'active' | 'stale' - 表示进程是活跃的还是可能已退出但延迟显示
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


/* ---------- ★ 进程图标组件 ---------- */
const ProcessIcon = ({ name, state }: { name: string, state?: string }) => {
    // 安全处理名称，防止undefined导致错误
    const safeName = name || '';
    const lowerName = safeName.toLowerCase();
    const isStale = state === 'stale';
    
    // Ollama 大语言模型进程
    if (lowerName.includes('ollama')) {
        return (
            <div className={`relative flex items-center justify-center w-8 h-8 rounded-lg ${isStale ? 'bg-gray-50' : 'bg-blue-50'}`}>
                <div className="relative w-6 h-6">
                    <Icon.Brain className={`w-6 h-6 ${isStale ? 'text-gray-400' : 'text-blue-500'}`} strokeWidth={1.5} />
                    {!isStale && (
                        <motion.div
                            className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-400"
                            animate={{ opacity: [1, 0.4, 1] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                        />
                    )}
                    {isStale && (
                        <motion.div
                            className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400"
                            animate={{ opacity: [0.4, 0.8, 0.4] }}
                            transition={{ duration: 1, repeat: Infinity }}
                        />
                    )}
                </div>
            </div>
        );
    }
    
    // 图形/GPU加速进程
    if (lowerName.includes('compiz') || lowerName.includes('gnome-shell') || lowerName.includes('xorg') || lowerName.includes('wayland') || lowerName.includes('display')) {
        return <Icon.Monitor className="w-6 h-6 text-gray-500" />;
    }
    
    // 机器学习/AI相关进程
    if (lowerName.includes('python') || lowerName.includes('torch') || lowerName.includes('tensorflow') || lowerName.includes('nvidia-smi')) {
        return <Icon.Bot className="w-6 h-6 text-gray-500" />;
    }
    
    // 计算任务
    if (lowerName.includes('compute') || lowerName.includes('calc') || lowerName.includes('math')) {
        return <Icon.Calculator className="w-6 h-6 text-gray-500" />;
    }
    
    // 游戏相关进程
    if (lowerName.includes('game') || lowerName.includes('steam') || lowerName.includes('vulkan')) {
        return <Icon.Gamepad2 className="w-6 h-6 text-gray-500" />;
    }
    
    // 数据库相关进程
    if (lowerName.includes('sql') || lowerName.includes('mongo') || lowerName.includes('redis') || lowerName.includes('db')) {
        return <Icon.Database className="w-6 h-6 text-gray-500" />;
    }
    
    // 浏览器相关进程
    if (lowerName.includes('chrome') || lowerName.includes('firefox') || lowerName.includes('edge') || lowerName.includes('safari')) {
        return <Icon.Globe className="w-6 h-6 text-gray-500" />;
    }
    
    // 媒体相关进程
    if (lowerName.includes('ffmpeg') || lowerName.includes('media') || lowerName.includes('video') || lowerName.includes('audio')) {
        return <Icon.Video className="w-6 h-6 text-gray-500" />;
    }
    
    // 默认图标
    return <Icon.Terminal className="w-6 h-6 text-gray-500" />;
};

/* ---------- ★ 新组件：ProcessTable（现代风格设计） ---------- */
function ProcessTable({ procs }: { procs: RocmPid[] }) {
    // 确保传入的procs是有效数组且过滤掉可能的无效数据
    const validProcs = Array.isArray(procs) 
        ? procs.filter(p => p && typeof p === 'object' && p.pid && p.name) 
        : [];
        
    // 排序进程：按显存使用量降序
    const sortedProcs = [...validProcs].sort((a, b) => b.vram_bytes - a.vram_bytes);
    
    return (
        <motion.div 
            className="w-full max-w-7xl mx-auto px-6 md:pl-24 pb-12 overflow-hidden"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
        >
            <div className="rounded-xl bg-white/90 shadow-lg backdrop-blur-sm overflow-hidden">
                {/* 标题区域 */}
                <div className="p-6 pb-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-gray-50 rounded-full p-2">
                            <Icon.Layers className="h-5 w-5 text-gray-500" strokeWidth={1.5} />
                        </div>
                        <h3 className="text-gray-700 font-medium text-lg">运行中的Rocm GPU 进程</h3>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                        <motion.div 
                            animate={{ scale: [1, 1.15, 1] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                            className="flex items-center text-gray-500"
                        >
                            <Icon.Activity className="h-4 w-4 mr-1.5" />
                            <span className="font-medium">{sortedProcs.length}</span>
                        </motion.div>
                        <span className="px-1.5">进程</span>
                    </div>
                </div>
                
                {/* 表格区域 */}
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-gray-50/50 text-gray-500 border-b border-gray-100">
                            <tr>
                                <th className="px-6 py-3 text-left font-medium"></th>
                                <th className="px-6 py-3 text-left font-medium">PID</th>
                                <th className="px-6 py-3 text-left font-medium">进程名称</th>
                                <th className="px-6 py-3 text-center font-medium">GPU</th>
                                <th className="px-6 py-3 text-right font-medium">显存</th>
                                <th className="px-6 py-3 text-right font-medium">引擎利用率</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {sortedProcs.length > 0 ? (
                                sortedProcs.map((p, index) => {
                                    const isOllama = p.name.toLowerCase().includes('ollama');
                                    const memoryUsage = p.vram_bytes / 1_048_576; // MB
                                    
                                    return (
                                        <motion.tr 
                                            key={p.pid} 
                                            className={`hover:bg-gray-50/80 ${
                                                isOllama && p.state !== 'stale' ? 'bg-blue-50/10' : 
                                                p.state === 'stale' ? 'bg-amber-50/5' : ''
                                            }`}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ 
                                                opacity: p.state === 'stale' ? 0.7 : 1, 
                                                y: 0 
                                            }}
                                            transition={{ 
                                                duration: 0.3, 
                                                delay: 0.3 + (index < 10 ? index * 0.05 : 0.5), // 限制最大延迟
                                                type: 'spring',
                                                stiffness: 120,
                                                damping: 20
                                            }}
                                            whileHover={{
                                                backgroundColor: 
                                                    isOllama && p.state !== 'stale' ? 'rgba(239, 246, 255, 0.5)' : 
                                                    p.state === 'stale' ? 'rgba(254, 243, 199, 0.2)' : 
                                                    'rgba(249, 250, 251, 0.8)',
                                                opacity: p.state === 'stale' ? 0.9 : 1
                                            }}
                                        >
                                            <td className="pl-6 py-4">
                                                <motion.div
                                                    initial={{ scale: 0.9, opacity: 0.8 }}
                                                    whileHover={{ scale: 1.05, opacity: 1 }}
                                                    transition={{ duration: 0.2 }}
                                                >
                                                    <ProcessIcon name={p.name} state={p.state} />
                                                </motion.div>
                                            </td>
                                            <td className="px-6 py-4 text-gray-600 font-mono">{p.pid}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-gray-800 font-medium">{p.name}</span>
                                                        {p.state === 'stale' && (
                                                            <motion.span
                                                                initial={{ opacity: 0 }}
                                                                animate={{ opacity: 1 }}
                                                                className="px-1.5 py-0.5 text-xs rounded-full bg-amber-50 text-amber-600 border border-amber-100"
                                                            >
                                                                可能已退出
                                                            </motion.span>
                                                        )}
                                                    </div>
                                                    {isOllama && (
                                                        <span className="text-xs text-blue-500 font-medium mt-0.5 flex items-center gap-1">
                                                            <Icon.Sparkles className="w-3 h-3" />
                                                            大语言模型
                                                            {p.state === 'stale' && (
                                                                <span className="text-xs text-amber-500 ml-1">
                                                                    （已停止运行，界面即将更新）
                                                                </span>
                                                            )}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="inline-block px-2.5 py-1 bg-gray-100 text-gray-600 rounded-md">
                                                    {p.gpu_index}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex flex-col items-end">
                                                    <span className="font-medium text-gray-700">{memoryUsage.toFixed(1)} MB</span>
                                                    {memoryUsage > 1000 && (
                                                        <span className="text-xs text-gray-500 mt-0.5">
                                                            {(memoryUsage / 1024).toFixed(2)} GB
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="inline-flex items-center">
                                                    <div className="w-16 h-2 bg-gray-100 rounded-full mr-2 overflow-hidden">
                                                        <motion.div
                                                            className={`h-full ${
                                                                p.engine_usage > 70 ? 'bg-gray-600' : 
                                                                p.engine_usage > 30 ? 'bg-gray-500' : 
                                                                'bg-gray-400'
                                                            }`}
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${p.engine_usage}%` }}
                                                            transition={{ 
                                                                type: 'spring', 
                                                                stiffness: 100, 
                                                                damping: 15,
                                                                delay: 0.5 + index * 0.05
                                                            }}
                                                        />
                                                    </div>
                                                    <span className={`font-medium ${
                                                        p.engine_usage > 70 ? 'text-gray-800' : 
                                                        p.engine_usage > 30 ? 'text-gray-700' : 
                                                        'text-gray-600'
                                                    }`}>
                                                        {p.engine_usage}%
                                                    </span>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    );
                                })
                            ) : (
                                // 无进程时显示的空状态
                                <tr>
                                    <td colSpan={6} className="px-6 py-10 text-center">
                                        <motion.div 
                                            className="flex flex-col items-center"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ duration: 0.5 }}
                                        >
                                            <div className="bg-gray-50 rounded-full p-4 mb-3">
                                                <Icon.Search className="h-8 w-8 text-gray-400" strokeWidth={1.5} />
                                            </div>
                                            <p className="text-gray-500 mb-1.5">当前没有使用 GPU 的进程</p>
                                            <p className="text-xs text-gray-400">
                                                当有程序使用 GPU 资源时，将在此处列出
                                            </p>
                                        </motion.div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                
                {/* 底部装饰元素 */}
                <div className="py-3 px-6 bg-gray-50/50 border-t border-gray-100 text-xs text-gray-400 flex justify-between items-center">
                    <span>进程数据每 2 秒更新一次</span>
                    <motion.div 
                        className="flex items-center gap-1"
                        animate={{ opacity: [0.6, 1, 0.6] }}
                        transition={{ duration: 2, repeat: Infinity }}
                    >
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                        <span>实时监控中</span>
                    </motion.div>
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
    
    // 确定基于值的颜色及样式
    const getProgressColor = (val: number) => {
        if (val > 80) return 'bg-gradient-to-r from-gray-600 to-gray-700' // 高负载用深色渐变
        if (val > 50) return 'bg-gradient-to-r from-gray-500 to-gray-600' // 中负载用中色渐变
        if (val > 20) return 'bg-gradient-to-r from-gray-400 to-gray-500' // 低负载用中浅色渐变
        return 'bg-gradient-to-r from-gray-300 to-gray-400' // 很低负载用浅色渐变
    }
    
    // 根据值类型设置不同风格
    const isHighValue = numericValue !== null && numericValue > 75;
    const isMediumValue = numericValue !== null && numericValue > 40 && numericValue <= 75;
    
    return (
        <motion.div
            className="w-full rounded-xl overflow-hidden backdrop-blur-sm"
            whileHover={{ 
                scale: 1.03, 
                boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        >
            <div className="bg-white/90 shadow-md h-full p-5">
                {/* 卡片顶部：指标标签和图标 */}
                <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-500">
                        {label}
                    </span>
                    <motion.div 
                        className={`rounded-full p-2 ${
                            isHighValue ? 'bg-gray-100' : 
                            isMediumValue ? 'bg-gray-50' : 'bg-gray-50'
                        }`}
                        whileHover={{ scale: 1.1, rotate: 5 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 10 }}
                    >
                        <IconComponent 
                            className={`h-5 w-5 ${
                                isHighValue ? 'text-gray-700' : 
                                isMediumValue ? 'text-gray-600' : 'text-gray-500'
                            }`} 
                            strokeWidth={1.5} 
                        />
                    </motion.div>
                </div>
                
                {/* 卡片中部：值显示 */}
                <div className="mt-2 mb-4">
                    <div className="flex items-baseline">
                        <motion.span 
                            className={`text-2xl font-semibold ${
                                isHighValue ? 'text-gray-800' :
                                isMediumValue ? 'text-gray-700' : 'text-gray-800'
                            }`}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
                        >
                            {displayValue}
                        </motion.span>
                        {displayUnit && (
                            <span className="ml-1 text-sm text-gray-500">{displayUnit}</span>
                        )}
                    </div>
                </div>
                
                {/* 卡片底部：进度条 */}
                {progressValue !== null && (
                    <div className="relative w-full h-2 bg-gray-100 rounded-full overflow-hidden mt-auto">
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
                        {/* 进度条上的光效 */}
                        {progressValue > 0 && (
                            <motion.div 
                                className="absolute top-0 h-full w-5 bg-white/30"
                                initial={{ left: '-10%' }}
                                animate={{ left: '110%' }}
                                transition={{ 
                                    repeat: Infinity, 
                                    duration: 2, 
                                    ease: "easeInOut", 
                                    repeatDelay: 1
                                }}
                            />
                        )}
                    </div>
                )}
            </div>
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

    // 按类别分组指标
    const temperatureMetrics = metrics.filter(m => 
        m.key.includes('Temp') || m.label.includes('温度')
    );
    
    const performanceMetrics = metrics.filter(m => 
        m.key.includes('Util') || m.label.includes('利用率') || 
        m.key === 'gpuUtil' || m.key === 'vramUtil' || m.key === 'vramUsed'
    );
    
    const otherMetrics = metrics.filter(m => 
        !temperatureMetrics.includes(m) && !performanceMetrics.includes(m)
    );

    return (
        <motion.div 
            className="w-full max-w-7xl mx-auto pt-32 pb-8 px-6 md:pl-24"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
        >
            {/* 标题区域 */}
            <motion.div 
                className="mb-8 flex items-center gap-3"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
            >
                <div className="bg-white/90 rounded-full p-3 shadow-sm">
                    <Icon.BarChart3 className="h-6 w-6 text-gray-600" strokeWidth={1.5} />
                </div>
                <div>
                    <h2 className="text-xl font-medium text-gray-800">GPU 性能指标</h2>
                    <p className="text-sm text-gray-500 mt-0.5">实时监控关键硬件参数</p>
                </div>
                <motion.div 
                    className="ml-auto flex items-center gap-1.5 bg-gray-50/80 px-3 py-1 rounded-full"
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 3, repeat: Infinity }}
                >
                    <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                    <span className="text-xs text-gray-500">实时数据</span>
                </motion.div>
            </motion.div>
            
            {/* 性能指标区域 */}
            <motion.div 
                className="mb-8"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.1 }}
            >
                <div className="mb-3 ml-1 flex items-center">
                    <div className="w-1 h-5 bg-gray-700 rounded-full mr-2"></div>
                    <h3 className="text-gray-700 font-medium">性能与利用率</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {performanceMetrics.map((metric, index) => {
                        const formattedValue = formatValue(metric);
                        const unit = metric.key === 'vramUsed' ? undefined : metric.unit;

                        return (
                            <motion.div
                                key={metric.key}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ 
                                    duration: 0.4, 
                                    delay: index * 0.05, 
                                    type: 'spring',
                                    stiffness: 120,
                                    damping: 15
                                }}
                            >
                                <MetricCard
                                    icon={metric.icon}
                                    label={metric.label}
                                    value={formattedValue}
                                    unit={unit}
                                />
                            </motion.div>
                        )
                    })}
                </div>
            </motion.div>
            
            {/* 温度指标区域 */}
            <motion.div 
                className="mb-8"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
            >
                <div className="mb-3 ml-1 flex items-center">
                    <div className="w-1 h-5 bg-gray-700 rounded-full mr-2"></div>
                    <h3 className="text-gray-700 font-medium">温度监控</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {temperatureMetrics.map((metric, index) => {
                        const formattedValue = formatValue(metric);
                        const unit = metric.unit;

                        return (
                            <motion.div
                                key={metric.key}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ 
                                    duration: 0.4, 
                                    delay: 0.2 + index * 0.05, 
                                    type: 'spring',
                                    stiffness: 120,
                                    damping: 15
                                }}
                            >
                                <MetricCard
                                    icon={metric.icon}
                                    label={metric.label}
                                    value={formattedValue}
                                    unit={unit}
                                />
                            </motion.div>
                        )
                    })}
                </div>
            </motion.div>
            
            {/* 其他指标区域 */}
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
            >
                <div className="mb-3 ml-1 flex items-center">
                    <div className="w-1 h-5 bg-gray-700 rounded-full mr-2"></div>
                    <h3 className="text-gray-700 font-medium">其他参数</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {otherMetrics.map((metric, index) => {
                        const formattedValue = formatValue(metric);
                        const unit = metric.unit;

                        return (
                            <motion.div
                                key={metric.key}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ 
                                    duration: 0.4, 
                                    delay: 0.3 + index * 0.05, 
                                    type: 'spring',
                                    stiffness: 120,
                                    damping: 15
                                }}
                            >
                                <MetricCard
                                    icon={metric.icon}
                                    label={metric.label}
                                    value={formattedValue}
                                    unit={unit}
                                />
                            </motion.div>
                        )
                    })}
                </div>
            </motion.div>
        </motion.div>
    )
}


/* ---------- UI Component: Top Controls (Modern Style) ---------- */
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
    
    // 获取当前设备的其他关键信息
    const gfxVersion = selectedDevice.gfx;
    const vendor = selectedDevice.vendor;
    
    // GPU类型图标
    const renderDeviceIcon = () => {
        const isDiscrete = kind === 'Discrete';
        return (
            <div className={`rounded-full p-2 ${isDiscrete ? 'bg-gray-100' : 'bg-gray-50'}`}>
                {isDiscrete ? (
                    <Icon.Cpu className="h-5 w-5 text-gray-700" strokeWidth={1.5} />
                ) : (
                    <Icon.Microchip className="h-5 w-5 text-gray-600" strokeWidth={1.5} />
                )}
            </div>
        );
    };

    return (
        <motion.div 
            className="absolute top-0 md:left-20 left-0 right-0 h-24 md:h-20 px-6 bg-white/95 backdrop-blur-lg flex items-center justify-between z-10 shadow-md border-b border-gray-100"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, type: 'spring', stiffness: 100, damping: 20 }}
        >
            <div className="flex items-center gap-4">
                {/* GPU导航按钮组 */}
                <motion.div 
                    className="flex gap-2"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 }}
                >
                    <motion.button
                        onClick={onPrev}
                        disabled={deviceCount <= 1}
                        className="rounded-full bg-white shadow-md p-2.5 text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-all border border-gray-100 hover:border-gray-200"
                        aria-label="上一个GPU"
                        whileHover={{ scale: 1.08, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        whileTap={{ scale: 0.92 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                    >
                        <Icon.ChevronLeft className="h-5 w-5" strokeWidth={2} />
                    </motion.button>
                    <motion.button
                        onClick={onNext}
                        disabled={deviceCount <= 1}
                        className="rounded-full bg-white shadow-md p-2.5 text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-all border border-gray-100 hover:border-gray-200"
                        aria-label="下一个GPU"
                        whileHover={{ scale: 1.08, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        whileTap={{ scale: 0.92 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                    >
                        <Icon.ChevronRight className="h-5 w-5" strokeWidth={2} />
                    </motion.button>
                </motion.div>
                
                {/* GPU信息区域 */}
                <motion.div 
                    className="flex flex-col items-start pl-1"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3, duration: 0.4 }}
                >
                    <div className="flex items-center gap-2">
                        <div className="flex items-center">
                            {renderDeviceIcon()}
                            <h1 className="text-lg font-medium text-gray-900 ml-2 mr-1.5">
                                {selectedDevice.name}
                            </h1>
                        </div>
                        {kind && (
                            <motion.span 
                                className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-full border border-gray-200"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.4 }}
                            >
                                {kind}
                            </motion.span>
                        )}
                    </div>
                    
                    <div className="flex items-center text-sm text-gray-500 mt-1">
                        <span className="font-medium mr-2">
                            GPU {selectedIndex + 1} / {deviceCount}
                        </span>
                        
                        {gfxVersion && (
                            <span className="flex items-center text-xs">
                                <span className="h-3 w-px bg-gray-200 mx-1.5"></span>
                                <Icon.Tag className="h-3 w-3 mr-1" />
                                <span>{gfxVersion}</span>
                            </span>
                        )}
                        
                        {selectedDevice.subsystem && (
                            <span className="flex items-center text-xs ml-1.5">
                                <span className="h-3 w-px bg-gray-200 mx-1.5"></span>
                                <span className="opacity-75">{selectedDevice.subsystem}</span>
                            </span>
                        )}
                    </div>
                </motion.div>
            </div>
            
            <div className="flex items-center gap-5">
                {/* GPU选择器 */}
                <motion.div 
                    className="relative"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4 }}
                    whileHover={{ scale: deviceCount <= 1 ? 1 : 1.03 }}
                >
                    <div className="relative">
                        <select
                            value={selectedIndex}
                            onChange={(e) => onSelect(parseInt(e.target.value, 10))}
                            disabled={deviceCount <= 1}
                            className="
                                appearance-none rounded-lg bg-white shadow-md py-2.5 pl-4 pr-12
                                text-sm text-gray-700 hover:text-gray-900 cursor-pointer 
                                focus:ring-2 focus:ring-gray-200 focus:outline-none
                                disabled:opacity-40 disabled:cursor-not-allowed
                                transition-all duration-200 border border-gray-100
                            "
                            aria-label="选择GPU"
                        >
                            {devices.map((d, i) => (
                                <option key={i} value={i} className="text-gray-800 py-1.5">
                                    {normalize(d).name ?? `设备 ${i + 1}`}
                                </option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500">
                            <Icon.ChevronDown className="h-4 w-4" />
                        </div>
                    </div>
                    {deviceCount > 1 && (
                        <motion.div 
                            className="absolute -top-1.5 -right-1.5 bg-gray-700 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ 
                                delay: 0.6, 
                                type: 'spring',
                                stiffness: 300, 
                                damping: 15 
                            }}
                        >
                            {deviceCount}
                        </motion.div>
                    )}
                </motion.div>
                
                {/* ROCm 版本信息 */}
                {rocmVer && (
                    <motion.div 
                        className="hidden sm:flex items-center gap-3 px-3 py-1.5 bg-white/80 rounded-lg shadow-sm border border-gray-100"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        whileHover={{ scale: 1.03, backgroundColor: 'rgba(255, 255, 255, 0.95)' }}
                    >
                        <div className="flex items-center">
                            <Icon.Layers className="h-4 w-4 text-gray-500 mr-1.5" strokeWidth={1.5} />
                            <span className="text-sm font-medium text-gray-700">ROCm</span>
                        </div>
                        
                        <div className="flex items-center gap-2 text-xs bg-gray-50 px-2 py-1 rounded-md">
                            <span className="text-gray-600">SMI <span className="font-mono">{rocmVer.smi}</span></span>
                            <span className="h-3 w-px bg-gray-300"></span>
                            <span className="text-gray-600">LIB <span className="font-mono">{rocmVer.lib}</span></span>
                        </div>
                        
                        <motion.div 
                            className="w-2 h-2 rounded-full bg-green-400"
                            animate={{ 
                                scale: [1, 1.2, 1],
                                opacity: [1, 0.7, 1] 
                            }}
                            transition={{ 
                                duration: 2,
                                repeat: Infinity,
                                repeatType: "loop"
                            }}
                        />
                    </motion.div>
                )}
            </div>
        </motion.div>
    )
}

/* ---------- 客户端动画背景组件 ---------- */
// 使用客户端专用组件避免服务端渲染随机动画导致的水合问题
const LoadingBackground = () => {
    const [isClient, setIsClient] = useState(false);
    
    // 确保仅在客户端执行
    useEffect(() => {
        setIsClient(true);
    }, []);

    // 服务端或初始渲染时返回静态背景
    if (!isClient) {
        return (
            <div className="absolute inset-0 overflow-hidden bg-gray-50/30" />
        );
    }

    // 预生成固定的随机参数避免每次渲染变化
    const generateFixedRandomParams = () => {
        const items = [];
        for (let i = 0; i < 12; i++) {
            const seed = i * 0.1; // 使用固定种子
            items.push({
                initialX: 50 * i + 20,
                initialY: 30 * i + 10,
                initialScale: 0.5 + (i % 5) * 0.1,
                initialOpacity: 0.2 + (i % 4) * 0.05,
                initialRotate: (i % 7) * 4 - 12,
                
                animateX: 50 * i + (i % 3) * 15,
                animateY: 30 * i + (i % 4) * 10,
                animateOpacity: 0.15 + (i % 5) * 0.06,
                animateRotate: (i % 9) * 3 - 10
            });
        }
        return items;
    };

    const randomParams = generateFixedRandomParams();

    return (
        <div className="absolute inset-0 overflow-hidden">
            {randomParams.map((params, i) => (
                <motion.div
                    key={i}
                    className="absolute w-20 h-20 rounded-xl bg-gray-200/40"
                    initial={{
                        x: params.initialX,
                        y: params.initialY,
                        scale: params.initialScale,
                        opacity: params.initialOpacity,
                        rotate: params.initialRotate
                    }}
                    animate={{
                        x: params.animateX,
                        y: params.animateY,
                        opacity: params.animateOpacity,
                        rotate: params.animateRotate
                    }}
                    transition={{
                        duration: 15,
                        repeat: Infinity,
                        repeatType: "reverse"
                    }}
                />
            ))}
        </div>
    );
};

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
        // 记录已知的Ollama进程ID
        const knownOllamaPids = new Set<number>();
        let ollamaTimeoutIds: Record<number, NodeJS.Timeout> = {};
        
        listen<RocmPid[]>('gpu-pids-update', ({ payload }) => {
            if (Array.isArray(payload)) {
                // 处理进程状态逻辑
                const processedPayload = payload.filter(proc => proc != null).map(proc => {
                    // 检查是否包含Ollama进程
                    const isOllama = proc.name && proc.name.toLowerCase().includes('ollama');
                    
                    // 清除该进程之前的超时计时器（如果存在）
                    if (isOllama && ollamaTimeoutIds[proc.pid]) {
                        clearTimeout(ollamaTimeoutIds[proc.pid]);
                        delete ollamaTimeoutIds[proc.pid];
                    }
                    
                    // 记录新发现的Ollama进程
                    if (isOllama) {
                        knownOllamaPids.add(proc.pid);
                    }
                    
                    return proc; // 保持原始进程信息
                });
                
                // 更新进程列表
                setProcs(processedPayload);
                
                // 检查通知中是否缺少之前看到的Ollama进程
                const currentPids = new Set(payload.map(p => p.pid));
                const missingOllamaPids = [...knownOllamaPids].filter(pid => !currentPids.has(pid));
                
                // 处理消失的Ollama进程，设置延迟移除
                missingOllamaPids.forEach(pid => {
                    console.log(`Ollama进程 ${pid} 可能已退出，将在5秒后从列表中移除`);
                    
                    // 首先将进程标记为stale状态
                    setProcs(prev => 
                        prev.map(p => 
                            p.pid === pid 
                                ? { ...p, state: 'stale' } 
                                : p
                        )
                    );
                    
                    // 设置定时器，5秒后移除进程
                    if (!ollamaTimeoutIds[pid]) {
                        ollamaTimeoutIds[pid] = setTimeout(() => {
                            console.log(`移除超时的Ollama进程 ${pid}`);
                            // 从已知集合中移除
                            knownOllamaPids.delete(pid);
                            // 从进程列表中移除
                            setProcs(prev => prev.filter(p => p.pid !== pid));
                            // 清除超时计时器引用
                            delete ollamaTimeoutIds[pid];
                        }, 5000); // 5秒后移除
                    }
                });
            }
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
            
            // 清除所有Ollama进程超时计时器
            Object.values(ollamaTimeoutIds).forEach(timeoutId => {
                clearTimeout(timeoutId);
            });
            ollamaTimeoutIds = {};
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
            return (
                <motion.div 
                    className="absolute inset-0 md:left-20 flex flex-col items-center justify-center px-6 text-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                >
                    <div className="bg-white/90 rounded-xl shadow-md p-8 max-w-md backdrop-blur-sm">
                        <div className="flex justify-center mb-4">
                            <div className="rounded-full bg-red-50 p-3">
                                <Icon.AlertTriangle className="h-8 w-8 text-red-500" />
                            </div>
                        </div>
                        <h3 className="text-lg font-medium text-gray-800 mb-2">连接错误</h3>
                        <p className="text-red-600">{error}</p>
                        <button 
                            className="mt-4 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors"
                            onClick={() => window.location.reload()}
                        >
                            重新加载
                        </button>
                    </div>
                </motion.div>
            );
        }
        if (snapshot === null) {
            return (
                <motion.div 
                    className="absolute inset-0 md:left-20 flex flex-col items-center justify-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                >
                    {/* 背景元素 - 使用客户端渲染避免水合错误 */}
                    <LoadingBackground />
    
                    {/* 加载容器 */}
                    <motion.div 
                        className="relative z-10 bg-white/80 rounded-2xl shadow-xl p-8 max-w-md backdrop-blur-lg border border-gray-100"
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        transition={{ 
                            duration: 0.7, 
                            type: "spring",
                            stiffness: 100
                        }}
                    >
                        <div className="flex flex-col items-center">
                            {/* 图形化表示 */}
                            <div className="relative w-24 h-24 mb-6">
                                <motion.div 
                                    className="absolute inset-0 rounded-xl bg-gray-100 border border-gray-200"
                                    animate={{ 
                                        rotate: [0, 90, 180, 270, 360],
                                        scale: [1, 1.05, 1],
                                    }}
                                    transition={{ 
                                        duration: 8, 
                                        repeat: Infinity,
                                        ease: "linear" 
                                    }}
                                />
                                <motion.div 
                                    className="absolute inset-2 rounded-lg bg-gradient-to-br from-gray-100 via-gray-50 to-white shadow-inner"
                                    animate={{ 
                                        rotate: [0, -120, -240, -360],
                                    }}
                                    transition={{ 
                                        duration: 10, 
                                        repeat: Infinity,
                                        ease: "linear" 
                                    }}
                                />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Icon.Cpu className="h-10 w-10 text-gray-400/80" strokeWidth={1.5} />
                                </div>
                                
                                {/* 闪烁的指示灯 */}
                                <motion.div
                                    className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-400"
                                    animate={{ opacity: [1, 0.4, 1] }}
                                    transition={{ duration: 1.5, repeat: Infinity }}
                                />
                            </div>
                            
                            {/* 加载标题和文本 */}
                            <motion.h3 
                                className="text-lg font-medium text-gray-800 mb-1.5"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.3 }}
                            >
                                正在连接 GPU...
                            </motion.h3>
                            
                            <motion.p 
                                className="text-gray-500 text-sm text-center max-w-xs mb-4"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.5 }}
                            >
                                正在读取GPU设备信息并建立连接，这可能需要几秒钟时间
                            </motion.p>
                            
                            {/* 进度指示器 */}
                            <motion.div 
                                className="w-64 h-1.5 bg-gray-100 rounded-full overflow-hidden"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.7 }}
                            >
                                <motion.div 
                                    className="h-full bg-gradient-to-r from-gray-400 to-gray-600"
                                    initial={{ width: "0%" }}
                                    animate={{ width: ["0%", "30%", "60%", "90%", "90%"] }}
                                    transition={{ 
                                        duration: 8, 
                                        times: [0, 0.2, 0.4, 0.7, 1],
                                        ease: "easeInOut",
                                        repeat: Infinity,
                                        repeatType: "loop"
                                    }}
                                />
                            </motion.div>
                            
                            {/* 构建中的指示符 */}
                            <div className="flex items-center space-x-2 mt-6">
                                <div className="flex space-x-1">
                                    {[...Array(3)].map((_, i) => (
                                        <motion.div
                                            key={i}
                                            className="w-2 h-2 rounded-full bg-gray-400"
                                            animate={{ 
                                                opacity: [0.3, 1, 0.3],
                                                scale: [0.8, 1, 0.8]
                                            }}
                                            transition={{ 
                                                duration: 1.5, 
                                                repeat: Infinity, 
                                                delay: i * 0.2,
                                                ease: "easeInOut"
                                            }}
                                        />
                                    ))}
                                </div>
                                <span className="text-xs text-gray-400">等待 GPU 数据...</span>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            );
        }
        if (snapshot.length === 0) {
            return (
                <motion.div 
                    className="absolute inset-0 md:left-20 flex items-center justify-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                >
                    <div className="bg-white/90 rounded-xl shadow-md p-8 max-w-md backdrop-blur-sm">
                        <div className="flex justify-center mb-4">
                            <div className="rounded-full bg-gray-50 p-3">
                                <Icon.Search className="h-8 w-8 text-gray-400" />
                            </div>
                        </div>
                        <h3 className="text-lg font-medium text-gray-800 mb-2 text-center">未检测到 GPU 设备</h3>
                        <p className="text-gray-500 text-center">未找到支持的 AMD GPU 设备，请确认驱动已正确安装</p>
                        <div className="flex justify-center mt-6">
                            <button 
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors"
                                onClick={() => window.location.reload()}
                            >
                                重新检测
                            </button>
                        </div>
                    </div>
                </motion.div>
            );
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
        <main className="relative min-h-screen bg-gray-50 text-gray-900 overflow-x-hidden md:pl-20">
            {renderContent()}
        </main>
    );
}
