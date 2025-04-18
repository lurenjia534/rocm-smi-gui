'use client'

import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

type RocmCheckResult = {
    path?: string
    version?: {
        'ROCM-SMI version': string
        'ROCM-SMI-LIB version': string
    }
}

export default function Home() {
    const [text, setText] = useState('正在调用…')

    useEffect(() => {
        invoke<RocmCheckResult>('check_rocm_smi')
            .then((res) => setText(JSON.stringify(res, null, 2)))
            .catch((err) => setText('调用失败：' + err))
    }, [])

    return (
        <main className="min-h-screen flex items-center justify-center bg-neutral-900 text-neutral-100">
            <pre>{text}</pre>
        </main>
    )
}
