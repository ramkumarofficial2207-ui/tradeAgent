import { useEffect, useState } from 'react'

interface ViewportState {
    width: number
    isTablet: boolean
    isMobile: boolean
    isPhone: boolean
}

function readWidth(): number {
    if (typeof window === 'undefined') return 1280
    return window.innerWidth
}

export function useViewport(): ViewportState {
    const [width, setWidth] = useState(readWidth)

    useEffect(() => {
        const onResize = () => setWidth(readWidth())
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [])

    return {
        width,
        isTablet: width <= 960,
        isMobile: width <= 768,
        isPhone: width <= 480,
    }
}
