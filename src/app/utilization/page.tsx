'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { motion } from 'framer-motion';
import * as Icon from 'lucide-react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';

/* ---------- 类型定义 ---------- */
type RawDevice = Record<string, unknown> & { kind?: string };
type NormalizedDevice = ReturnType<typeof normalize>;
type MetricDefinition = {
    key: keyof NormalizedDevice;
    label: string;
    icon: React.ElementType;
    unit?: string;
    precision?: number;
};

/* ---------- 数据规范化 ---------- */
function normalize(d: RawDevice | null | undefined) {
    if (!d) {
        return {
            name: 'N/A', vendor: undefined, subsystem: undefined, gfx: undefined, edgeTemp: null, hotspotTemp: null,
            memTemp: null, fanRpm: null, power: null, gpuUtil: null, vramUtil: null, vramVendor: null, kind: undefined,
            sclk: null, mclk: null, vramTotal: null, vramUsed: null, powerCap: null,
        };
    }

    const vramTotalMB = d['vram_total_mb'] as number | null ?? (d['VRAM Total Memory (B)'] ? Number(d['VRAM Total Memory (B)']) / 1_048_576 : null);
    const vramUsedMB = d['vram_used_mb'] as number | null ?? (d['VRAM Total Used Memory (B)'] ? Number(d['VRAM Total Used Memory (B)']) / 1_048_576 : null);
    let vramUtil = d['GPU Memory Allocated (VRAM%)'] as number | null;
    if (vramUtil === null && vramTotalMB && vramUsedMB !== null && vramTotalMB > 0) {
        vramUtil = Math.round((vramUsedMB / vramTotalMB) * 100);
    }

    return {
        name: d['Device Name'] as string ?? 'Unknown Device',
        vendor: d['Card Vendor'] as string | undefined,
        subsystem: d['Subsystem ID'] as string | undefined,
        gfx: d['GFX Version'] as string | undefined,
        edgeTemp: d['Temperature (Sensor edge) (C)'] as number | null,
        hotspotTemp: d['Temperature (Sensor junction) (C)'] as number | null,
        memTemp: d['Temperature (Sensor memory) (C)'] as number | null,
        fanRpm: d['Fan RPM'] as number | null,
        power: d['Average Graphics Package Power (W)'] as number | null,
        gpuUtil: d['GPU use (%)'] as number | null,
        vramUtil: vramUtil,
        vramVendor: d['GPU memory vendor'] as string | null,
        kind: d.kind as 'Discrete' | 'Integrated' | 'Unknown' | undefined,
        sclk: d['sclk clock speed:'] as number | null,
        mclk: d['mclk clock speed:'] as number | null,
        vramTotal: vramTotalMB,
        vramUsed: vramUsedMB,
        powerCap: d['Max Graphics Package Power (W)'] as number | null,
    };
}

/* ---------- 指标卡片组件 ---------- */
function MetricCard({
    icon: IconComponent,
    label,
    value,
    unit,
}: {
    icon: React.ElementType;
    label: string;
    value?: string | number | null;
    unit?: string;
}) {
    const displayValue = value ?? '--';
    const displayUnit = value !== null && value !== undefined && unit ? ` ${unit}` : '';

    // 处理数值
    const numericValue = (() => {
        // 如果值是数字，直接使用
        if (typeof value === 'number') return value;

        // 如果值是字符串但可以解析为数字
        if (typeof value === 'string') {
            // 处理可能的百分比格式 (如 "75%")
            const cleanValue = value.replace('%', '').trim();
            const parsed = parseFloat(cleanValue);
            if (!isNaN(parsed)) return parsed;
        }

        return null;
    })();

    // 确定是否显示进度条
    const showProgress = (() => {
        // 单位为%的数值一定显示进度条
        if (unit === '%' && numericValue !== null) return true;

        // GPU和VRAM利用率的关键词检查
        if (label.includes('利用率') && numericValue !== null) return true;

        // 处理"XX / YY MB (ZZ%)"格式的显存占用
        if (typeof value === 'string' && value.includes('%')) {
            const match = value.match(/\((\d+)%\)/);
            if (match && match[1]) return true;
        }

        return false;
    })();

    // 获取进度值 (0-100)
    const progressValue = (() => {
        if (!showProgress) return null;

        // 直接是百分比的情况
        if (unit === '%' && numericValue !== null) {
            return Math.min(Math.max(numericValue, 0), 100);
        }

        // 从字符串提取百分比
        if (typeof value === 'string') {
            const match = value.match(/\((\d+)%\)/);
            if (match && match[1]) {
                return Math.min(Math.max(parseFloat(match[1]), 0), 100);
            }
        }

        // 针对其他利用率，考虑是0-1.0范围的情况
        if (label.includes('利用率') && numericValue !== null) {
            if (numericValue <= 1) return numericValue * 100;
            return Math.min(Math.max(numericValue, 0), 100);
        }

        return null;
    })();

    // 确定基于值的颜色及样式
    const getProgressColor = (val: number) => {
        if (val > 80) return 'bg-gradient-to-r from-gray-600 to-gray-700'; // 高负载用深色渐变
        if (val > 50) return 'bg-gradient-to-r from-gray-500 to-gray-600'; // 中负载用中色渐变
        if (val > 20) return 'bg-gradient-to-r from-gray-400 to-gray-500'; // 低负载用中浅色渐变
        return 'bg-gradient-to-r from-gray-300 to-gray-400'; // 很低负载用浅色渐变
    };

    // 根据值类型设置不同风格
    const isHighValue = numericValue !== null && numericValue > 75;
    const isMediumValue = numericValue !== null && numericValue > 40 && numericValue <= 75;

    return (
        <motion.div
            className="w-full rounded-xl overflow-hidden backdrop-blur-lg"
            whileHover={{
                scale: 1.03,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        >
            <div className="bg-white/5 shadow-md h-full p-5 border border-white/10 rounded-xl">
                {/* 卡片顶部：指标标签和图标 */}
                <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-500">
                        {label}
                    </span>
                    <motion.div
                        className={`rounded-full p-2 ${
                            isHighValue ? 'bg-gray-500/10 border border-white/5' : 
                            isMediumValue ? 'bg-gray-500/5 border border-white/5' : 'bg-gray-500/5 border border-white/5'
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
    );
}

/* ---------- 玻璃拟态折线图组件 ---------- */
type ChartPoint = { name: string; value: number };

function GlassAreaChart({ data, title }: { data: ChartPoint[]; title: string }) {
    const chartData = useMemo(() => data, [data]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="w-full max-w-[880px] mx-auto px-4 font-sans"
        >
            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-lg shadow-[0_6px_20px_rgba(0,0,0,0.10)] overflow-hidden">
                <div className="px-7 pt-7 pb-4">
                    <h2 className="text-lg font-semibold text-gray-800 tracking-tight select-none">
                        {title}
                    </h2>
                </div>
                <div className="h-[22rem] px-2 pb-6">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={chartData}
                            margin={{ top: 18, right: 10, left: -10, bottom: 0 }}
                        >
                            <defs>
                                <linearGradient id="glassMono" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#D1D5DB" stopOpacity={0.9} />
                                    <stop offset="100%" stopColor="#D1D5DB" stopOpacity={0} />
                                </linearGradient>
                                <filter id="areaShadow" x="-15%" y="-15%" width="130%" height="130%">
                                    <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="rgba(0,0,0,0.15)" />
                                </filter>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#4B5563" strokeOpacity={0.1} />
                            <XAxis dataKey="name" stroke="#6B7280" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} />
                            <YAxis stroke="#6B7280" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} width={40} domain={[0, 100]} />
                            <Tooltip
                                cursor={{ stroke: '#9CA3AF', strokeWidth: 1, strokeDasharray: '3 3' }}
                                contentStyle={{
                                    background: 'rgba(30, 41, 59, 0.65)',
                                    backdropFilter: 'blur(16px) saturate(180%)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '12px',
                                    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.2)',
                                    padding: '10px 15px',
                                }}
                                labelStyle={{ color: '#F3F4F6', marginBottom: '6px', fontWeight: '600', fontSize: '0.875rem' }}
                                itemStyle={{ color: '#D1D5DB', fontSize: '0.8rem' }}
                                formatter={(value: number) => [`${value} %`, '利用率']}
                            />
                            <Area
                                type="monotone"
                                dataKey="value"
                                stroke="#A5B4FC"
                                strokeWidth={2.5}
                                fill="url(#glassMono)"
                                activeDot={{ r: 6, fill: '#EDE9FE', stroke: '#8B5CF6', strokeWidth: 2 }}
                                filter="url(#areaShadow)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </motion.div>
    );
}

/* ---------- 性能指标网格组件 ---------- */
function PerformanceMetricsGrid({ device }: { device: NormalizedDevice }) {
    // 性能指标定义
    const metrics: MetricDefinition[] = [
        { key: 'gpuUtil', label: 'GPU 利用率', icon: Icon.Activity, unit: '%' },
        { key: 'vramUtil', label: '显存利用率', icon: Icon.PieChart, unit: '%' },
    ];

    const formatValue = (metric: MetricDefinition) => {
        const rawValue = device[metric.key];
        if (rawValue === null || rawValue === undefined) return null;

        if (typeof rawValue === 'number') {
            return metric.precision !== undefined
                ? parseFloat(rawValue.toFixed(metric.precision))
                : rawValue;
        }

        return String(rawValue);
    };

    return (
        <div className="w-full">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {metrics.map((metric, index) => {
                    const formattedValue = formatValue(metric);
                    return (
                        <motion.div
                            key={metric.key}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                                duration: 0.4,
                                delay: index * 0.1,
                                type: 'spring',
                                stiffness: 120,
                                damping: 15
                            }}
                        >
                            <MetricCard
                                icon={metric.icon}
                                label={metric.label}
                                value={formattedValue}
                                unit={metric.unit}
                            />
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}

export default function UtilizationPage() {
    const [snapshot, setSnapshot] = useState<RawDevice[] | null>(null);
    const [selectedDeviceIndex, setSelectedDeviceIndex] = useState<number>(0);
    const [error, setError] = useState<string | null>(null);
    const [gpuHistory, setGpuHistory] = useState<ChartPoint[]>([]);
    const [vramHistory, setVramHistory] = useState<ChartPoint[]>([]);

    // 从localStorage读取选中的显卡索引
    useEffect(() => {
        try {
            const savedIndex = localStorage.getItem('selectedGpuIndex');
            if (savedIndex !== null) {
                const parsedIndex = parseInt(savedIndex, 10);
                setSelectedDeviceIndex(parsedIndex);
                console.log("从存储中恢复显卡选择:", parsedIndex);
            }
        } catch (err) {
            console.error("无法从本地存储读取显卡选择:", err);
        }
    }, []);

    // 当选中的显卡改变时，保存到localStorage
    useEffect(() => {
        try {
            localStorage.setItem('selectedGpuIndex', selectedDeviceIndex.toString());
            console.log("已保存显卡选择:", selectedDeviceIndex);
        } catch (err) {
            console.error("无法保存显卡选择到本地存储:", err);
        }
    }, [selectedDeviceIndex]);
    
    // 处理显卡切换
    const handleDeviceChange = (index: number) => {
        if (snapshot && index < snapshot.length) {
            console.log(`切换显卡: 从 ${selectedDeviceIndex} 到 ${index}`);
            
            // 清空历史数据
            setGpuHistory([]);
            setVramHistory([]);
            
            // 更新选中的显卡索引
            setSelectedDeviceIndex(index);
            
            // 立即使用当前数据更新图表，避免等待下一次事件
            if (snapshot && snapshot.length > index) {
                const device = normalize(snapshot[index]);
                const label = new Date().toLocaleTimeString('zh-CN', { minute: '2-digit', second: '2-digit' });
                
                // 设置初始点
                setGpuHistory([{ name: label, value: device.gpuUtil ?? 0 }]);
                setVramHistory([{ name: label, value: device.vramUtil ?? 0 }]);
                
                console.log(`已初始化新图表数据 - GPU利用率: ${device.gpuUtil}, 显存利用率: ${device.vramUtil}`);
            }
        }
    };

    // 处理数据更新逻辑，与selectedDeviceIndex分离
    const updateDeviceData = React.useCallback((payload: RawDevice[] | null) => {
        if (payload && Array.isArray(payload) && payload.length > 0) {
            const idx = Math.min(selectedDeviceIndex, payload.length - 1);
            
            // 只有当设备索引有效时才更新数据
            if (idx >= 0 && idx < payload.length) {
                const device = normalize(payload[idx]);
                const label = new Date().toLocaleTimeString('zh-CN', { minute: '2-digit', second: '2-digit' });
                console.log(`更新图表数据 - 显卡 ${idx}, GPU利用率: ${device.gpuUtil}, 显存利用率: ${device.vramUtil}`);
                
                setGpuHistory(prev => [...prev.slice(-19), { name: label, value: device.gpuUtil ?? 0 }]);
                setVramHistory(prev => [...prev.slice(-19), { name: label, value: device.vramUtil ?? 0 }]);
            }
        }
    }, [selectedDeviceIndex]);
    
    // 设置监听器和初始化数据
    useEffect(() => {
        console.log(`设置GPU数据监听器 (当前选中显卡: ${selectedDeviceIndex})`);
        let unlistenGpu: (() => void) | null = null;
    
        listen<RawDevice[]>('gpu-update', ({ payload }) => {
            // 更新快照状态
            setSnapshot(prevSnapshot => {
                if (payload && Array.isArray(payload)) {
                    const newLength = payload.length;
                    let newIndex = selectedDeviceIndex;
    
                    // 如果索引无效，重置为0
                    if (selectedDeviceIndex >= newLength && newLength > 0) {
                        newIndex = 0;
                    } else if (newLength === 0) {
                        newIndex = 0;
                    }
    
                    if (newIndex !== selectedDeviceIndex) {
                        setSelectedDeviceIndex(newIndex);
                    }
    
                    setError(null);
                    
                    // 更新图表数据
                    updateDeviceData(payload);
                    
                    return payload;
                } else if (payload === null || payload === undefined) {
                    setError(null);
                    setSelectedDeviceIndex(0);
                    return [];
                }
    
                return prevSnapshot;
            });
        })
        .then(fn => {
            console.log("GPU数据监听器已设置");
            unlistenGpu = fn;
        })
        .catch(err => {
            console.error("设置GPU数据监听器失败:", err);
            setError("无法监听GPU更新事件");
            setSnapshot([]);
            setSelectedDeviceIndex(0);
        });
    
        // 清理函数
        return () => {
            console.log("清理GPU数据监听器");
            if (unlistenGpu) {
                unlistenGpu();
                console.log("GPU数据监听器已移除");
            }
        };
    }, [updateDeviceData]); // 只依赖updateDeviceData，它已经依赖了selectedDeviceIndex

    // 处理当前选中的设备数据
    const selectedDeviceData = React.useMemo(() => {
        if (!snapshot || snapshot.length === 0 || selectedDeviceIndex >= snapshot.length) {
            return normalize(null);
        }
        return normalize(snapshot[selectedDeviceIndex]);
    }, [snapshot, selectedDeviceIndex]);

    // 渲染错误状态
    const renderError = () => (
        <motion.div
            className="p-8 rounded-3xl shadow-md backdrop-blur-lg border border-red-200/20 bg-gradient-to-br from-red-50/80 to-red-50/60"
            initial={{ opacity: 0, y: 15, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 100, damping: 15 }}
        >
            <div className="flex items-center gap-4 mb-3">
                <motion.div
                    className="flex items-center justify-center w-12 h-12 rounded-xl bg-red-100/80 text-red-500 border border-red-200/50"
                    initial={{ rotate: -10, scale: 0.9 }}
                    animate={{ rotate: 0, scale: 1 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                >
                    <Icon.AlertCircle className="h-7 w-7" />
                </motion.div>
                <motion.h3 
                    className="font-semibold text-xl text-red-700"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15, duration: 0.4 }}
                >
                    连接错误
                </motion.h3>
            </div>
            
            <motion.p 
                className="ml-16 text-red-700/90 mb-5"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.4 }}
            >
                {error}
            </motion.p>
            
            <motion.div
                className="ml-16"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.4 }}
            >
                <motion.button
                    className="px-5 py-2.5 bg-red-100/80 hover:bg-red-200/90 rounded-xl text-red-700 font-medium transition-all border border-red-200/30 shadow-sm flex items-center gap-2"
                    onClick={() => window.location.reload()}
                    whileHover={{ scale: 1.03, x: 3 }}
                    whileTap={{ scale: 0.97 }}
                >
                    <Icon.RefreshCw className="w-4 h-4" />
                    <span>重新加载</span>
                </motion.button>
            </motion.div>
        </motion.div>
    );

    // 渲染加载状态
    const renderLoading = () => (
        <motion.div
            className="p-10 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-lg shadow-[0_6px_20px_rgba(0,0,0,0.10)] flex items-center justify-center min-h-[300px]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ 
                opacity: 1, 
                y: 0,
                transition: {
                    type: "spring",
                    stiffness: 90,
                    damping: 15
                }
            }}
        >
            <div className="text-center">
                {/* 加载动画容器 */}
                <motion.div 
                    className="relative w-20 h-20 mx-auto mb-6"
                    initial={{ rotate: 0 }}
                    animate={{ 
                        rotate: 360,
                        transition: { 
                            duration: 20, 
                            ease: "linear", 
                            repeat: Infinity 
                        }
                    }}
                >
                    {/* 轨道背景 */}
                    <div className="absolute inset-0 rounded-full border-4 border-gray-200/30 backdrop-blur-sm"></div>
                    
                    {/* 外圈 */}
                    <motion.div 
                        className="absolute inset-0 rounded-full border-4 border-t-indigo-400 border-r-transparent border-b-transparent border-l-transparent"
                        initial={{ rotate: 0 }}
                        animate={{ 
                            rotate: 360,
                            transition: { 
                                duration: 1.5, 
                                ease: "linear", 
                                repeat: Infinity 
                            }
                        }}
                    ></motion.div>
                    
                    {/* 中圈 */}
                    <motion.div 
                        className="absolute inset-2 rounded-full border-4 border-r-blue-400 border-t-transparent border-b-transparent border-l-transparent"
                        initial={{ rotate: 0 }}
                        animate={{ 
                            rotate: -360,
                            transition: { 
                                duration: 3, 
                                ease: "linear", 
                                repeat: Infinity 
                            }
                        }}
                    ></motion.div>
                    
                    {/* 内圈 */}
                    <motion.div 
                        className="absolute inset-4 rounded-full border-4 border-b-cyan-400 border-t-transparent border-r-transparent border-l-transparent"
                        initial={{ rotate: 0 }}
                        animate={{ 
                            rotate: 480,
                            transition: { 
                                duration: 2, 
                                ease: "linear", 
                                repeat: Infinity 
                            }
                        }}
                    ></motion.div>
                    
                    {/* 中心点 */}
                    <motion.div 
                        className="absolute inset-0 flex items-center justify-center"
                        animate={{ 
                            scale: [0.8, 1.1, 0.8],
                            opacity: [0.7, 1, 0.7],
                            transition: { 
                                duration: 2,
                                ease: "easeInOut", 
                                repeat: Infinity,
                            }
                        }}
                    >
                        <div className="h-4 w-4 rounded-full bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.6)]"></div>
                    </motion.div>
                </motion.div>
                
                {/* 加载文字 */}
                <motion.p 
                    className="text-gray-600 text-lg font-medium mb-1"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ 
                        opacity: 1, 
                        y: 0,
                        transition: {
                            delay: 0.2,
                            duration: 0.5
                        }
                    }}
                >
                    正在加载 GPU 数据...
                </motion.p>
                
                <motion.p 
                    className="text-gray-400 text-sm"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ 
                        opacity: 1, 
                        y: 0,
                        transition: {
                            delay: 0.4,
                            duration: 0.5
                        }
                    }}
                >
                    <span>请稍候，正在收集系统信息</span>
                    <motion.span
                        animate={{
                            opacity: [0, 1, 0],
                            transition: {
                                duration: 1.5,
                                repeat: Infinity,
                                ease: "easeInOut"
                            }
                        }}
                    >
                        ...
                    </motion.span>
                </motion.p>
            </div>
        </motion.div>
    );

    // 渲染无设备状态
    const renderNoDevices = () => (
        <motion.div
            className="p-10 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-lg shadow-[0_6px_20px_rgba(0,0,0,0.10)] text-center min-h-[300px] flex flex-col items-center justify-center"
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 80, damping: 15 }}
        >
            <motion.div 
                className="relative mb-6"
                initial={{ y: -10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            >
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-100/50 to-amber-50/30 backdrop-blur-sm flex items-center justify-center border border-amber-200/30">
                    <Icon.AlertCircle className="h-10 w-10 text-amber-500" />
                </div>
                
                {/* 装饰元素 */}
                <motion.div 
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-amber-200/40 backdrop-blur-sm border border-amber-300/30"
                    animate={{
                        y: [0, -8, 0],
                        opacity: [0.7, 1, 0.7],
                        scale: [0.9, 1.1, 0.9]
                    }}
                    transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                />
                <motion.div 
                    className="absolute -bottom-1 -left-3 w-4 h-4 rounded-full bg-amber-300/40 backdrop-blur-sm border border-amber-400/30"
                    animate={{
                        y: [0, 6, 0],
                        x: [0, -3, 0],
                        opacity: [0.6, 0.9, 0.6],
                        scale: [0.8, 1, 0.8]
                    }}
                    transition={{
                        duration: 2.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: 0.5
                    }}
                />
            </motion.div>
            
            <motion.h3 
                className="font-semibold text-xl text-gray-800 mb-3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5 }}
            >
                未检测到 GPU 设备
            </motion.h3>
            
            <motion.p 
                className="text-gray-500 max-w-md mx-auto mb-6"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5 }}
            >
                未找到支持的 AMD GPU 设备，请确认驱动已正确安装
            </motion.p>
            
            <motion.button
                className="px-5 py-2.5 bg-gradient-to-r from-amber-50/80 to-amber-100/80 hover:from-amber-100/90 hover:to-amber-200/90 rounded-xl text-amber-700 font-medium transition-all border border-amber-200/30 shadow-sm flex items-center gap-2"
                onClick={() => window.location.reload()}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                whileHover={{ scale: 1.03, x: 3 }}
                whileTap={{ scale: 0.97 }}
            >
                <Icon.RefreshCw className="w-4 h-4" />
                <span>重新检测</span>
            </motion.button>
        </motion.div>
    );

    // 渲染主内容
    const renderMainContent = () => (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <motion.div
                className="xl:col-span-2"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4 }}
            >
                           <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-lg shadow-[0_6px_20px_rgba(0,0,0,0.10)] overflow-hidden p-7 mb-6">
                               <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                   {/* 左侧：标题和GPU信息 */}
                                   <div className="flex items-start">
                                       <div className="bg-gradient-to-br from-indigo-400/10 to-blue-400/10 p-3 rounded-xl mr-4 shadow-sm backdrop-blur-sm border border-white/10">
                                           <Icon.Cpu className="w-6 h-6 text-indigo-500" />
                                       </div>
                                       <div>
                                           <h2 className="text-xl font-semibold text-gray-800 mb-1 tracking-tight select-none">设备信息</h2>
                                           {snapshot && snapshot.length > 0 && (
                                               <p className="text-sm text-gray-500">{selectedDeviceData.vendor || '未知厂商'}</p>
                                           )}
                                       </div>
                                   </div>
                                   
                                   {/* 显卡选择器 */}
                                   {snapshot && snapshot.length > 1 && (
                                       <div className="flex items-center gap-3">
                                           <span className="text-sm text-gray-500">选择显卡:</span>
                                           <div className="flex gap-2">
                                               {snapshot.map((device, index) => {
                                                   const deviceName = device['Device Name'] as string ?? `GPU ${index}`;
                                                   const shortName = deviceName.length > 12 
                                                       ? deviceName.substring(0, 12) + '...' 
                                                       : deviceName;
                                                   
                                                   return (
                                                       <motion.button
                                                           key={index}
                                                           className={`px-3 py-2 rounded-lg text-sm font-medium transition-all backdrop-blur-sm
                                                               ${index === selectedDeviceIndex 
                                                                   ? 'bg-indigo-500/10 text-indigo-600 border border-indigo-200/20 shadow-md' 
                                                                   : 'bg-gray-500/5 text-gray-600 border border-white/10 hover:bg-gray-500/10'
                                                               }`}
                                                           onClick={() => handleDeviceChange(index)}
                                                           whileHover={{ scale: 1.03 }}
                                                           whileTap={{ scale: 0.98 }}
                                                       >
                                                           <div className="flex items-center gap-1.5">
                                                               <Icon.Monitor className="w-3.5 h-3.5" />
                                                               <span>{index === 0 ? '显卡 0' : '显卡 1'}</span>
                                                           </div>
                                                           <div className="text-xs opacity-75 mt-0.5 text-left">
                                                               {shortName}
                                                           </div>
                                                       </motion.button>
                                                   );
                                               })}
                                           </div>
                                       </div>
                                   )}
                                   
                                   {/* 右侧：设备状态和详情 */}
                                   {snapshot && snapshot.length > 0 && (
                                       <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mt-2 md:mt-0">
                                           {/* 设备类型指示 */}
                                           <div className="flex items-center px-3 py-2 bg-gray-500/5 rounded-lg backdrop-blur-sm border border-white/10 shadow-sm">
                                               <Icon.Layers className="w-4 h-4 text-gray-500 mr-2" />
                                               <span className="text-sm font-medium text-gray-600">
                                                   {selectedDeviceData.kind === 'Discrete' ? '独立显卡' : 
                                                    selectedDeviceData.kind === 'Integrated' ? '集成显卡' : 'GPU设备'}
                                               </span>
                                           </div>
                                           
                                           {/* 设备状态和名称 */}
                                           <div className="flex items-center gap-2 bg-gradient-to-r from-gray-500/5 to-gray-600/5 py-2 px-4 rounded-lg border border-white/10 shadow-sm backdrop-blur-sm">
                                               <div className="flex h-3.5 w-3.5 items-center justify-center">
                                                   <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse"></div>
                                               </div>
                                               <span className="text-sm font-medium text-gray-700">
                                                   {selectedDeviceData.name}
                                               </span>
                                           </div>
                                       </div>
                                   )}
                               </div>
                               
                               {/* 详细信息部分 */}
                               {snapshot && snapshot.length > 0 && (
                                   <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-white/10">
                                       {/* GFX版本 */}
                                       <div className="flex items-center bg-gray-500/5 rounded-xl p-3 backdrop-blur-sm border border-white/5">
                                           <div className="w-10 h-10 rounded-full bg-blue-400/10 flex items-center justify-center mr-3 border border-blue-400/10 shadow-inner">
                                               <Icon.Database className="w-5 h-5 text-blue-500" />
                                           </div>
                                           <div>
                                               <p className="text-xs text-gray-500 font-medium">GFX版本</p>
                                               <p className="text-sm font-semibold text-gray-700">{selectedDeviceData.gfx || '未知'}</p>
                                           </div>
                                       </div>
                                       
                                       {/* 显存大小 */}
                                       <div className="flex items-center bg-gray-500/5 rounded-xl p-3 backdrop-blur-sm border border-white/5">
                                           <div className="w-10 h-10 rounded-full bg-indigo-400/10 flex items-center justify-center mr-3 border border-indigo-400/10 shadow-inner">
                                               <Icon.Database className="w-5 h-5 text-indigo-500" />
                                           </div>
                                           <div>
                                               <p className="text-xs text-gray-500 font-medium">显存容量</p>
                                               <p className="text-sm font-semibold text-gray-700">
                                                   {selectedDeviceData.vramTotal ? `${selectedDeviceData.vramTotal.toFixed(0)} MB` : '未知'}
                                               </p>
                                           </div>
                                       </div>
                                       
                                       {/* 功耗上限 */}
                                       <div className="flex items-center bg-gray-500/5 rounded-xl p-3 backdrop-blur-sm border border-white/5">
                                           <div className="w-10 h-10 rounded-full bg-emerald-400/10 flex items-center justify-center mr-3 border border-emerald-400/10 shadow-inner">
                                               <Icon.Zap className="w-5 h-5 text-emerald-500" />
                                           </div>
                                           <div>
                                               <p className="text-xs text-gray-500 font-medium">功耗上限</p>
                                               <p className="text-sm font-semibold text-gray-700">
                                                   {selectedDeviceData.powerCap ? `${selectedDeviceData.powerCap} W` : '未知'}
                                               </p>
                                           </div>
                                       </div>
                                   </div>
                               )}
                </div>
            </motion.div>

            <motion.div
                className="xl:col-span-1"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.4 }}
            >
                <GlassAreaChart title="GPU 利用率趋势" data={gpuHistory} />
            </motion.div>

            <motion.div
                className="xl:col-span-1"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.4 }}
            >
                <GlassAreaChart title="显存利用率趋势" data={vramHistory} />
            </motion.div>

            <motion.div
                className="xl:col-span-2"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.4 }}
            >
                <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-lg shadow-[0_6px_20px_rgba(0,0,0,0.10)] p-7">
                    <div className="flex items-center mb-6">
                        <div className="bg-gradient-to-br from-gray-400/10 to-gray-500/10 p-3 rounded-xl mr-4 shadow-sm backdrop-blur-sm border border-white/10">
                            <Icon.Activity className="w-5 h-5 text-gray-600" />
                        </div>
                        <h2 className="text-lg font-semibold text-gray-800 tracking-tight select-none">实时性能指标</h2>
                    </div>
                    <PerformanceMetricsGrid device={selectedDeviceData} />
                </div>
            </motion.div>
        </div>
    );

    // 主渲染逻辑
    const renderContent = () => {
        if (error) return renderError();
        if (snapshot === null) return renderLoading();
        if (snapshot.length === 0) return renderNoDevices();
        return renderMainContent();
    };

    return (
        <div className="py-6 px-6 md:px-8 lg:px-10 max-w-screen-2xl mx-auto">
            <motion.div
                className="flex items-center justify-between mb-6"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
            >
                <h1 className="text-2xl font-bold text-gray-800">系统资源利用率</h1>

                <motion.div
                    className="flex items-center gap-2"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <span className="text-sm text-gray-500">数据刷新</span>
                    <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
                </motion.div>
            </motion.div>

            {renderContent()}
        </div>
    );
}