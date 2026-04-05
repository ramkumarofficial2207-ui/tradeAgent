import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { formatPct } from '../lib/format';
import { SectorTile } from '../lib/types';

export function SectorHeatmap({ sectors }: { sectors: SectorTile[] }) {
  const { theme } = useTheme();
  return (
    <View style={styles.grid}>
      {sectors.slice(0, 9).map((sector) => {
        const positive = sector.v >= 0;
        return (
          <View
            key={sector.n}
            style={[
              styles.tile,
              {
                backgroundColor: positive ? theme.successBg : theme.dangerBg,
                borderColor: positive ? `${theme.green}33` : `${theme.red}33`,
              },
            ]}
          >
            <Text style={[styles.name, { color: theme.textPrimary }]}>{sector.n}</Text>
            <Text style={[styles.value, { color: positive ? theme.green : theme.red }]}>{formatPct(sector.v)}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    width: '31%',
    minWidth: 92,
    padding: 12,
    borderWidth: 1,
    borderRadius: 16,
    gap: 4,
  },
  name: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  value: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 13,
  },
});
