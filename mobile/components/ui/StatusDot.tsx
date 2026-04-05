import { View } from 'react-native';

export function StatusDot({ color }: { color: string }) {
  return <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: color }} />;
}
