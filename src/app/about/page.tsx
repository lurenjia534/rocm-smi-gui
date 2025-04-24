'use client'

import React from 'react'
import { motion } from 'framer-motion'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Command,
  ExternalLink,
  Github,
  Layers,
  Thermometer
} from 'lucide-react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

// 动画变体配置
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 100,
      damping: 15
    }
  }
}

// 卡片组件
const FeatureCard = ({ 
  icon: Icon, 
  title, 
  description, 
  url,
  delay = 0 
}: { 
  icon: React.ElementType
  title: string
  description: string
  url?: string
  delay?: number
}) => (
  <motion.div
    className="bg-white rounded-xl p-6 shadow-md hover:shadow-lg transition-all"
    whileHover={{ y: -4, scale: 1.02 }}
    variants={itemVariants}
    transition={{ delay }}
  >
    <div className="flex gap-4">
      <div className="flex-shrink-0 h-12 w-12 rounded-lg bg-gray-100 flex items-center justify-center">
        <Icon className="h-6 w-6 text-gray-700" strokeWidth={1.5} />
      </div>
      <div className="flex-1">
        <h3 className="text-lg font-medium text-gray-800">{title}</h3>
        <p className="mt-2 text-gray-600 leading-relaxed">{description}</p>
        
        {url && (
          <Link href={url}>
            <span className="mt-4 inline-flex items-center text-sm font-medium text-gray-800 hover:text-gray-900">
              了解更多 <ArrowRight className="ml-1 h-4 w-4" />
            </span>
          </Link>
        )}
      </div>
    </div>
  </motion.div>
)

// 技术栈项目
const TechItem = ({ 
  name, 
  description, 
  url 
}: { 
  name: string
  description: string
  url: string
}) => (
  <motion.div 
    className="flex items-start gap-3 py-3 px-4 rounded-lg hover:bg-gray-50 transition-colors"
    whileHover={{ x: 4 }}
  >
    <div className="flex-1">
      <div className="flex items-center gap-2">
        <h4 className="font-medium text-gray-800">{name}</h4>
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
          技术框架
        </span>
      </div>
      <p className="text-sm text-gray-600 mt-1">{description}</p>
    </div>
    <a 
      href={url} 
      target="_blank" 
      rel="noopener noreferrer"
      className="flex-shrink-0 text-gray-500 hover:text-gray-800 transition-colors"
    >
      <ExternalLink className="h-5 w-5" />
    </a>
  </motion.div>
)

export default function AboutPage() {
  usePathname();
  return (
    <main className="min-h-screen bg-gray-50 pb-24 md:pl-24">
      {/* 顶部标题区域 */}
      <div className="pt-6 pb-16 px-6 md:px-12 md:pt-32">
        <motion.div 
          className="max-w-4xl mx-auto"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center gap-4 mb-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gray-100">
              <Layers size={28} className="text-gray-700" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900">GPU 监控仪表板</h1>
          </div>
          
          <p className="text-xl text-gray-600 leading-relaxed">
            这是一个基于 Tauri 构建的 AMD GPU 监控应用程序，提供图形化界面显示 GPU 性能指标，方便观察和分析 GPU 状态。
          </p>
        </motion.div>
      </div>
      
      {/* 内容区域 */}
      <div className="px-6 max-w-7xl mx-auto">
        {/* 功能特性部分 */}
        <motion.section
          className="mb-20"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <h2 className="text-2xl font-bold text-gray-800 mb-8">主要功能</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FeatureCard 
              icon={Activity}
              title="性能监控"
              description="实时监控 GPU 使用率、显存占用和频率，直观展示 GPU 工作状态和负载水平。"
              url="/utilization"
              delay={0.1}
            />
            
            <FeatureCard 
              icon={Thermometer}
              title="温度监控"
              description="跟踪 GPU 核心温度、内存温度和热点温度，预防过热问题。"
              url="/temperature"
              delay={0.2}
            />
            
            <FeatureCard 
              icon={Command}
              title="多 GPU 支持"
              description="支持多个 GPU 设备的并行监控，轻松切换查看不同显卡的状态。"
              delay={0.3}
            />
            
            <FeatureCard 
              icon={AlertTriangle}
              title="故障检测"
              description="自动检测 GPU 异常状态，如温度过高、显存泄漏等问题，并给出提示。"
              delay={0.4}
            />
          </div>
        </motion.section>
        
        {/* 技术栈部分 */}
        <motion.section
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.3 }}
        >
          <h2 className="text-2xl font-bold text-gray-800 mb-6">技术栈</h2>
          
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="divide-y divide-gray-100">
              <TechItem 
                name="Tauri"
                description="Rust + Web 技术构建的跨平台应用框架，提供更小的二进制体积和更高的性能"
                url="https://tauri.app"
              />
              
              <TechItem 
                name="React"
                description="用于构建用户界面的 JavaScript 库，采用组件化开发提高代码复用性和维护性"
                url="https://react.dev"
              />
              
              <TechItem 
                name="Next.js"
                description="React 框架，提供服务端渲染、静态站点生成等功能，优化应用性能和开发体验"
                url="https://nextjs.org"
              />
              
              <TechItem 
                name="Framer Motion"
                description="React 动画库，用于创建流畅、自然的用户界面动画效果"
                url="https://www.framer.com/motion"
              />
              
              <TechItem 
                name="Tailwind CSS"
                description="原子化 CSS 框架，提供高度可定制的设计系统，加速 UI 开发"
                url="https://tailwindcss.com"
              />
              
              <TechItem 
                name="Recharts"
                description="基于 React 的图表库，用于数据可视化，展示 GPU 性能变化趋势"
                url="https://recharts.org"
              />
            </div>
            
            <div className="mt-8 flex justify-center">
              <a 
                href="https://github.com" 
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-5 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                <Github className="mr-2 h-5 w-5" />
                <span>查看项目源码</span>
              </a>
            </div>
          </div>
        </motion.section>
      </div>
    </main>
  )
}