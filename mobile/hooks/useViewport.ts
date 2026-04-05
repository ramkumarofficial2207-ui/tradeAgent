import { useWindowDimensions } from 'react-native';

export function useViewport() {
  const { width, height } = useWindowDimensions();
  return {
    width,
    height,
    isCompact: width < 360,
    isPhone: width < 480,
    isTablet: width >= 768,
    isLargeTablet: width >= 1024,
    columns: width >= 1024 ? 3 : width >= 768 ? 2 : 1,
  };
}
